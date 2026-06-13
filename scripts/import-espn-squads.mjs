import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { createEspnClient, normalizeEspnPlayer } from "./espn-api.mjs";
import {
  frenchFromEspnName,
  WORLD_CUP_2026_NATIONS,
} from "./world-cup-2026-teams.mjs";

const WORLD_CUP_SEASON = 2026;
const allowedNations = new Set(WORLD_CUP_2026_NATIONS);

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const databasePath = path.resolve(
  rootDir,
  process.env.DATABASE_PATH ?? "./data/foot-games.sqlite",
);
const schemaPath = path.join(rootDir, "database", "schema.sql");
const requestDelayMs = Number(process.env.ESPN_REQUEST_DELAY_MS ?? 150);

const client = createEspnClient({ requestDelayMs });

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.exec(fs.readFileSync(schemaPath, "utf8"));
ensureColumn("players", "rating", "REAL");
ensureColumn("players", "appearances", "INTEGER");
ensureColumn("players", "minutes_played", "INTEGER");
ensureColumn("players", "club", "TEXT");

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
  .run("ESPN", "FIFA World Cup", WORLD_CUP_SEASON, startedAt, "running");
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
    club,
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
    @club,
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
    club = excluded.club,
    imported_at = excluded.imported_at
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();

  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function saveTournamentData(teams, players, importedAt) {
  db.prepare("DELETE FROM players").run();
  db.prepare("DELETE FROM teams").run();

  for (const team of teams) {
    upsertTeam.run({
      api_id: team.id,
      name: team.name,
      code: team.code,
      country: team.country,
      imported_at: importedAt,
    });
  }

  for (const player of players) {
    upsertPlayer.run({
      api_id: player.id,
      team_id: player.teamId,
      name: player.name,
      age: player.age,
      shirt_number: player.number,
      position: player.position,
      position_code: player.positionCode,
      rating: player.rating,
      appearances: player.appearances,
      minutes_played: player.minutesPlayed,
      club: player.club ?? null,
      imported_at: importedAt,
    });
  }
}

async function importEspnSquads() {
  console.log("Fetching World Cup 2026 teams from ESPN...");

  const espnTeams = await client.fetchTeams();
  const teams = espnTeams
    .map((team) => ({
      ...team,
      name: frenchFromEspnName(team.name),
      country: frenchFromEspnName(team.country),
    }))
    .filter((team) => allowedNations.has(team.name));

  if (teams.length === 0) {
    throw new Error("ESPN returned no World Cup teams.");
  }

  const players = [];
  let completed = 0;

  console.log(`Fetching squads for ${teams.length} teams...`);

  for (const team of teams) {
    const roster = await client.fetchRoster(team.id);
    const squad = roster
      .map((athlete) => normalizeEspnPlayer(athlete, team.id))
      .filter(Boolean);

    players.push(...squad);
    completed += 1;
    console.log(`[${completed}/${teams.length}] ${team.name}: ${squad.length} players`);
  }

  const importedAt = new Date().toISOString();
  saveTournamentData(teams, players, importedAt);

  const missing = WORLD_CUP_2026_NATIONS.filter(
    (nation) => !teams.some((team) => team.name === nation),
  );

  if (missing.length > 0) {
    console.warn(`Nations missing from ESPN: ${missing.join(", ")}`);
  }

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
    `ESPN import complete: ${teams.length} teams, ${players.length} players.`,
  );
  console.log("Run ratings enrich: $env:EA_ENRICH_ONLY=\"true\"; npm run import:ratings");
  console.log(`Database: ${databasePath}`);
}

try {
  await importEspnSquads();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  db.prepare(
    `UPDATE imports
     SET completed_at = ?, status = ?, error = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), "failed", message, importId);

  console.error(`ESPN import failed: ${message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
