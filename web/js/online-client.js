import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config.js";

const PLAYER_ID_KEY = "foot-games-player-id";

export function getOrCreatePlayerId() {
  const existing = sessionStorage.getItem(PLAYER_ID_KEY);

  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  sessionStorage.setItem(PLAYER_ID_KEY, id);
  return id;
}

function createSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export async function fetchActiveOnlineMatch(playerId = getOrCreatePlayerId()) {
  const supabase = createSupabase();
  const { data, error } = await supabase.rpc("heartbeat_matchmaking_queue", {
    p_player_id: playerId,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data?.status === "matched" && data.match_id) {
    const { data: match, error: matchError } = await supabase
      .from("online_matches")
      .select("status")
      .eq("id", data.match_id)
      .maybeSingle();

    if (matchError || !match || !["draft", "resolving"].includes(match.status)) {
      return null;
    }

    return { matchId: data.match_id, resumed: Boolean(data.resumed) };
  }

  return null;
}

export class OnlineClient {
  /**
   * @param {object} handlers
   * @param {(match: object) => void} handlers.onMatchUpdate
   * @param {(message: string) => void} [handlers.onError]
   */
  constructor(handlers) {
    this.handlers = handlers;
    this.playerId = getOrCreatePlayerId();
    this.supabase = createSupabase();
    /** @type {import("@supabase/supabase-js").RealtimeChannel | null} */
    this.channel = null;
    /** @type {number | null} */
    this.heartbeatTimer = null;
    this.activeMatchId = null;
    /** @type {object | null} */
    this.lastKnownMatch = null;
  }

  emitMatchUpdate(match) {
    this.lastKnownMatch = { ...(this.lastKnownMatch ?? {}), ...match };
    this.handlers.onMatchUpdate?.(this.lastKnownMatch);
  }

  async joinQueue(displayName) {
    const { data, error } = await this.supabase.rpc("join_matchmaking_queue", {
      p_player_id: this.playerId,
      p_display_name: displayName,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data?.status === "matched" && data.match_id) {
      await this.watchMatch(data.match_id);
      return { status: "matched", matchId: data.match_id, resumed: Boolean(data.resumed) };
    }

    this.startQueueHeartbeat();
    return { status: "waiting" };
  }

  startQueueHeartbeat() {
    this.stopQueueHeartbeat();
    this.heartbeatTimer = window.setInterval(async () => {
      const { data, error } = await this.supabase.rpc("heartbeat_matchmaking_queue", {
        p_player_id: this.playerId,
      });

      if (error) {
        this.handlers.onError?.(error.message);
        return;
      }

      if (data?.status === "matched" && data.match_id) {
        await this.watchMatch(data.match_id);
      }
    }, 2500);
  }

  stopQueueHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async leaveQueue() {
    this.stopQueueHeartbeat();
    await this.supabase.rpc("leave_matchmaking_queue", {
      p_player_id: this.playerId,
    });
  }

  async watchMatch(matchId) {
    this.stopQueueHeartbeat();
    this.activeMatchId = matchId;
    this.unsubscribe();

    const { data: match, error } = await this.supabase
      .from("online_matches")
      .select("*")
      .eq("id", matchId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (match) {
      this.emitMatchUpdate(match);
    }

    this.channel = this.supabase
      .channel(`online-match:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "online_matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const next = payload.new;
          if (next) {
            this.emitMatchUpdate(next);
          }
        },
      )
      .subscribe();
  }

  unsubscribe() {
    if (this.channel) {
      void this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  async saveDraftProgress({ matchId, formationId, draftState }) {
    const { error } = await this.supabase.rpc("save_online_draft_progress", {
      p_match_id: matchId,
      p_player_id: this.playerId,
      p_formation_id: formationId,
      p_draft_state: draftState,
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  async checkDraftExpiry(matchId) {
    const { data, error } = await this.supabase.rpc("check_online_draft_expiry", {
      p_match_id: matchId,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data?.status && data.status !== "draft") {
      const { data: match, error: fetchError } = await this.supabase
        .from("online_matches")
        .select("*")
        .eq("id", matchId)
        .maybeSingle();

      if (!fetchError && match) {
        this.emitMatchUpdate(match);
      } else {
        this.emitMatchUpdate({
          id: matchId,
          status: data.status,
          result: data.result ?? null,
        });
      }
    }

    return data;
  }

  async submitDraft({ matchId, formationId, assignments }) {
    const { data, error } = await this.supabase.rpc("submit_online_draft", {
      p_match_id: matchId,
      p_player_id: this.playerId,
      p_formation_id: formationId,
      p_assignments: assignments,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data?.both_ready || data?.status === "resolving") {
      await this.resolveMatch(matchId);
    }

    return data;
  }

  async resolveMatch(matchId) {
    const { data, error } = await this.supabase.functions.invoke("resolve-online-match", {
      body: {
        match_id: matchId,
        player_id: this.playerId,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data?.result) {
      this.emitMatchUpdate({
        id: matchId,
        status: data.status ?? "result",
        result: data.result,
      });
    }

    return data;
  }

  isPlayerA(match) {
    return match.player_a_id === this.playerId;
  }

  youName(match) {
    return this.isPlayerA(match) ? match.player_a_name : match.player_b_name;
  }

  opponentName(match) {
    return this.isPlayerA(match) ? match.player_b_name : match.player_a_name;
  }

  youSubmitted(match) {
    return this.isPlayerA(match)
      ? Boolean(match.player_a_submitted_at)
      : Boolean(match.player_b_submitted_at);
  }

  opponentSubmitted(match) {
    return this.isPlayerA(match)
      ? Boolean(match.player_b_submitted_at)
      : Boolean(match.player_a_submitted_at);
  }

  yourDraftState(match) {
    return this.isPlayerA(match) ? match.player_a_draft_state : match.player_b_draft_state;
  }

  async disconnect() {
    this.stopQueueHeartbeat();
    this.unsubscribe();
    await this.leaveQueue();
    this.activeMatchId = null;
    this.lastKnownMatch = null;
  }
}
