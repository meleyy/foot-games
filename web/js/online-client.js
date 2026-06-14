import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config.js";

const PLAYER_ID_KEY = "foot-games-player-id";

function createSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export async function ensureOnlinePlayerId(supabase = createSupabase()) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user?.id) {
    sessionStorage.setItem(PLAYER_ID_KEY, session.user.id);
    return session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (!error && data.user?.id) {
    sessionStorage.setItem(PLAYER_ID_KEY, data.user.id);
    return data.user.id;
  }

  const existing = sessionStorage.getItem(PLAYER_ID_KEY);
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  sessionStorage.setItem(PLAYER_ID_KEY, id);
  return id;
}

export function getOrCreatePlayerId() {
  return sessionStorage.getItem(PLAYER_ID_KEY) ?? crypto.randomUUID();
}

export async function fetchActiveOnlineMatch(playerId) {
  const supabase = createSupabase();
  const resolvedPlayerId = playerId ?? (await ensureOnlinePlayerId(supabase));
  const { data, error } = await supabase.rpc("heartbeat_matchmaking_queue", {
    p_player_id: resolvedPlayerId,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data?.status === "matched" && data.match_id) {
    const { data: match, error: matchError } = await supabase.rpc("get_online_match", {
      p_match_id: data.match_id,
      p_player_id: resolvedPlayerId,
    });

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
    this.supabase = createSupabase();
    this.playerId = null;
    this.ready = this.bootstrap();
    /** @type {import("@supabase/supabase-js").RealtimeChannel | null} */
    this.channel = null;
    /** @type {number | null} */
    this.heartbeatTimer = null;
    this.activeMatchId = null;
    /** @type {number | null} */
    this.pollTimer = null;
    /** @type {object | null} */
    this.lastKnownMatch = null;
  }

  async bootstrap() {
    this.playerId = await ensureOnlinePlayerId(this.supabase);
  }

  async ensureReady() {
    await this.ready;
  }

  emitMatchUpdate(match) {
    this.lastKnownMatch = { ...(this.lastKnownMatch ?? {}), ...match };
    this.handlers.onMatchUpdate?.(this.lastKnownMatch);
  }

  async fetchPlayerStats() {
    await this.ensureReady();
    const { data, error } = await this.supabase.rpc("get_online_player_stats", {
      p_player_id: this.playerId,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async fetchMatchHistory(limit = 8) {
    await this.ensureReady();
    const { data, error } = await this.supabase.rpc("get_online_match_history", {
      p_player_id: this.playerId,
      p_limit: limit,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data?.matches ?? [];
  }

  async joinQueue(displayName) {
    await this.ensureReady();
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
      await this.ensureReady();
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
    await this.ensureReady();
    this.stopQueueHeartbeat();
    await this.supabase.rpc("leave_matchmaking_queue", {
      p_player_id: this.playerId,
    });
  }

  async fetchMatch(matchId) {
    await this.ensureReady();
    const { data, error } = await this.supabase.rpc("get_online_match", {
      p_match_id: matchId,
      p_player_id: this.playerId,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async watchMatch(matchId) {
    await this.ensureReady();
    this.stopQueueHeartbeat();
    this.activeMatchId = matchId;
    this.unsubscribe();

    const match = await this.fetchMatch(matchId);

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

    this.startMatchPolling(matchId);
  }

  unsubscribe() {
    this.stopMatchPolling();
    if (this.channel) {
      void this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  async saveDraftProgress({ matchId, formationId, draftState }) {
    await this.ensureReady();
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
    await this.ensureReady();
    const { data, error } = await this.supabase.rpc("check_online_draft_expiry", {
      p_match_id: matchId,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data?.status && data.status !== "draft") {
      const match = await this.fetchMatch(matchId);

      if (match) {
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
    await this.ensureReady();
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
    await this.ensureReady();
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
      const match = await this.fetchMatch(matchId);

      if (match) {
        this.emitMatchUpdate(match);
      } else {
        this.emitMatchUpdate({
          id: matchId,
          status: data.status ?? "result",
          result: data.result,
        });
      }
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
    await this.ensureReady();
    this.stopQueueHeartbeat();
    this.unsubscribe();
    await this.leaveQueue();
    this.activeMatchId = null;
    this.lastKnownMatch = null;
  }

  stopMatchPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  startMatchPolling(matchId) {
    this.stopMatchPolling();
    this.pollTimer = window.setInterval(async () => {
      try {
        const match = await this.fetchMatch(matchId);
        if (match) {
          this.emitMatchUpdate(match);
        }
      } catch {
        // Ignore transient polling errors.
      }
    }, 3000);
  }
}
