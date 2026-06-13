const API_BASE_URL = "https://drop-api.ea.com/rating/ea-sports-fc";
const PAGE_SIZE = 100;

export function createEaRatingsClient({ requestDelayMs = 100 } = {}) {
  let lastRequestAt = 0;

  async function fetchPage(offset = 0, limit = PAGE_SIZE, params = {}) {
    const waitMs = Math.max(0, requestDelayMs - (Date.now() - lastRequestAt));

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    lastRequestAt = Date.now();

    const url = new URL(API_BASE_URL);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(name, String(value));
      }
    }

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`EA Ratings API returned HTTP ${response.status}.`);
    }

    return response.json();
  }

  async function fetchAllPlayers(onProgress) {
    const players = [];
    let offset = 0;
    let totalItems = Infinity;

    while (offset < totalItems) {
      const page = await fetchPage(offset, PAGE_SIZE);
      totalItems = page.totalItems;
      players.push(...page.items);
      offset += PAGE_SIZE;

      if (onProgress) {
        onProgress(players.length, totalItems);
      }
    }

    return players;
  }

  async function fetchPlayersByNationality(nationalityId) {
    const players = [];
    let offset = 0;
    let totalItems = Infinity;

    while (offset < totalItems) {
      const page = await fetchPage(offset, PAGE_SIZE, {
        nationality: nationalityId,
      });
      totalItems = page.totalItems;
      players.push(...page.items);
      offset += PAGE_SIZE;
    }

    return players;
  }

  return {
    fetchPage,
    fetchAllPlayers,
    fetchPlayersByNationality,
  };
}

export function playerDisplayName(player) {
  if (player.commonName?.trim()) {
    return player.commonName.trim();
  }

  return [player.firstName, player.lastName].filter(Boolean).join(" ").trim();
}

export function parseAge(birthdate) {
  if (!birthdate) {
    return null;
  }

  const date = new Date(birthdate);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }

  return age;
}

export function positionGroup(shortLabel) {
  const label = String(shortLabel ?? "").toUpperCase();

  if (label === "GK") {
    return "GK";
  }

  if (["SW", "RWB", "RB", "RCB", "CB", "LCB", "LB", "LWB"].includes(label)) {
    return "DF";
  }

  if (
    ["RDM", "CDM", "LDM", "RM", "RCM", "CM", "LCM", "LM", "RAM", "CAM", "LAM"].includes(
      label,
    )
  ) {
    return "MF";
  }

  if (
    ["RF", "CF", "LF", "RW", "RS", "ST", "LS", "LW"].includes(label)
  ) {
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

export function isMensPlayer(player) {
  return player.gender?.id === 0 || player.gender?.label === "Men's Football";
}

export function normalizePlayer(player, teamId) {
  const name = playerDisplayName(player);

  if (!name || !Number.isFinite(player.id)) {
    return null;
  }

  return {
    id: player.id,
    teamId,
    name,
    age: parseAge(player.birthdate),
    number: null,
    position: player.position?.shortLabel ?? player.position?.label ?? null,
    positionCode: positionGroup(player.position?.shortLabel),
    rating: normalizeRating(player.overallRating),
    potential: null,
    appearances: 0,
    minutesPlayed: 0,
    club: player.team?.label ?? null,
    overallRating: player.overallRating,
  };
}

export function normalizeNationalTeam(nationality) {
  return {
    id: nationality.id,
    name: nationality.label,
    code: null,
    country: nationality.label,
  };
}

export function groupPlayersByNationality(players, { squadSize = 26 } = {}) {
  const teamsById = new Map();
  const playersByNation = new Map();

  for (const player of players) {
    if (!isMensPlayer(player) || !player.nationality?.id) {
      continue;
    }

    const nationId = player.nationality.id;

    if (!teamsById.has(nationId)) {
      teamsById.set(nationId, normalizeNationalTeam(player.nationality));
    }

    const bucket = playersByNation.get(nationId) ?? [];
    bucket.push(player);
    playersByNation.set(nationId, bucket);
  }

  const teams = [];
  const normalizedPlayers = [];

  for (const [nationId, nationPlayers] of playersByNation) {
    const sorted = [...nationPlayers].sort(
      (left, right) => right.overallRating - left.overallRating,
    );
    const selected = squadSize > 0 ? sorted.slice(0, squadSize) : sorted;
    const team = teamsById.get(nationId);

    teams.push(team);

    for (const player of selected) {
      const normalized = normalizePlayer(player, nationId);

      if (normalized) {
        normalizedPlayers.push(normalized);
      }
    }
  }

  teams.sort((left, right) => left.name.localeCompare(right.name));

  return { teams, players: normalizedPlayers };
}

export function normalizeName(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
