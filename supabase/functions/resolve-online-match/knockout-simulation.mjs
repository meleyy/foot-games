const POSITION_HINTS = {
  DF: ["DF", "CB", "LB", "RB", "LWB", "RWB"],
  MF: ["MF", "CM", "CDM", "CAM", "LM", "RM", "AM", "DM"],
  FW: ["FW", "ST", "CF", "LW", "RW", "SS"],
};

const FORMATIONS = [
  {
    id: "4-3-3",
    slots: [
      { id: "gk", role: "GK" }, { id: "lb", role: "DF" }, { id: "lcb", role: "DF" },
      { id: "rcb", role: "DF" }, { id: "rb", role: "DF" }, { id: "lcm", role: "MF" },
      { id: "cm", role: "MF" }, { id: "rcm", role: "MF" }, { id: "lw", role: "FW" },
      { id: "st", role: "FW" }, { id: "rw", role: "FW" },
    ],
  },
  {
    id: "4-4-2",
    slots: [
      { id: "gk", role: "GK" }, { id: "lb", role: "DF" }, { id: "lcb", role: "DF" },
      { id: "rcb", role: "DF" }, { id: "rb", role: "DF" }, { id: "lm", role: "MF" },
      { id: "lcm", role: "MF" }, { id: "rcm", role: "MF" }, { id: "rm", role: "MF" },
      { id: "lst", role: "FW" }, { id: "rst", role: "FW" },
    ],
  },
  {
    id: "4-2-3-1",
    slots: [
      { id: "gk", role: "GK" }, { id: "lb", role: "DF" }, { id: "lcb", role: "DF" },
      { id: "rcb", role: "DF" }, { id: "rb", role: "DF" }, { id: "cdm1", role: "MF" },
      { id: "cdm2", role: "MF" }, { id: "lam", role: "MF" }, { id: "cam", role: "MF" },
      { id: "ram", role: "MF" }, { id: "st", role: "FW" },
    ],
  },
  {
    id: "3-5-2",
    slots: [
      { id: "gk", role: "GK" }, { id: "lcb", role: "DF" }, { id: "cb", role: "DF" },
      { id: "rcb", role: "DF" }, { id: "lwb", role: "MF" }, { id: "lcm", role: "MF" },
      { id: "cm", role: "MF" }, { id: "rcm", role: "MF" }, { id: "rwb", role: "MF" },
      { id: "lst", role: "FW" }, { id: "rst", role: "FW" },
    ],
  },
  {
    id: "3-4-3",
    slots: [
      { id: "gk", role: "GK" }, { id: "lcb", role: "DF" }, { id: "cb", role: "DF" },
      { id: "rcb", role: "DF" }, { id: "lm", role: "MF" }, { id: "lcm", role: "MF" },
      { id: "rcm", role: "MF" }, { id: "rm", role: "MF" }, { id: "lw", role: "FW" },
      { id: "st", role: "FW" }, { id: "rw", role: "FW" },
    ],
  },
];

export function formationById(id) {
  return FORMATIONS.find((formation) => formation.id === id) ?? FORMATIONS[0];
}

export function squadBySlot(formation, assignments) {
  return formation.slots.map((slot) => assignments[slot.id] ?? null);
}

export function canPlayRole(player, role) {
  if (!player) return false;
  const code = (player.position_code ?? "").toUpperCase();
  const pos = (player.position ?? "").toUpperCase();
  if (code === role) return true;
  if (role === "GK") return code === "GK" || pos.includes("GK") || pos.includes("GOAL");
  const hints = POSITION_HINTS[role] ?? [];
  return hints.some((hint) => code === hint || pos.includes(hint));
}

export function squadStrength(squad) {
  const players = squad.filter(Boolean);
  if (!players.length) return 5;
  return players.reduce((sum, player) => sum + (player.rating ?? 5), 0) / players.length;
}

export function teamProfile(squad) {
  const players = squad.filter(Boolean);
  const overall = squadStrength(squad);
  if (!players.length) return { overall: 5, attack: 5, defense: 5 };
  const attackers = players.filter((player) => canPlayRole(player, "FW") || canPlayRole(player, "MF"));
  const defenders = players.filter((player) => canPlayRole(player, "DF") || canPlayRole(player, "GK"));
  const average = (list) => list.reduce((sum, player) => sum + (player.rating ?? 5), 0) / list.length;
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
  const attackers = pool.filter((player) => canPlayRole(player, "FW") || canPlayRole(player, "MF"));
  const candidates = attackers.length ? attackers : pool;
  if (!candidates.length) return null;
  const totalWeight = candidates.reduce((sum, player) => sum + (player.rating ?? 5), 0);
  let roll = Math.random() * totalWeight;
  for (const player of candidates) {
    roll -= player.rating ?? 5;
    if (roll <= 0) return player;
  }
  return candidates[candidates.length - 1];
}

