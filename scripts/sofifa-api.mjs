const API_BASE_URL = "https://api.sofifa.net";

const POSITION_NAMES = {
  0: "GK",
  1: "SW",
  2: "RWB",
  3: "RB",
  4: "RCB",
  5: "CB",
  6: "LCB",
  7: "LB",
  8: "LWB",
  9: "RDM",
  10: "CDM",
  11: "LDM",
  12: "RM",
  13: "RCM",
  14: "CM",
  15: "LCM",
  16: "LM",
  17: "RAM",
  18: "CAM",
  19: "LAM",
  20: "RF",
  21: "CF",
  22: "LF",
  23: "RW",
  24: "RS",
  25: "ST",
  26: "LS",
  27: "LW",
};

export function createSofifaClient({ requestDelayMs = 1100 } = {}) {
  let lastRequestAt = 0;

  async function fetchApi(path, attempt = 1) {
    const waitMs = Math.max(0, requestDelayMs - (Date.now() - lastRequestAt));

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    lastRequestAt = Date.now();

    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        Origin: "https://sofifa.com",
        Referer: "https://sofifa.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 429 && attempt <= 3) {
      await new Promise((resolve) => setTimeout(resolve, 65_000));
      return fetchApi(path, attempt + 1);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      const preview = (await response.text()).slice(0, 120);

      if (preview.includes("Cloudflare") || response.status === 403) {
        throw new Error(
          "SoFIFA API blocked by Cloudflare from this network. " +
            "Run the import locally or request API access on sofifa.com/document.",
        );
      }

      throw new Error(`SoFIFA API returned HTTP ${response.status}.`);
    }

    const payload = await response.json();
    return payload.data;
  }

  return { fetchApi };
}

export function pickLatestRoster(leagues) {
  const candidates = leagues
    .map((league) => league.latestRoster)
    .filter(Boolean);

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => Number(right) - Number(left))[0];
}

export function extractNationalTeams(teams) {
  return teams.filter((team) => team.type === "national");
}

export function playerDisplayName(player) {
  return (
    player.commonName?.trim() ||
    [player.firstName, player.lastName].filter(Boolean).join(" ").trim()
  );
}

export function positionLabel(positionCode) {
  return POSITION_NAMES[positionCode] ?? null;
}

export function positionGroup(positionCode) {
  if (positionCode === 0) {
    return "GK";
  }

  if (positionCode >= 1 && positionCode <= 8) {
    return "DF";
  }

  if (positionCode >= 9 && positionCode <= 19) {
    return "MF";
  }

  if (positionCode >= 20 && positionCode <= 27) {
    return "FW";
  }

  return null;
}

export function normalizeRating(overallRating) {
  const rating = Number(overallRating);

  if (!Number.isFinite(rating)) {
    return null;
  }

  return Math.round((rating / 10) * 100) / 100;
}

export function normalizePlayer(player, teamId) {
  const positionCode = Number(player.position1);
  const overallRating = Number(player.overallRating);
  const jerseyNumber = Number(player.jerseyNumber);

  if (!Number.isFinite(player.id)) {
    return null;
  }

  const name = playerDisplayName(player);

  if (!name) {
    return null;
  }

  return {
    id: player.id,
    teamId,
    name,
    age: Number.isFinite(Number(player.age)) ? Number(player.age) : null,
    number: Number.isFinite(jerseyNumber) ? jerseyNumber : null,
    position: positionLabel(positionCode),
    positionCode: positionGroup(positionCode),
    rating: normalizeRating(overallRating),
    potential: Number.isFinite(Number(player.potential))
      ? Number(player.potential)
      : null,
    appearances: 0,
    minutesPlayed: 0,
  };
}

export function normalizeTeam(team) {
  if (!Number.isFinite(team.id) || !team.name) {
    return null;
  }

  return {
    id: team.id,
    name: team.name,
    code: null,
    country: team.country ?? team.name,
  };
}

export function normalizeName(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function fetchNationalTeams(client, roster) {
  const teams = await client.fetchApi(`/teams/${roster}`);
  return extractNationalTeams(teams).map(normalizeTeam).filter(Boolean);
}

export async function fetchTeamSquad(client, teamId) {
  const team = await client.fetchApi(`/team/${teamId}`);
  const normalizedTeam = normalizeTeam(team);

  if (!normalizedTeam) {
    return null;
  }

  const players = (team.players ?? [])
    .map((player) => normalizePlayer(player, normalizedTeam.id))
    .filter(Boolean);

  return {
    team: normalizedTeam,
    players,
  };
}

export async function discoverLatestRoster(client) {
  const leagues = await client.fetchApi("/leagues");
  const roster = pickLatestRoster(leagues);

  if (!roster) {
    throw new Error("SoFIFA API did not return a roster ID.");
  }

  return roster;
}

export function extractNationalTeamFromPlayer(player) {
  const national = (player.teams ?? []).find((team) => team.type === "national");

  if (national?.name) {
    return {
      id: Number(national.id) || stableTeamId(national.name),
      name: national.name,
      country: national.country ?? national.name,
      jerseyNumber: Number.isFinite(Number(national.jerseyNumber))
        ? Number(national.jerseyNumber)
        : null,
    };
  }

  if (player.country) {
    return {
      id: Number(player.countryId) || stableTeamId(player.country),
      name: player.country,
      country: player.country,
      jerseyNumber: Number.isFinite(Number(player.jerseyNumber))
        ? Number(player.jerseyNumber)
        : null,
    };
  }

  return null;
}

function stableTeamId(value) {
  let hash = 0;

  for (const char of String(value)) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  }

  return Math.abs(hash);
}

export function normalizeCustomizedPlayer(player) {
  const team = extractNationalTeamFromPlayer(player);
  const positionCode = Number(player.position1);
  const name = playerDisplayName(player);

  if (!Number.isFinite(player.id) || !name || !team) {
    return null;
  }

  return {
    player: {
      id: player.id,
      teamId: team.id,
      name,
      age: Number.isFinite(Number(player.age)) ? Number(player.age) : null,
      number:
        team.jerseyNumber ??
        (Number.isFinite(Number(player.jerseyNumber))
          ? Number(player.jerseyNumber)
          : null),
      position: positionLabel(positionCode),
      positionCode: positionGroup(positionCode),
      rating: normalizeRating(player.overallRating),
      potential: Number.isFinite(Number(player.potential))
        ? Number(player.potential)
        : null,
      appearances: 0,
      minutesPlayed: 0,
    },
    team: normalizeTeam({
      id: team.id,
      name: team.name,
      country: team.country,
      type: "national",
    }),
  };
}

export async function fetchCustomizedPlayers(client, apiToken) {
  const players = await client.fetchApi(`/customizedPlayers/${apiToken}`);
  const teamsById = new Map();
  const normalizedPlayers = [];

  for (const player of players) {
    const entry = normalizeCustomizedPlayer(player);

    if (!entry) {
      continue;
    }

    teamsById.set(entry.team.id, entry.team);
    normalizedPlayers.push(entry.player);
  }

  return {
    teams: [...teamsById.values()],
    players: normalizedPlayers,
  };
}
