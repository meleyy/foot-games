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
      return { status: "matched", matchId: data.match_id };
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
      this.handlers.onMatchUpdate?.(match);
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
            this.handlers.onMatchUpdate?.(next);
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
      this.handlers.onMatchUpdate?.({
        id: matchId,
        status: "result",
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

  async disconnect() {
    this.stopQueueHeartbeat();
    this.unsubscribe();
    await this.leaveQueue();
    this.activeMatchId = null;
  }
}
