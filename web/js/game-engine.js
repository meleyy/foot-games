/** @typedef {{ api_id: number, name: string, position?: string, position_code?: string, rating: number, shirt_number?: number | null, teamName?: string, nation?: string }} Player */
/** @typedef {{ id: string, role: string, label: string, x: number, y: number }} Slot */
/** @typedef {{ id: string, label: string, slots: Slot[] }} Formation */

export const FORMATIONS = /** @type {Formation[]} */ ([
  {
    id: "4-3-3",
    label: "4-3-3",
    slots: [
      { id: "gk", role: "GK", label: "GK", x: 50, y: 92 },
      { id: "lb", role: "DF", label: "LB", x: 15, y: 74 },
      { id: "lcb", role: "DF", label: "LCB", x: 32, y: 76 },
      { id: "rcb", role: "DF", label: "RCB", x: 68, y: 76 },
      { id: "rb", role: "DF", label: "RB", x: 85, y: 74 },
      { id: "lcm", role: "MF", label: "LCM", x: 32, y: 52 },
      { id: "cm", role: "MF", label: "CM", x: 50, y: 50 },
      { id: "rcm", role: "MF", label: "RCM", x: 68, y: 52 },
      { id: "lw", role: "FW", label: "LW", x: 16, y: 26 },
      { id: "st", role: "FW", label: "ST", x: 50, y: 22 },
      { id: "rw", role: "FW", label: "RW", x: 84, y: 26 },
    ],
  },
  {
    id: "4-4-2",
    label: "4-4-2",
    slots: [
      { id: "gk", role: "GK", label: "GK", x: 50, y: 92 },
      { id: "lb", role: "DF", label: "LB", x: 15, y: 74 },
      { id: "lcb", role: "DF", label: "LCB", x: 32, y: 76 },
      { id: "rcb", role: "DF", label: "RCB", x: 68, y: 76 },
      { id: "rb", role: "DF", label: "RB", x: 85, y: 74 },
      { id: "lm", role: "MF", label: "LM", x: 15, y: 50 },
      { id: "lcm", role: "MF", label: "LCM", x: 36, y: 52 },
      { id: "rcm", role: "MF", label: "RCM", x: 64, y: 52 },
      { id: "rm", role: "MF", label: "RM", x: 85, y: 50 },
      { id: "lst", role: "FW", label: "LS", x: 38, y: 23 },
      { id: "rst", role: "FW", label: "RS", x: 62, y: 23 },
    ],
  },
  {
    id: "4-2-3-1",
    label: "4-2-3-1",
    slots: [
      { id: "gk", role: "GK", label: "GK", x: 50, y: 92 },
      { id: "lb", role: "DF", label: "LB", x: 15, y: 74 },
      { id: "lcb", role: "DF", label: "LCB", x: 32, y: 76 },
      { id: "rcb", role: "DF", label: "RCB", x: 68, y: 76 },
      { id: "rb", role: "DF", label: "RB", x: 85, y: 74 },
      { id: "cdm1", role: "MF", label: "CDM", x: 40, y: 60 },
      { id: "cdm2", role: "MF", label: "CDM", x: 60, y: 60 },
      { id: "lam", role: "MF", label: "CAM", x: 22, y: 42 },
      { id: "cam", role: "MF", label: "CAM", x: 50, y: 40 },
      { id: "ram", role: "MF", label: "CAM", x: 78, y: 42 },
      { id: "st", role: "FW", label: "ST", x: 50, y: 22 },
    ],
  },
  {
    id: "3-5-2",
    label: "3-5-2",
    slots: [
      { id: "gk", role: "GK", label: "GK", x: 50, y: 92 },
      { id: "lcb", role: "DF", label: "LCB", x: 24, y: 77 },
      { id: "cb", role: "DF", label: "CB", x: 50, y: 78 },
      { id: "rcb", role: "DF", label: "RCB", x: 76, y: 77 },
      { id: "lwb", role: "MF", label: "LM", x: 8, y: 54 },
      { id: "lcm", role: "MF", label: "LCM", x: 32, y: 52 },
      { id: "cm", role: "MF", label: "CM", x: 50, y: 50 },
      { id: "rcm", role: "MF", label: "RCM", x: 68, y: 52 },
      { id: "rwb", role: "MF", label: "RM", x: 92, y: 54 },
      { id: "lst", role: "FW", label: "LS", x: 38, y: 23 },
      { id: "rst", role: "FW", label: "RS", x: 62, y: 23 },
    ],
  },
  {
    id: "3-4-3",
    label: "3-4-3",
    slots: [
      { id: "gk", role: "GK", label: "GK", x: 50, y: 92 },
      { id: "lcb", role: "DF", label: "LCB", x: 24, y: 77 },
      { id: "cb", role: "DF", label: "CB", x: 50, y: 78 },
      { id: "rcb", role: "DF", label: "RCB", x: 76, y: 77 },
      { id: "lm", role: "MF", label: "LM", x: 15, y: 50 },
      { id: "lcm", role: "MF", label: "LCM", x: 36, y: 52 },
      { id: "rcm", role: "MF", label: "RCM", x: 64, y: 52 },
      { id: "rm", role: "MF", label: "RM", x: 85, y: 50 },
      { id: "lw", role: "FW", label: "LW", x: 16, y: 26 },
      { id: "st", role: "FW", label: "ST", x: 50, y: 22 },
      { id: "rw", role: "FW", label: "RW", x: 84, y: 26 },
    ],
  },
  {
    id: "4-1-4-1",
    label: "4-1-4-1",
    slots: [
      { id: "gk", role: "GK", label: "GK", x: 50, y: 92 },
      { id: "lb", role: "DF", label: "LB", x: 15, y: 74 },
      { id: "lcb", role: "DF", label: "LCB", x: 32, y: 76 },
      { id: "rcb", role: "DF", label: "RCB", x: 68, y: 76 },
      { id: "rb", role: "DF", label: "RB", x: 85, y: 74 },
      { id: "cdm", role: "MF", label: "CDM", x: 50, y: 60 },
      { id: "lm", role: "MF", label: "LM", x: 15, y: 44 },
      { id: "lcm", role: "MF", label: "LCM", x: 36, y: 46 },
      { id: "rcm", role: "MF", label: "RCM", x: 64, y: 46 },
      { id: "rm", role: "MF", label: "RM", x: 85, y: 44 },
      { id: "st", role: "FW", label: "ST", x: 50, y: 22 },
    ],
  },
]);

