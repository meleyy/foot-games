import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { WORLD_CUP_2026_GROUPS } from "./world-cup-2026-teams.mjs";
import { FORMATIONS } from "../web/js/game-engine.js";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function buildGameBootstrap(db) {
  const teams = db
    .prepare(
      `SELECT
         teams.api_id AS team_id,
         teams.name,
         players.api_id,
         players.name AS player_name,
         players.position,
         players.position_code,
         players.rating
       FROM teams
       JOIN players ON players.team_id = teams.api_id
       ORDER BY teams.name, players.rating DESC, players.name`,
    )
    .all();

  const teamsByName = new Map();

  for (const row of teams) {
    if (!teamsByName.has(row.name)) {
      teamsByName.set(row.name, {
        name: row.name,
        players: [],
      });
    }

    teamsByName.get(row.name).players.push({
      api_id: row.api_id,
      name: row.player_name,
      position: row.position,
      position_code: row.position_code,
      rating: row.rating ?? 5,
    });
  }

  const allPlayers = [...teamsByName.values()].flatMap((team) =>
    team.players.map((player) => ({
      ...player,
      teamName: team.name,
    })),
  );

  return {
    groups: WORLD_CUP_2026_GROUPS,
    nations: Object.values(WORLD_CUP_2026_GROUPS).flat(),
    formations: FORMATIONS.map(({ id, label, slots }) => ({
      id,
      label,
      slots,
    })),
    teams: [...teamsByName.values()],
    allPlayers,
    playerCount: allPlayers.length,
    generatedAt: new Date().toISOString(),
  };
}

export function writeGameBootstrapFile(databasePath, outputPath) {
  const db = new Database(databasePath, { readonly: true });

  try {
    const payload = buildGameBootstrap(db);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(payload));
    return payload.playerCount;
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const databasePath = path.resolve(
    rootDir,
    process.env.DATABASE_PATH ?? "./data/foot-games.sqlite",
  );
  const outputPath = path.join(rootDir, "web", "data", "game-bootstrap.json");
  const count = writeGameBootstrapFile(databasePath, outputPath);
  console.log(`Game data exported: ${count} players -> ${outputPath}`);
}
