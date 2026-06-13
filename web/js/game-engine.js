/** @typedef {{ api_id: number, name: string, position?: string, position_code?: string, rating: number, teamName?: string, nation?: string }} Player */
/** @typedef {{ id: string, role: string, label: string, x: number, y: number }} Slot */
/** @typedef {{ id: string, label: string, slots: Slot[] }} Formation */

export const FORMATIONS = /** @type {Formation[]} */ ([
  {
    id: "4-3-3",
    label: "4-3-3",
    slots: [
      { id: "gk", role: "GK", label: "GK", x: 50, y: 97.5 },
      { id: "lb", role: "DF", label: "DG", x: 15, y: 81 },
      { id: "lcb", role: "DF", label: "DCG", x: 32, y: 83 },
      { id: "rcb", role: "DF", label: "DCD", x: 68, y: 83 },
      { id: "rb", role: "DF", label: "DD", x: 85, y: 81 },
      { id: "lcm", role: "MF", label: "MCG", x: 32, y: 52 },
      { id: "cm", role: "MF", label: "MC", x: 50, y: 50 },
      { id: "rcm", role: "MF", label: "MCD", x: 68, y: 52 },
      { id: "lw", role: "FW", label: "AG", x: 16, y: 16 },
      { id: "st", role: "FW", label: "BU", x: 50, y: 12 },
      { id: "rw", role: "FW", label: "AD", x: 84, y: 16 },
    ],
  },
  {
    id: "4-4-2",
    label: "4-4-2",
    slots: [
      { id: "gk", role: "GK", label: "GK", x: 50, y: 97.5 },
      { id: "lb", role: "DF", label: "DG", x: 15, y: 81 },
      { id: "lcb", role: "DF", label: "DCG", x: 32, y: 83 },
      { id: "rcb", role: "DF", label: "DCD", x: 68, y: 83 },
      { id: "rb", role: "DF", label: "DD", x: 85, y: 81 },
      { id: "lm", role: "MF", label: "MG", x: 15, y: 50 },
      { id: "lcm", role: "MF", label: "MCG", x: 36, y: 52 },
      { id: "rcm", role: "MF", label: "MCD", x: 64, y: 52 },
      { id: "rm", role: "MF", label: "MD", x: 85, y: 50 },
      { id: "lst", role: "FW", label: "AVG", x: 38, y: 13 },
      { id: "rst", role: "FW", label: "AVD", x: 62, y: 13 },
    ],
  },
  {
    id: "4-2-3-1",
    label: "4-2-3-1",
    slots: [
      { id: "gk", role: "GK", label: "GK", x: 50, y: 97.5 },
      { id: "lb", role: "DF", label: "DG", x: 15, y: 81 },
      { id: "lcb", role: "DF", label: "DCG", x: 32, y: 83 },
      { id: "rcb", role: "DF", label: "DCD", x: 68, y: 83 },
      { id: "rb", role: "DF", label: "DD", x: 85, y: 81 },
      { id: "cdm1", role: "MF", label: "MDF", x: 40, y: 67 },
      { id: "cdm2", role: "MF", label: "MDF", x: 60, y: 67 },
      { id: "lam", role: "MF", label: "MOC", x: 22, y: 36 },
      { id: "cam", role: "MF", label: "MED", x: 50, y: 34 },
      { id: "ram", role: "MF", label: "MOC", x: 78, y: 36 },
      { id: "st", role: "FW", label: "BU", x: 50, y: 12 },
    ],
  },
  {
    id: "3-5-2",
    label: "3-5-2",
    slots: [
      { id: "gk", role: "GK", label: "GK", x: 50, y: 97.5 },
      { id: "lcb", role: "DF", label: "DCG", x: 24, y: 84 },
      { id: "cb", role: "DF", label: "DC", x: 50, y: 85 },
      { id: "rcb", role: "DF", label: "DCD", x: 76, y: 84 },
      { id: "lwb", role: "MF", label: "MG", x: 8, y: 54 },
      { id: "lcm", role: "MF", label: "MCG", x: 32, y: 52 },
      { id: "cm", role: "MF", label: "MC", x: 50, y: 50 },
      { id: "rcm", role: "MF", label: "MCD", x: 68, y: 52 },
      { id: "rwb", role: "MF", label: "MD", x: 92, y: 54 },
      { id: "lst", role: "FW", label: "AVG", x: 38, y: 13 },
      { id: "rst", role: "FW", label: "AVD", x: 62, y: 13 },
    ],
  },
  {
    id: "3-4-3",
    label: "3-4-3",
    slots: [
      { id: "gk", role: "GK", label: "GK", x: 50, y: 97.5 },
      { id: "lcb", role: "DF", label: "DCG", x: 24, y: 84 },
      { id: "cb", role: "DF", label: "DC", x: 50, y: 85 },
      { id: "rcb", role: "DF", label: "DCD", x: 76, y: 84 },
      { id: "lm", role: "MF", label: "MG", x: 15, y: 50 },
      { id: "lcm", role: "MF", label: "MCG", x: 36, y: 52 },
      { id: "rcm", role: "MF", label: "MCD", x: 64, y: 52 },
      { id: "rm", role: "MF", label: "MD", x: 85, y: 50 },
      { id: "lw", role: "FW", label: "AG", x: 16, y: 16 },
      { id: "st", role: "FW", label: "BU", x: 50, y: 12 },
      { id: "rw", role: "FW", label: "AD", x: 84, y: 16 },
    ],
  },
  {
    id: "4-1-4-1",
    label: "4-1-4-1",
    slots: [
      { id: "gk", role: "GK", label: "GK", x: 50, y: 97.5 },
      { id: "lb", role: "DF", label: "DG", x: 15, y: 81 },
      { id: "lcb", role: "DF", label: "DCG", x: 32, y: 83 },
      { id: "rcb", role: "DF", label: "DCD", x: 68, y: 83 },
      { id: "rb", role: "DF", label: "DD", x: 85, y: 81 },
      { id: "cdm", role: "MF", label: "MDF", x: 50, y: 67 },
      { id: "lm", role: "MF", label: "MG", x: 15, y: 44 },
      { id: "lcm", role: "MF", label: "MCG", x: 36, y: 46 },
      { id: "rcm", role: "MF", label: "MCD", x: 64, y: 46 },
      { id: "rm", role: "MF", label: "MD", x: 85, y: 44 },
      { id: "st", role: "FW", label: "BU", x: 50, y: 12 },
    ],
  },
]);