const POSITION_HINTS = {
  GK: ["GK", "GOAL"],
  DF: ["DF", "CB", "LB", "RB", "DEF", "BACK"],
  MF: ["MF", "CM", "DM", "AM", "MID"],
  FW: ["FW", "ST", "CF", "LW", "RW", "ATT", "FOR"],
};

const ROLE_ORDER = { GK: 0, DF: 1, MF: 2, FW: 3 };

const GENERIC_POSITION_NAMES = new Set([
  "GOALKEEPER",
  "DEFENDER",
  "MIDFIELDER",
  "FORWARD",
]);

const POSITION_LABELS = {
  GK: "GK",
  SW: "SW",
  RWB: "RWB",
  RB: "RB",
  RCB: "RCB",
  CB: "CB",
  LCB: "LCB",
  LB: "LB",
  LWB: "LWB",
  RDM: "CDM",
  CDM: "CDM",
  LDM: "CDM",
  RM: "RM",
  RCM: "RCM",
  CM: "CM",
  LCM: "LCM",
  LM: "LM",
  RAM: "CAM",
  CAM: "CAM",
  LAM: "CAM",
  RF: "RW",
  CF: "ST",
  LF: "LW",
  RW: "RW",
  RS: "ST",
  ST: "ST",
  LS: "LW",
  LW: "LW",
  DF: "CB",
  MF: "CM",
  FW: "ST",
};

const POSITION_LABEL_ORDER = [
  "GK",
  "SW",
  "LB",
  "LWB",
  "LCB",
  "CB",
  "RCB",
  "RB",
  "RWB",
  "DF",
  "CDM",
  "LM",
  "LCM",
  "CM",
  "RCM",
  "RM",
  "MF",
  "CAM",
  "LW",
  "ST",
  "FW",
  "RW",
];

const POSITION_LABEL_RANK = Object.fromEntries(
  POSITION_LABEL_ORDER.map((label, index) => [label, index]),
);

function specificPositionCode(player) {
  const pos = (player.position ?? "").trim();

  if (!pos) {
    return null;
  }

  const upper = pos.toUpperCase();

  if (GENERIC_POSITION_NAMES.has(upper)) {
    return null;
  }

  if (POSITION_LABELS[upper]) {
    return upper;
  }

  return null;
}

