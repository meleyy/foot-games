import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import {
  createWorldCupClient,
  discoverTeams,
  extractGoalscorers,
  extractPlayersFromSquad,
} from "./worldcup-api.mjs";

const WORLD_CUP_SEASON = 2026;
const EXPECTED_TEAM_COUNT = 48;

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const databasePath = path.resolve(
  rootDir,
  process.env.DATABASE_PATH ?? "./data/foot-games.sqlite",
);
const schemaPath = path.join(rootDir, "database", "schema.sql");
const apiKey = process.env.WORLDCUP_API_KEY?.trim();
const apiLang = process.env.WORLDCUP_API_LANG?.trim() || "fr";
const requestDelayMs = Number(process.env.API_REQUEST_DELAY_MS ?? 200);

if (!apiKey) {
  console.error(
    "WORLDCUP_API_KEY is missing. Copy .env.example to .env and add your key.",
  );
  process.exit(1);
}

if (!Number.isFinite(requestDelayMs) || requestDelayMs < 0) {
  console.error("API_REQUEST_DELAY_MS must be a positive number.");
  process.exit(1);
}

const client = createWorldCupClient({
  apiKey,
  lang: apiLang,
  requestDelayMs,
});

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.exec(fs.readFileSync(schemaPath, "utf8"));
ensureColumn("players", "rating", "REAL");
ensureColumn("players", "appearances", "INTEGER");
ensureColumn("players", "minutes_played", "INTEGER");

const startedAt = new Date().toISOString();
const importResult = db
  .prepare(
    `INSERT INTO imports (
      source,
      competition,
      season,
      started_at,
      status
    ) VALUES (?, ?, ?, ?, ?)`,
  )
  .run("World Cup API", "FIFA World Cup", WORLD_CUP_SEASON, startedAt, "running");
const importId = Number(importResult.lastInsertRowid);

const upsertTeam = db.prepare(`
  INSERT INTO teams (api_id, name, code, country, imported_at)
  VALUES (@api_id, @name, @code, @country, @imported_at)
  ON CONFLICT(api_id) DO UPDATE SET
    name = excluded.name,
    code = excluded.code,
    country = excluded.country,
    imported_at = excluded.imported_at
`);

const upsertPlayer = db.prepare(`
  INSERT INTO players (
    api_id,
    team_id,
    name,
    age,
    shirt_number,
    position,
    position_code,
    rating,
    appearances,
    minutes_played,
    imported_at
  ) VALUES (
    @api_id,
    @team_id,
    @name,
    @age,
    @shirt_number,
    @position,
    @position_code,
    @rating,
    @appearances,
    @minutes_played,
    @imported_at
  )
  ON CONFLICT(api_id) DO UPDATE SET
    team_id = excluded.team_id,
    name = excluded.name,
    age = excluded.age,
    shirt_number = excluded.shirt_number,
    position = excluded.position,
    position_code = excluded.position_code,
    rating = excluded.rating,
    appearances = excluded.appearances,
    minutes_played = excluded.minutes_played,
    imported_at = excluded.imported_at
`);

const replaceTournamentData = db.transaction((teams, players, importedAt) => {
  for (const team of teams) {
    upsertTeam.run({
      api_id: team.id,
      name: team.name,
      code: team.code ?? null,
      country: team.country ?? null,
      imported_at: importedAt,
    });
  }

  db.prepare("DELETE FROM players").run();

  for (const player of players) {
    upsertPlayer.run({
      api_id: player.id,
      team_id: player.teamId,
      name: player.name,
      age: player.age ?? null,
      shirt_number: player.number ?? null,
      position: player.position ?? null,
      position_code: positionCode(player.position),
      rating: player.rating,
      appearances: player.appearances,
      minutes_played: player.minutesPlayed,
      imported_at: importedAt,
    });
  }
});

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();

  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function positionCode(position) {
  if (!position) {
    return null;
  }

  const normalized = String(position).trim().toLowerCase();

  if (
    normalized.includes("goal") ||
    normalized === "gk" ||
    normalized === "g"
  ) {
    return "GK";
  }

  if (
    normalized.includes("def") ||
    normalized === "df" ||
    normalized === "cb" ||
    normalized === "lb" ||
    normalized === "rb"
  ) {
    return "DF";
  }

  if (
    normalized.includes("mid") ||
    normalized === "mf" ||
    normalized === "cm" ||
    normalized === "dm" ||
    normalized === "am"
  ) {
    return "MF";
  }

  if (
    normalized.includes("att") ||
    normalized.includes("for") ||
    normalized.includes("strik") ||
    normalized === "fw" ||
    normalized === "st" ||
    normalized === "cf"
  ) {
    return "FW";
  }

  return null;
}

function applyGoalscorerStats(players, goalscorersById) {
  for (const player of players) {
    const stats = goalscorersById.get(player.id);

    if (!stats) {
      continue;
    }

    if (stats.appearances !== null) {
      player.appearances = stats.appearances;
    }
  }
}

async function importWorldCup() {
  console.log("Discovering World Cup 2026 teams from group standings...");

  const teams = await discoverTeams(client);

  if (teams.length === 0) {
    throw new Error("World Cup API returned no teams.");
  }

  if (teams.length !== EXPECTED_TEAM_COUNT) {
    console.log(
      `Warning: expected ${EXPECTED_TEAM_COUNT} teams, API returned ${teams.length}.`,
    );
  }

  const playersById = new Map();
  let completedSquads = 0;

  console.log(`Fetching squads for ${teams.length} teams...`);

  for (const team of teams) {
    const squadData = await client.fetchApi("/squads", {
      team_id: team.id,
      lang: client.lang,
    });
    const players = extractPlayersFromSquad(squadData, team.id);

    for (const player of players) {
      playersById.set(player.id, player);
    }

    completedSquads += 1;
    console.log(
      `[${completedSquads}/${teams.length}] ${team.name}: ${players.length} players`,
    );
  }

  let goalscorersById = new Map();

  try {
    const goalscorersData = await client.fetchApi("/goalscorers", {
      lang: client.lang,
    });
    goalscorersById = extractGoalscorers(goalscorersData);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Goalscorers skipped: ${message}`);
  }

  const players = [...playersById.values()];

  if (players.length === 0) {
    throw new Error("World Cup API returned no squad players.");
  }

  applyGoalscorerStats(players, goalscorersById);

  const importedAt = new Date().toISOString();
  replaceTournamentData(teams, players, importedAt);
  const ratingsCount = players.filter((player) => player.rating !== null).length;

  db.prepare(
    `UPDATE imports
     SET completed_at = ?, status = ?, teams_count = ?, players_count = ?
     WHERE id = ?`,
  ).run(
    new Date().toISOString(),
    "completed",
    teams.length,
    players.length,
    importId,
  );

  console.log("");
  console.log(
    `Import complete: ${teams.length} teams, ${players.length} players, ` +
      `${ratingsCount} ratings.`,
  );
  console.log(
    `${players.length - ratingsCount} players have no tournament rating yet.`,
  );
  console.log(
    `API calls: ${client.groups.length} standings + ${teams.length} squads + 1 goalscorers.`,
  );
  console.log(`Database: ${databasePath}`);
}

try {
  await importWorldCup();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  db.prepare(
    `UPDATE imports
     SET completed_at = ?, status = ?, error = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), "failed", message, importId);

  console.error(`Import failed: ${message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