function pickScorers(squad, count) {
  const scorers = [];
  for (let index = 0; index < count; index += 1) {
    scorers.push(playerLastName(pickGoalScorer(squad)?.name));
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
      events.push({ type: "goal", side: "home", team: home.name, player: homeScorers.shift(), scored: true });
    } else {
      events.push({ type: "goal", side: "away", team: away.name, player: awayScorers.shift(), scored: true });
    }
  }

  return events;
}

function penaltyKick(shooter, keeper) {
  const shooterRating = shooter?.rating ?? 5;
  const keeperRating = keeper?.rating ?? 5;
  const probability = Math.min(0.9, Math.max(0.42, 0.68 + (shooterRating - keeperRating) * 0.05));
  return Math.random() < probability;
}

function pickGoalkeeper(squad) {
  const keepers = squad.filter((player) => player && canPlayRole(player, "GK"));
  return (
    keepers.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0] ??
    squad.filter(Boolean).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0] ??
    null
  );
}

function pickPenaltyShooters(squad) {
  return [...squad.filter(Boolean)].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 5);
}

function penaltyShotEvent(shooter, keeper, side, teamName, round) {
  return {
    type: "penalty",
    side,
    team: teamName,
    player: playerLastName(shooter?.name),
    scored: penaltyKick(shooter, keeper),
    round,
  };
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
    const kickA = penaltyShotEvent(shootersA[round % shootersA.length], keeperB, "home", teamA.name, round + 1);
    kicks.push(kickA);
    if (kickA.scored) scoreA += 1;

    const kickB = penaltyShotEvent(shootersB[round % shootersB.length], keeperA, "away", teamB.name, round + 1);
    kicks.push(kickB);
    if (kickB.scored) scoreB += 1;

    const remaining = 4 - round;
    if (scoreA > scoreB + remaining || scoreB > scoreA + remaining) {
      return { scoreA, scoreB, kicks, winner: scoreA > scoreB ? teamA : teamB };
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
    if (kickA.scored) scoreA += 1;

    const kickB = penaltyShotEvent(
      shootersB[Math.floor(Math.random() * shootersB.length)],
      keeperA,
      "away",
      teamB.name,
      suddenRound,
    );
    kicks.push(kickB);
    if (kickB.scored) scoreB += 1;
    suddenRound += 1;
  }

  return { scoreA, scoreB, kicks, winner: scoreA > scoreB ? teamA : teamB };
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
      if (Math.random() < goalChance(profileA.attack, profileB.defense)) goalsA += 1;
    } else if (Math.random() < goalChance(profileB.attack, profileA.defense)) {
      goalsB += 1;
    }
  }

  if (!allowDraw && goalsA === goalsB) {
    const extraChances = 4 + Math.floor(Math.random() * 3);
    for (let chance = 0; chance < extraChances && goalsA === goalsB; chance += 1) {
      if (Math.random() < dominanceA / possessionTotal) {
        if (Math.random() < goalChance(profileA.attack, profileB.defense) * 0.85) goalsA += 1;
      } else if (Math.random() < goalChance(profileB.attack, profileA.defense) * 0.85) {
        goalsB += 1;
      }
    }
  }

  return { goalsA, goalsB };
}

function withProfile(team) {
  return {
    ...team,
    profile: team.profile ?? teamProfile(team.squad),
  };
}

export function simulateKnockoutMatch(home, away) {
  const homeTeam = withProfile(home);
  const awayTeam = withProfile(away);
  const { goalsA, goalsB } = simulateMatch(homeTeam.profile, awayTeam.profile, { allowDraw: false });
  const events = buildMatchGoalEvents(homeTeam, awayTeam, goalsA, goalsB);
  const scorersA = events.filter((event) => event.side === "home").map((event) => event.player);
  const scorersB = events.filter((event) => event.side === "away").map((event) => event.player);
  let penalties = null;
  let winner = goalsB > goalsA ? awayTeam : homeTeam;

  if (goalsA === goalsB) {
    penalties = simulatePenaltyShootout(homeTeam, awayTeam);
    winner = penalties.winner;
  }

  return { goalsA, goalsB, scorersA, scorersB, events, penalties, winner };
}

export function buildOnlineMatchResult(home, away, simulated, extra = {}) {
  const penalties = simulated.penalties
    ? {
        scoreA: simulated.penalties.scoreA,
        scoreB: simulated.penalties.scoreB,
        kicks: simulated.penalties.kicks?.map((kick) => ({
          side: kick.side,
          player: kick.player,
          scored: kick.scored,
          round: kick.round,
        })),
      }
    : null;

  return {
    homeId: home.id,
    awayId: away.id,
    homeGoals: simulated.goalsA,
    awayGoals: simulated.goalsB,
    winnerId: simulated.winner?.id ?? null,
    scorersA: simulated.scorersA,
    scorersB: simulated.scorersB,
    penalties,
    ...extra,
  };
}