function playerPositionLabel(player) {
  const specific = specificPositionCode(player);

  if (specific) {
    return POSITION_LABELS[specific];
  }

  const role = (player.position_code ?? "").toUpperCase();

  if (role === "GK" || role === "DF" || role === "MF" || role === "FW") {
    return role;
  }

  return POSITION_LABELS[role] ?? "?";
}

export function playerPositionLabelRank(player) {
  const label = playerPositionLabel(player);
  return POSITION_LABEL_RANK[label] ?? POSITION_LABEL_ORDER.length;
}

export function comparePlayersByShirtNumber(left, right) {
  const leftNumber = Number(left?.shirt_number);
  const rightNumber = Number(right?.shirt_number);
  const leftHas = Number.isFinite(leftNumber);
  const rightHas = Number.isFinite(rightNumber);

  if (leftHas && rightHas) {
    return leftNumber - rightNumber;
  }

  if (leftHas !== rightHas) {
    return leftHas ? -1 : 1;
  }

  return 0;
}

export function rosterPositionLabels(players, _formation) {
  return new Map(
    players.map((player) => [player.api_id, playerPositionLabel(player)]),
  );
}

export function playerRoleRank(player) {
  const code = (player.position_code ?? "").toUpperCase();

  if (ROLE_ORDER[code] !== undefined) {
    return ROLE_ORDER[code];
  }

  if (canPlayRole(player, "GK")) {
    return ROLE_ORDER.GK;
  }

  if (canPlayRole(player, "DF")) {
    return ROLE_ORDER.DF;
  }

  if (canPlayRole(player, "MF")) {
    return ROLE_ORDER.MF;
  }

  if (canPlayRole(player, "FW")) {
    return ROLE_ORDER.FW;
  }

  return 4;
}

export function sortPlayersByRole(players, withinRoleCompare) {
  return [...players].sort((left, right) => {
    const roleDiff = playerRoleRank(left) - playerRoleRank(right);

    if (roleDiff !== 0) {
      return roleDiff;
    }

    const positionDiff = playerPositionLabelRank(left) - playerPositionLabelRank(right);

    if (positionDiff !== 0) {
      return positionDiff;
    }

    return withinRoleCompare(left, right);
  });
}

export const DEFAULT_AI_FORMATION_ID = "4-3-3";

export function ratingOvr(rating) {
  return Math.round((rating ?? 5) * 10);
}

export function canPlayRole(player, role) {
  if (!player) {
    return false;
  }

  const code = (player.position_code ?? "").toUpperCase();
  const pos = (player.position ?? "").toUpperCase();

  if (code === role) {
    return true;
  }

  if (role === "GK") {
    return code === "GK" || pos.includes("GK") || pos.includes("GOAL");
  }

  const hints = POSITION_HINTS[role] ?? [];
  return hints.some((hint) => code === hint || pos.includes(hint));
}

export function canPlacePlayer(player, formation, assignments) {
  if (!player || !formation) {
    return false;
  }

  return formation.slots.some(
    (slot) => !assignments[slot.id] && canPlayRole(player, slot.role),
  );
}

export function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }

  return copy;
}

export function drawUniqueNations(nations, count = 11) {
  return shuffle(nations).slice(0, count);
}

export function draftNationPool(
  draftNations,
  allNations,
  pickIndex,
  { excludeCurrent = true } = {},
) {
  const current = draftNations[pickIndex];
  const taken = new Set(draftNations.filter((_, index) => index !== pickIndex));

  return allNations.filter(
    (nation) => !taken.has(nation) && (!excludeCurrent || nation !== current),
  );
}

export function rollDraftNation(draftNations, allNations, pickIndex) {
  const pool = draftNationPool(draftNations, allNations, pickIndex);

  if (!pool.length) {
    return null;
  }

  return pickRandom(pool);
}

export function pickRandomGroup(groups) {
  const keys = Object.keys(groups);
  const groupKey = pickRandom(keys);
  const teams = [...groups[groupKey]];
  const replaceIndex = Math.floor(Math.random() * teams.length);

  return {
    groupKey,
    teams,
    replaceIndex,
    replacedTeam: teams[replaceIndex],
  };
}

