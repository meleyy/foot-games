const SITE_API_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

export function createEspnClient({ requestDelayMs = 150 } = {}) {
  let lastRequestAt = 0;

  async function fetchJson(path) {
    const waitMs = Math.max(0, requestDelayMs - (Date.now() - lastRequestAt));

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    lastRequestAt = Date.now();

    const response = await fetch(`${SITE_API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`ESPN API returned HTTP ${response.status} for ${path}.`);
    }

    return response.json();
  }

  async function fetchTeams() {
    const payload = await fetchJson("/teams");
    const teams = payload?.sports?.[0]?.leagues?.[0]?.teams ?? [];

    return teams
      .map((entry) => entry.team)
      .filter((team) => team?.id && team?.displayName)
      .map((team) => ({
        id: Number(team.id),
        name: team.displayName,
        code: team.abbreviation ?? null,
        country: team.displayName,
      }));
  }

  async function fetchRoster(teamId) {
    const payload = await fetchJson(`/teams/${teamId}/roster`);
    return payload?.athletes ?? [];
  }

  return {
    fetchTeams,
    fetchRoster,
  };
}

export function positionCode(abbreviation) {
  const code = String(abbreviation ?? "").toUpperCase();

  if (code === "G") {
    return "GK";
  }

  if (code === "D") {
    return "DF";
  }

  if (code === "M") {
    return "MF";
  }

  if (code === "F") {
    return "FW";
  }

  return null;
}

export function normalizeEspnPlayer(athlete, teamId) {
  const name = athlete.displayName ?? athlete.fullName;

  if (!name || !Number.isFinite(Number(athlete.id))) {
    return null;
  }

  const shirtNumber = Number(athlete.jersey);

  return {
    id: Number(athlete.id),
    teamId,
    name: String(name),
    age: Number.isFinite(athlete.age) ? athlete.age : null,
    number: Number.isFinite(shirtNumber) ? shirtNumber : null,
    position: athlete.position?.displayName ?? athlete.position?.name ?? null,
    positionCode: positionCode(athlete.position?.abbreviation),
    rating: null,
    appearances: 0,
    minutesPlayed: 0,
  };
}