const POSITION_HINTS = {
  GK: ["GK", "GOAL"],
  DF: ["DF", "CB", "LB", "RB", "DEF", "BACK"],
  MF: ["MF", "CM", "DM", "AM", "MID"],
  FW: ["FW", "ST", "CF", "LW", "RW", "ATT", "FOR"],
};

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

export function rollDraftNation(draftNations, allNations, pickIndex) {
  const current = draftNations[pickIndex];

  if (!current) {
    return null;
  }

  const taken = new Set(draftNations.filter((_, index) => index !== pickIndex));
  const pool = allNations.filter(
    (nation) => !taken.has(nation) && nation !== current,
  );

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

  let scoreA = 0;
  let scoreB = 0;

  for (let round = 0; round < 5; round += 1) {
    if (penaltyKick(shootersA[round % shootersA.length], keeperB)) {
      scoreA += 1;
    }

    if (penaltyKick(shootersB[round % shootersB.length], keeperA)) {
      scoreB += 1;
    }

    const remaining = 4 - round;

    if (scoreA > scoreB + remaining || scoreB > scoreA + remaining) {
      return {
        scoreA,
        scoreB,
        winner: scoreA > scoreB ? teamA : teamB,
      };
    }
  }

  while (scoreA === scoreB) {
    const aScored = penaltyKick(
      shootersA[Math.floor(Math.random() * shootersA.length)],
      keeperB,
    );
    const bScored = penaltyKick(
      shootersB[Math.floor(Math.random() * shootersB.length)],
      keeperA,
    );

    scoreA += aScored ? 1 : 0;
    scoreB += bScored ? 1 : 0;
  }

  return {
    scoreA,
    scoreB,
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

export function simulateKnockoutRound(matches, getProfile) {
  const winners = [];

  for (const match of matches) {
    if (!match.home || !match.away) {
      winners.push(match.home ?? match.away);
      continue;
    }

    const profileA = getProfile(match.home);
    const profileB = getProfile(match.away);
    const { goalsA, goalsB } = simulateMatch(profileA, profileB, {
      allowDraw: false,
    });

    let winner = match.home;
    let score = `${goalsA} - ${goalsB}`;

    if (goalsB > goalsA) {
      winner = match.away;
    } else if (goalsA === goalsB) {
      const penalties = simulatePenaltyShootout(match.home, match.away);
      winner = penalties.winner;
      score = `${goalsA} - ${goalsB} (${penalties.scoreA}-${penalties.scoreB} t.a.b.)`;
    }

    match.score = score;
    match.winner = winner;
    winners.push(winner);
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

export function buildKnockoutBracket(qualifiedTeams) {
  const teams = shuffle(qualifiedTeams);

  while (teams.length < 16) {
    teams.push(null);
  }

  const roundOf16 = [];

  for (let index = 0; index < 16; index += 2) {
    roundOf16.push({ home: teams[index], away: teams[index + 1] });
  }

  return roundOf16;
}