export function squadStrength(squad) {
  const players = squad.filter(Boolean);

  if (players.length === 0) {
    return 5;
  }

  const total = players.reduce((sum, player) => sum + (player.rating ?? 5), 0);
  return total / players.length;
}

/** @typedef {{ overall: number, attack: number, defense: number }} TeamProfile */

export function teamProfile(squad) {
  const players = squad.filter(Boolean);
  const overall = squadStrength(squad);

  if (players.length === 0) {
    return { overall: 5, attack: 5, defense: 5 };
  }

  const attackers = players.filter(
    (player) => canPlayRole(player, "FW") || canPlayRole(player, "MF"),
  );
  const defenders = players.filter(
    (player) => canPlayRole(player, "DF") || canPlayRole(player, "GK"),
  );

  const average = (list) =>
    list.reduce((sum, player) => sum + (player.rating ?? 5), 0) / list.length;

  return {
    overall,
    attack: attackers.length ? average(attackers) : overall,
    defense: defenders.length ? average(defenders) : overall,
  };
}

function goalChance(attack, defense) {
  const edge = attack - defense;
  return Math.min(0.52, Math.max(0.1, 0.2 + edge * 0.05));
}

export function playerLastName(name) {
  return name?.split(" ").at(-1) ?? name ?? "?";
}

function pickGoalScorer(squad) {
  const pool = squad.filter(Boolean);
  const attackers = pool.filter(
    (player) => canPlayRole(player, "FW") || canPlayRole(player, "MF"),
  );
  const candidates = attackers.length ? attackers : pool;

  if (!candidates.length) {
    return null;
  }

  const totalWeight = candidates.reduce((sum, player) => sum + (player.rating ?? 5), 0);
  let roll = Math.random() * totalWeight;

  for (const player of candidates) {
    roll -= player.rating ?? 5;

    if (roll <= 0) {
      return player;
    }
  }

  return candidates[candidates.length - 1];
}

function pickScorers(squad, count) {
  const scorers = [];

  for (let index = 0; index < count; index += 1) {
    const scorer = pickGoalScorer(squad);
    scorers.push(playerLastName(scorer?.name));
  }

  return scorers;
}

function buildMatchGoalEvents(home, away, goalsA, goalsB) {
  const homeScorers = pickScorers(home.squad, goalsA);
  const awayScorers = pickScorers(away.squad, goalsB);
  const events = [];

  while (homeScorers.length || awayScorers.length) {
    const pickHome =
      homeScorers.length && (!awayScorers.length || Math.random() < goalsA / (goalsA + goalsB || 1));

    if (pickHome) {
      events.push({
        type: "goal",
        side: "home",
        team: home.name,
        player: homeScorers.shift(),
        scored: true,
      });
    } else {
      events.push({
        type: "goal",
        side: "away",
        team: away.name,
        player: awayScorers.shift(),
        scored: true,
      });
    }
  }

  return events;
}

function penaltyShotEvent(shooter, keeper, side, teamName, round) {
  const scored = penaltyKick(shooter, keeper);

  return {
    type: "penalty",
    side,
    team: teamName,
    player: playerLastName(shooter?.name),
    scored,
    round,
  };
}

function pickPenaltyShooters(squad) {
  return [...squad.filter(Boolean)]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 5);
}

function pickGoalkeeper(squad) {
  const keepers = squad.filter((player) => canPlayRole(player, "GK"));
  return (
    keepers.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0] ??
    squad.filter(Boolean).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0] ??
    null
  );
}

function penaltyKick(shooter, keeper) {
  const shooterRating = shooter?.rating ?? 5;
  const keeperRating = keeper?.rating ?? 5;
  const probability = Math.min(0.9, Math.max(0.42, 0.68 + (shooterRating - keeperRating) * 0.05));
  return Math.random() < probability;
}

