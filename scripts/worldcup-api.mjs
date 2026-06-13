const API_BASE_URL = "https://api.worldcupapi.com";
const WORLD_CUP_GROUPS = "ABCDEFGHIJKL".split("");

export function createWorldCupClient({
  apiKey,
  lang = "fr",
  requestDelayMs = 200,
}) {
  if (!apiKey?.trim()) {
    throw new Error("WORLDCUP_API_KEY is missing.");
  }

  let lastRequestAt = 0;

  async function fetchApi(path, params = {}, attempt = 1) {
    const waitMs = Math.max(0, requestDelayMs - (Date.now() - lastRequestAt));

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    lastRequestAt = Date.now();

    const url = new URL(path, API_BASE_URL);
    url.searchParams.set("key", apiKey.trim());

    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(name, String(value));
      }
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 429 && attempt <= 3) {
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const retryDelayMs = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : 5_000;

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return fetchApi(path, params, attempt + 1);
    }

    const payload = await response.json();

    if (!payload?.success) {
      throw new Error(`World Cup API: ${payload?.error ?? `HTTP ${response.status}`}`);
    }

    return payload.data;
  }

  return {
    fetchApi,
    lang,
    groups: WORLD_CUP_GROUPS,
  };
}

function pickFirst(entry, keys) {
  for (const key of keys) {
    const value = entry?.[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function normalizeTeam(entry, group) {
  const nested = entry?.team ?? entry;
  const id = Number(
    pickFirst(nested, ["team_id", "teamId", "id", "teamID"]),
  );
  const name = pickFirst(nested, [
    "team_name",
    "teamName",
    "name",
    "team",
    "title",
  ]);

  if (!Number.isFinite(id) || !name) {
    return null;
  }

  return {
    id,
    name: String(name),
    code:
      pickFirst(nested, ["team_code", "code", "short_name", "shortName"]) ??
      null,
    country:
      pickFirst(nested, ["country", "country_name", "countryName"]) ??
      String(name),
    group: pickFirst(entry, ["group", "group_name", "groupName"]) ?? group,
  };
}

function standingRows(data) {
  if (Array.isArray(data)) {
    return data;
  }

  return (
    data?.standings ??
    data?.table ??
    data?.teams ??
    data?.rows ??
    data?.group ??
    []
  );
}

export function extractTeamsFromStandings(data, group) {
  return standingRows(data)
    .map((entry) => normalizeTeam(entry, group))
    .filter(Boolean);
}

function fixtureTeams(data) {
  const matches = Array.isArray(data)
    ? data
    : (data?.fixtures ?? data?.matches ?? data?.results ?? []);

  const teams = [];

  for (const match of matches) {
    for (const side of ["home", "away", "home_team", "away_team"]) {
      const team = match?.[side];

      if (team && typeof team === "object") {
        const normalized = normalizeTeam(team, pickFirst(match, ["group"]));

        if (normalized) {
          teams.push(normalized);
        }
      }
    }

    const homeId = pickFirst(match, ["home_team_id", "homeTeamId", "home_id"]);
    const awayId = pickFirst(match, ["away_team_id", "awayTeamId", "away_id"]);
    const homeName = pickFirst(match, ["home_team_name", "homeTeam", "home"]);
    const awayName = pickFirst(match, ["away_team_name", "awayTeam", "away"]);

    if (homeId && homeName && typeof homeName === "string") {
      teams.push(
        normalizeTeam(
          { team_id: homeId, team_name: homeName, group: match?.group },
          match?.group,
        ),
      );
    }

    if (awayId && awayName && typeof awayName === "string") {
      teams.push(
        normalizeTeam(
          { team_id: awayId, team_name: awayName, group: match?.group },
          match?.group,
        ),
      );
    }
  }

  return teams.filter(Boolean);
}

export function extractTeamsFromFixtures(data) {
  return fixtureTeams(data);
}

function squadPlayers(data) {
  if (Array.isArray(data)) {
    return data;
  }

  return (
    data?.players ??
    data?.squad ??
    data?.members ??
    data?.roster ??
    data?.team?.players ??
    []
  );
}

export function extractPlayersFromSquad(data, teamId) {
  const team =
    normalizeTeam(data?.team ?? data, pickFirst(data, ["group"])) ?? null;

  return squadPlayers(data)
    .map((entry) => {
      const nested = entry?.player ?? entry;
      const id = Number(pickFirst(nested, ["player_id", "playerId", "id"]));
      const name = pickFirst(nested, ["player_name", "playerName", "name"]);

      if (!Number.isFinite(id) || !name) {
        return null;
      }

      const position =
        pickFirst(nested, ["position", "role", "position_name", "positionName"]) ??
        null;
      const shirtNumber = Number(
        pickFirst(nested, [
          "shirt_number",
          "shirtNumber",
          "number",
          "jersey_number",
          "jerseyNumber",
        ]),
      );
      const age = Number(pickFirst(nested, ["age"]));
      const goals = Number(pickFirst(nested, ["goals", "goals_scored"]));
      const appearances = Number(
        pickFirst(nested, ["appearances", "matches", "games", "caps"]),
      );
      const minutesPlayed = Number(
        pickFirst(nested, ["minutes", "minutes_played", "minutesPlayed"]),
      );
      const rating = Number(
        pickFirst(nested, ["rating", "average_rating", "averageRating"]),
      );

      return {
        id,
        teamId: team?.id ?? teamId,
        name: String(name),
        age: Number.isFinite(age) ? age : null,
        number: Number.isFinite(shirtNumber) ? shirtNumber : null,
        position,
        rating: Number.isFinite(rating) ? rating : null,
        goals: Number.isFinite(goals) ? goals : null,
        appearances: Number.isFinite(appearances) ? appearances : 0,
        minutesPlayed: Number.isFinite(minutesPlayed) ? minutesPlayed : 0,
      };
    })
    .filter(Boolean);
}

export function extractGoalscorers(data) {
  const rows = Array.isArray(data)
    ? data
    : (data?.goalscorers ?? data?.players ?? data?.scorers ?? []);

  const byPlayerId = new Map();

  for (const entry of rows) {
    const nested = entry?.player ?? entry;
    const id = Number(pickFirst(nested, ["player_id", "playerId", "id"]));

    if (!Number.isFinite(id)) {
      continue;
    }

    const goals = Number(
      pickFirst(entry, ["goals", "goals_scored", "total_goals"]) ??
        pickFirst(nested, ["goals", "goals_scored"]),
    );
    const appearances = Number(
      pickFirst(entry, ["appearances", "matches", "games"]) ??
        pickFirst(nested, ["appearances", "matches", "games"]),
    );

    byPlayerId.set(id, {
      goals: Number.isFinite(goals) ? goals : null,
      appearances: Number.isFinite(appearances) ? appearances : null,
    });
  }

  return byPlayerId;
}

export async function discoverTeams(client) {
  const teamsById = new Map();

  for (const group of client.groups) {
    const data = await client.fetchApi("/standings", {
      group,
      lang: client.lang,
    });

    for (const team of extractTeamsFromStandings(data, group)) {
      teamsById.set(team.id, team);
    }
  }

  if (teamsById.size > 0) {
    return [...teamsById.values()];
  }

  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 20) {
    const data = await client.fetchApi("/fixtures", {
      page,
      lang: client.lang,
    });
    const matches = Array.isArray(data)
      ? data
      : (data?.fixtures ?? data?.matches ?? []);

    for (const team of extractTeamsFromFixtures(data)) {
      teamsById.set(team.id, team);
    }

    hasMore = matches.length > 0;
    page += 1;
  }

  return [...teamsById.values()];
}
