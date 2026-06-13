import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import {
  createFifaIndexBrowser,
  ensureCloudflarePassed,
  matchRatingsToSquad,
  scrapeTeamRatings,
} from "./fifaindex-scraper.mjs";
import { applyDefaultMissingRatings } from "./default-missing-ratings.mjs";
import { WORLD_CUP_2026_NATIONS } from "./world-cup-2026-teams.mjs";

const WORLD_CUP_SEASON = 2026;
const requestDelayMs = Number(process.env.FIFAINDEX_REQUEST_DELAY_MS ?? 400);

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
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
    `INSERT INTO imports (
      source,
      competition,
      season,
      started_at,
      status
    ) VALUES (?, ?, ?, ?, ?)`,
  )
  .run("FIFA Index", "EA FC 26", WORLD_CUP_SEASON, startedAt, "running");
const importId = Number(importResult.lastInsertRowid);

const updatePlayerRating = db.prepare(`
  UPDATE players
  SET
    rating = @rating,
    potential = @potential,
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

async function importFifaIndexRatings() {
  const teams = existingTeams();

  if (teams.length === 0) {
    throw new Error(
      "No teams in database. Run npm run import:squads first.",
    );
  }

  console.log(
    `Scraping FIFA Index FC 26 ratings for ${teams.length} teams...`,
  );

  const { context, page } = await createFifaIndexBrowser();
  let totalUpdated = 0;

  try {
    await ensureCloudflarePassed(page);

    const importedAt = new Date().toISOString();

    for (const team of teams) {
      const dbPlayers = db
        .prepare(
          `SELECT api_id, name, rating FROM players WHERE team_id = ? ORDER BY name`,
        )
        .all(team.api_id);

      if (dbPlayers.length === 0) {
        console.log(`${team.name}: no players in database`);
        continue;
      }

      let fifaPlayers;

      try {
        fifaPlayers = await scrapeTeamRatings(page, team.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${team.name}: ${message}`);
        continue;
      }

      const squadPlayers = dbPlayers.map((player) => ({ ...player }));
      const matched = matchRatingsToSquad(squadPlayers, fifaPlayers);

      for (const player of squadPlayers) {
        if (player.rating == null) {
          continue;
        }

        updatePlayerRating.run({
          api_id: player.api_id,
          rating: player.rating,
          potential: player.potential,
          imported_at: importedAt,
        });
      }

      totalUpdated += matched;
      console.log(
        `${team.name}: ${matched}/${dbPlayers.length} ratings ` +
          `(FIFA Index squad: ${fifaPlayers.length})`,
      );

      if (requestDelayMs > 0) {
        await sleep(requestDelayMs);
      }
    }
  } finally {
    await context.close();
  }

  const playersCount = db.prepare(`SELECT COUNT(*) AS count FROM players`).get()
    .count;
  const defaultApplied = applyDefaultMissingRatings(db, new Date().toISOString());
  const ratingsCount = db
    .prepare(`SELECT COUNT(*) AS count FROM players WHERE rating IS NOT NULL`)
    .get().count;

  db.prepare(
    `UPDATE imports
     SET completed_at = ?, status = ?, teams_count = ?, players_count = ?
     WHERE id = ?`,
  ).run(
    new Date().toISOString(),
    "completed",
    teams.length,
    playersCount,
    importId,
  );

  console.log("");
  console.log(
    `FIFA Index import complete: ${totalUpdated} ratings updated, ` +
      `${defaultApplied} defaults at 50 OVR, ` +
      `${ratingsCount}/${playersCount} players with a rating.`,
  );
  console.log(`Database: ${databasePath}`);
}

try {
  await importFifaIndexRatings();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  db.prepare(
    `UPDATE imports
     SET completed_at = ?, status = ?, error = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), "failed", message, importId);

  console.error(`FIFA Index import failed: ${message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