export function simulatePenaltyShootout(teamA, teamB) {
  const shootersA = pickPenaltyShooters(teamA.squad);
  const shootersB = pickPenaltyShooters(teamB.squad);
  const keeperA = pickGoalkeeper(teamA.squad);
  const keeperB = pickGoalkeeper(teamB.squad);
  const kicks = [];

  let scoreA = 0;
  let scoreB = 0;

  for (let round = 0; round < 5; round += 1) {
    const kickA = penaltyShotEvent(
      shootersA[round % shootersA.length],
      keeperB,
      "home",
      teamA.name,
      round + 1,
    );
    kicks.push(kickA);
    if (kickA.scored) {
      scoreA += 1;
    }

    const kickB = penaltyShotEvent(
      shootersB[round % shootersB.length],
      keeperA,
      "away",
      teamB.name,
      round + 1,
    );
    kicks.push(kickB);
    if (kickB.scored) {
      scoreB += 1;
    }

    const remaining = 4 - round;

    if (scoreA > scoreB + remaining || scoreB > scoreA + remaining) {
      return {
        scoreA,
        scoreB,
        kicks,
        winner: scoreA > scoreB ? teamA : teamB,
      };
    }
  }

  let suddenRound = 6;

  while (scoreA === scoreB) {
    const kickA = penaltyShotEvent(
      shootersA[Math.floor(Math.random() * shootersA.length)],
      keeperB,
      "home",
      teamA.name,
      suddenRound,
    );
    kicks.push(kickA);
    if (kickA.scored) {
      scoreA += 1;
    }

    const kickB = penaltyShotEvent(
      shootersB[Math.floor(Math.random() * shootersB.length)],
      keeperA,
      "away",
      teamB.name,
      suddenRound,
    );
    kicks.push(kickB);
    if (kickB.scored) {
      scoreB += 1;
    }

    suddenRound += 1;
  }

  return {
    scoreA,
    scoreB,
    kicks,
    winner: scoreA > scoreB ? teamA : teamB,
  };
}

export function simulateMatch(profileA, profileB, options = {}) {
  const { allowDraw = true } = options;
  const dominanceA = profileA.overall ** 1.12;
  const dominanceB = profileB.overall ** 1.12;
  const possessionTotal = dominanceA + dominanceB;
  const chanceCount = 10 + Math.floor(Math.random() * 6);
  let goalsA = 0;
  let goalsB = 0;

  for (let chance = 0; chance < chanceCount; chance += 1) {
    if (Math.random() < dominanceA / possessionTotal) {
      if (Math.random() < goalChance(profileA.attack, profileB.defense)) {
        goalsA += 1;
      }
    } else if (Math.random() < goalChance(profileB.attack, profileA.defense)) {
      goalsB += 1;
    }
  }

  if (!allowDraw && goalsA === goalsB) {
    const extraChances = 4 + Math.floor(Math.random() * 3);

    for (let chance = 0; chance < extraChances && goalsA === goalsB; chance += 1) {
      if (Math.random() < dominanceA / possessionTotal) {
        if (Math.random() < goalChance(profileA.attack, profileB.defense) * 0.85) {
          goalsA += 1;
        }
      } else if (Math.random() < goalChance(profileB.attack, profileA.defense) * 0.85) {
        goalsB += 1;
      }
    }
  }

  return { goalsA, goalsB };
}

export function simulateGroupMatch(home, away) {
  const { goalsA, goalsB } = simulateMatch(home.profile, away.profile, { allowDraw: true });
  const events = buildMatchGoalEvents(home, away, goalsA, goalsB);
  const scorersA = events.filter((event) => event.side === "home").map((event) => event.player);
  const scorersB = events.filter((event) => event.side === "away").map((event) => event.player);

  return {
    goalsA,
    goalsB,
    scorersA,
    scorersB,
    events,
    homeId: home.id,
    awayId: away.id,
    penalties: null,
    winner: goalsA > goalsB ? home : goalsB > goalsA ? away : null,
  };
}

export function simulateKnockoutMatch(home, away) {
  const { goalsA, goalsB } = simulateMatch(home.profile, away.profile, {
    allowDraw: false,
  });
  const events = buildMatchGoalEvents(home, away, goalsA, goalsB);
  const scorersA = events.filter((event) => event.side === "home").map((event) => event.player);
  const scorersB = events.filter((event) => event.side === "away").map((event) => event.player);
  let penalties = null;
  let winner = goalsB > goalsA ? away : home;

  if (goalsA === goalsB) {
    penalties = simulatePenaltyShootout(home, away);
    winner = penalties.winner;
  }

  return {
    goalsA,
    goalsB,
    scorersA,
    scorersB,
    events,
    penalties,
    winner,
  };
}

export function formatKnockoutScore({ goalsA, goalsB, penalties }) {
  if (!penalties) {
    return `${goalsA}–${goalsB}`;
  }

  return `${goalsA}–${goalsB} (${penalties.scoreA}–${penalties.scoreB} t.a.b.)`;
}

