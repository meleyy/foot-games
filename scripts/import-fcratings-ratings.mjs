import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { fetchNationRatings } from "./fcratings-api.mjs";
import { worldCupRatingFor } from "./fc26-world-cup-ratings.mjs";
import { matchRatingsToSquad } from "./ratings-match.mjs";
import { WORLD_CUP_2026_NATIONS } from "./world-cup-2026-teams.mjs";

const WORLD_CUP_SEASON = 2026;
const requestDelayMs = Number(process.env.FCRATINGS_REQUEST_DELAY_MS ?? 1200);
const maxRetries = Number(process.env.FCRATINGS_MAX_RETRIES ?? 3);

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = path.resolve(
  rootDir,
  process.env.DATABASE_PATH ?? "./data/foot-games.sqlite",
);
const schemaPath = path.join(rootDir, "database", "schema.sql");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.exec(fs.readFileSync(schemaPath, "utf8"));
ensureColumn("players", "rating", "REAL");
ensureColumn("players", "potential", "INTEGER");

const startedAt = new Date().toISOString();
const importResult = db
  .prepare(
    `INSERT INTO imports (source, competition, season, started_at, status)
     VALUES (?, ?, ?, ?, ?)`,
  )
  .run("FC Ratings FC26", "EA FC 26", WORLD_CUP_SEASON, startedAt, "running");
const importId = Number(importResult.lastInsertRowid);

const updatePlayer = db.prepare(`
  UPDATE players
  SET
    rating = @rating,
    potential = COALESCE(@potential, potential),
    position = COALESCE(@position, position),
    position_code = COALESCE(@position_code, position_code),
    imported_at = @imported_at
  WHERE api_id = @api_id
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function existingTeams() {
  return db
    .prepare(`SELECT api_id, name FROM teams ORDER BY name`)
    .all()
    .filter((team) => WORLD_CUP_2026_NATIONS.includes(team.name));
}

async function importFcRatings() {
  const teams = existingTeams();

  if (teams.length === 0) {
    throw new Error("No teams in database. Run npm run import:squads first.");
  }

  console.log(`Fetching FC 26 ratings from fcratings.com for ${teams.length} teams...`);

  let totalUpdated = 0;
  const importedAt = new Date().toISOString();

  for (const team of teams) {
    const dbPlayers = db
      .prepare(
        `SELECT api_id, name, rating FROM players WHERE team_id = ? ORDER BY name`,
      )
      .all(team.api_id);

    if (dbPlayers.length === 0) {
      continue;
    }

    let sourcePlayers;

    try {
      sourcePlayers = await fetchNationRatings(team.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${team.name}: ${message}`);
      continue;
    }

    const squadPlayers = dbPlayers.map((player) => ({ ...player, rating: null, potential: null }));
    const matched = matchRatingsToSquad(squadPlayers, sourcePlayers);

    if (sourcePlayers.length === 0) {
      console.log(`${team.name}: skipped (no FC26 ratings returned)`);
      continue;
    }

    let teamUpdated = 0;

    for (const player of squadPlayers) {
      if (!player.ratingMatched || player.rating == null) {
        continue;
      }

      updatePlayer.run({
        api_id: player.api_id,
        rating: player.rating,
        potential: player.potential,
        position: player.position,
        position_code: player.positionCode,
        imported_at: importedAt,
      });
      teamUpdated += 1;
    }

    totalUpdated += teamUpdated;
    console.log(
      `${team.name}: ${teamUpdated}/${dbPlayers.length} ratings ` +
        `(${matched} FC26 matches, pool: ${sourcePlayers.length})`,
    );

    if (requestDelayMs > 0) {
      await sleep(requestDelayMs);
    }
  }

  let overrideCount = 0;
  const allPlayers = db
    .prepare(
      `SELECT p.api_id, p.name, p.rating, p.position, p.position_code
       FROM players p`,
    )
    .all();

  for (const player of allPlayers) {
    const override = worldCupRatingFor(player.name);

    if (!override) {
      continue;
    }

    updatePlayer.run({
      api_id: player.api_id,
      rating: override.rating,
      potential: null,
      position: override.position,
      position_code: override.positionCode,
      imported_at: importedAt,
    });
    overrideCount += 1;
  }

  if (overrideCount > 0) {
    console.log(`World Cup patch overrides: ${overrideCount}`);
  }

  db.prepare(
    `UPDATE imports
     SET completed_at = ?, status = ?, teams_count = ?, players_count = ?
     WHERE id = ?`,
  ).run(
    new Date().toISOString(),
    "completed",
    teams.length,
    totalUpdated + overrideCount,
    importId,
  );

  console.log("");
  console.log(
    `FC Ratings import complete: ${totalUpdated} nation ratings, ` +
      `${overrideCount} World Cup overrides.`,
  );
  console.log(`Database: ${databasePath}`);
}

try {
  await importFcRatings();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  db.prepare(
    `UPDATE imports SET completed_at = ?, status = ?, error = ? WHERE id = ?`,
  ).run(new Date().toISOString(), "failed", message, importId);

  console.error(`FC Ratings import failed: ${message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
