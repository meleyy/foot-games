import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildOnlineMatchResult,
  formationById,
  simulateKnockoutMatch,
  squadBySlot,
  teamProfile,
} from "./knockout-simulation.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildParticipant(id: string, name: string, formationId: string, assignments: Record<string, unknown>) {
  const formation = formationById(formationId);
  const squad = squadBySlot(formation, assignments);
  return {
    id,
    name,
    squad,
    profile: teamProfile(squad),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { match_id: matchId, player_id: playerId } = await req.json();

    if (!matchId || !playerId) {
      return new Response(JSON.stringify({ error: "match_id et player_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: match, error } = await supabase
      .from("online_matches")
      .select("*")
      .eq("id", matchId)
      .maybeSingle();

    if (error || !match) {
      return new Response(JSON.stringify({ error: "match introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (playerId !== match.player_a_id && playerId !== match.player_b_id) {
      return new Response(JSON.stringify({ error: "joueur non autorise" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (match.status === "result" && match.result) {
      return new Response(JSON.stringify({ result: match.result, status: "result" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!match.player_a_assignments || !match.player_b_assignments) {
      return new Response(JSON.stringify({ error: "draft incomplet" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const home = buildParticipant(
      match.player_a_id,
      match.player_a_name,
      match.player_a_formation,
      match.player_a_assignments,
    );
    const away = buildParticipant(
      match.player_b_id,
      match.player_b_name,
      match.player_b_formation,
      match.player_b_assignments,
    );

    const simulated = simulateKnockoutMatch(home, away);
    const result = buildOnlineMatchResult(home, away, simulated);

    const { error: updateError } = await supabase
      .from("online_matches")
      .update({ status: "result", result })
      .eq("id", matchId)
      .is("result", null);

    if (updateError) {
      throw updateError;
    }

    const { data: statsResult, error: statsError } = await supabase.rpc("apply_online_match_stats", {
      p_match_id: matchId,
    });

    if (statsError) {
      console.error("apply_online_match_stats", statsError.message);
    }

    return new Response(
      JSON.stringify({ result: statsResult ?? result, status: "result" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "erreur serveur";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