export function squadBySlot(formation, assignments) {
  return formation.slots.map((slot) => assignments[slot.id] ?? null);
}

export function buildAiSquad(roster, formation) {
  const used = new Set();

  return formation.slots.map((slot) => {
    const candidates = roster
      .filter((player) => !used.has(player.api_id) && canPlayRole(player, slot.role))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

    let pick = candidates[0];

    if (!pick) {
      pick = roster
        .filter((player) => !used.has(player.api_id))
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
    }

    if (pick) {
      used.add(pick.api_id);
    }

    return pick ?? null;
  });
}

export function simulateKnockoutRound(matches) {
  const winners = [];

  for (const match of matches) {
    if (!match.home || !match.away) {
      winners.push(match.home ?? match.away);
      continue;
    }

    const result = simulateKnockoutMatch(match.home, match.away);
    match.goalsA = result.goalsA;
    match.goalsB = result.goalsB;
    match.scorersA = result.scorersA;
    match.scorersB = result.scorersB;
    match.penalties = result.penalties;
    match.winner = result.winner;
    match.score = formatKnockoutScore(result);
    winners.push(result.winner);
  }

  const nextRound = [];

  for (let index = 0; index < winners.length; index += 2) {
    nextRound.push({ home: winners[index], away: winners[index + 1] });
  }

  return nextRound;
}

export function groupStandings(teams, results) {
  const table = new Map(
    teams.map((team) => [
      team.id,
      { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 },
    ]),
  );

  for (const match of results) {
    const home = table.get(match.homeId);
    const away = table.get(match.awayId);

    if (!home || !away) {
      continue;
    }

    home.played += 1;
    away.played += 1;
    home.gf += match.goalsA;
    home.ga += match.goalsB;
    away.gf += match.goalsB;
    away.ga += match.goalsA;

    if (match.goalsA > match.goalsB) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (match.goalsA < match.goalsB) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  return [...table.values()].sort((a, b) => {
    const gdA = a.gf - a.ga;
    const gdB = b.gf - b.ga;

    if (b.points !== a.points) {
      return b.points - a.points;
    }

    if (gdB !== gdA) {
      return gdB - gdA;
    }

    return b.gf - a.gf;
  });
}

export function roundRobinPairs(teamIds) {
  const pairs = [];

  for (let home = 0; home < teamIds.length; home += 1) {
    for (let away = home + 1; away < teamIds.length; away += 1) {
      pairs.push([teamIds[home], teamIds[away]]);
    }
  }

  return pairs;
}

export const WORLD_CUP_KNOCKOUT_SIZE = 32;
export const WORLD_CUP_BEST_THIRD_PLACES = 8;

function compareStandingRows(a, b) {
  const gdA = a.gf - a.ga;
  const gdB = b.gf - b.ga;

  if (b.points !== a.points) {
    return b.points - a.points;
  }

  if (gdB !== gdA) {
    return gdB - gdA;
  }

  return b.gf - a.gf;
}

/**
 * CDM 2026 : 2 premiers par groupe (24) + 8 meilleurs troisièmes = 32 qualifiés.
 * @param {ReturnType<typeof groupStandings>[]} groupTables
 */
export function qualifyWorldCupKnockout(groupTables) {
  const automatic = [];
  const thirdPlaces = [];

  for (const table of groupTables) {
    automatic.push(table[0].team, table[1].team);

    if (table[2]) {
      thirdPlaces.push(table[2]);
    }
  }

  const bestThirds = thirdPlaces
    .sort(compareStandingRows)
    .slice(0, WORLD_CUP_BEST_THIRD_PLACES)
    .map((row) => row.team);

  return [...automatic, ...bestThirds];
}

export function buildKnockoutBracket(qualifiedTeams) {
  const teams = shuffle([...qualifiedTeams]);

  if (teams.length !== WORLD_CUP_KNOCKOUT_SIZE) {
    throw new Error(
      `Attendu ${WORLD_CUP_KNOCKOUT_SIZE} qualifiés, reçu ${teams.length}.`,
    );
  }

  const roundOf32 = [];

  for (let index = 0; index < WORLD_CUP_KNOCKOUT_SIZE; index += 2) {
    roundOf32.push({ home: teams[index], away: teams[index + 1] });
  }

  return roundOf32;
}
