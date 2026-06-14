import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import {
  createEaRatingsClient,
  groupPlayersByNationality,
  normalizeName,
  normalizeRating,
} from "./ea-ratings-api.mjs";
import { findEaPlayerMatch } from "./name-match.mjs";
import {
  eaNationNameFromFrench,
  frenchNationName,
  worldCupEaNationNames,
} from "./world-cup-2026-teams.mjs";

const WORLD_CUP_SEASON = 2026;
const DEFAULT_SQUAD_SIZE = 26;

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const databasePath = path.resolve(
  rootDir,
  process.env.DATABASE_PATH ?? "./data/foot-games.sqlite",
);
const schemaPath = path.join(rootDir, "database", "schema.sql");
const requestDelayMs = Number(process.env.EA_REQUEST_DELAY_MS ?? 100);
const squadSize = Number(process.env.EA_SQUAD_SIZE ?? DEFAULT_SQUAD_SIZE);
const nationFilter =
  process.env.EA_ALL_NATIONS === "true"
    ? null
    : (process.env.EA_NATIONS?.split(",")
        .map((entry) => entry.trim())
        .filter(Boolean) ?? worldCupEaNationNames());

const client = createEaRatingsClient({ requestDelayMs });

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.exec(fs.readFileSync(schemaPath, "utf8"));
ensureColumn("players", "rating", "REAL");
ensureColumn("players", "appearances", "INTEGER");
ensureColumn("players", "minutes_played", "INTEGER");
ensureColumn("players", "sofifa_id", "INTEGER");
ensureColumn("players", "potential", "INTEGER");
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
  .run("EA Drop API", "FIFA National Teams", WORLD_CUP_SEASON, startedAt, "running");
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
    potential,
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
    @potential,
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
    potential = excluded.potential,
    club = excluded.club,
    imported_at = excluded.imported_at
`);

const updatePlayerRating = db.prepare(`
  UPDATE players
  SET
    rating = COALESCE(@rating, rating),
    potential = COALESCE(@potential, potential),
    club = COALESCE(@club, club),
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

function existingTeams() {
  return db
    .prepare(`SELECT api_id, name, country FROM teams ORDER BY name`)
    .all();
}

function findEaTeam(teams, team) {
  const candidates = [
    team.name,
    team.country,
    eaNationNameFromFrench(team.name),
    eaNationNameFromFrench(team.country),
  ]
    .filter(Boolean)
    .map((entry) => normalizeName(entry));

  return teams.find((entry) => {
    const names = [entry.name, entry.country].map((value) => normalizeName(value));
    return candidates.some((candidate) => names.includes(candidate));
  });
}

function saveTournamentData(teams, players, importedAt) {
  db.prepare("DELETE FROM players").run();

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
      potential: player.potential,
      club: player.club,
      imported_at: importedAt,
    });
  }
}

async function enrichExistingRatings(grouped, importedAt) {
  const positionsOnly = process.env.EA_POSITIONS_ONLY === "true";
  let updated = 0;

  for (const team of existingTeams()) {
    const eaTeam = findEaTeam(grouped.teams, team);

    if (!eaTeam) {
      console.log(`No EA match for ${team.name}`);
      continue;
    }

    const eaPlayers = grouped.players.filter(
      (player) => player.teamId === eaTeam.id,
    );
    const dbPlayers = db
      .prepare(`SELECT api_id, name FROM players WHERE team_id = ?`)
      .all(team.api_id);
    let teamUpdated = 0;

    for (const dbPlayer of dbPlayers) {
      const eaPlayer = findEaPlayerMatch(dbPlayer.name, eaPlayers);

      if (!eaPlayer) {
        continue;
      }

      if (positionsOnly) {
        if (!eaPlayer.position && !eaPlayer.club) {
          continue;
        }

        updatePlayerRating.run({
          api_id: dbPlayer.api_id,
          rating: null,
          potential: null,
          club: eaPlayer.club,
          position: eaPlayer.position,
          position_code: eaPlayer.positionCode,
          imported_at: importedAt,
        });
      } else if (eaPlayer.rating) {
        updatePlayerRating.run({
          api_id: dbPlayer.api_id,
          rating: eaPlayer.rating,
          potential: eaPlayer.potential,
          club: eaPlayer.club,
          position: eaPlayer.position,
          position_code: eaPlayer.positionCode,
          imported_at: importedAt,
        });
      } else {
        continue;
      }

      teamUpdated += 1;
      updated += 1;
    }

    console.log(
      `${team.name}: ${teamUpdated} ${positionsOnly ? "positions" : "ratings"} updated`,
    );
  }

  return updated;
}

async function importEaRatings() {
  const positionsOnly = process.env.EA_POSITIONS_ONLY === "true";
  console.log("Downloading EA FC player ratings...");

  const rawPlayers = await client.fetchAllPlayers((loaded, total) => {
    process.stdout.write(`\r[${loaded}/${total}] players downloaded`);
  });
  console.log("");

  const hasExistingPlayers = db
    .prepare(`SELECT COUNT(*) AS count FROM players`)
    .get().count;
  const replaceSquads = process.env.EA_REPLACE === "true";
  const enrichOnly =
    process.env.EA_ENRICH_ONLY === "true" ||
    (hasExistingPlayers > 0 && !replaceSquads);

  let grouped = groupPlayersByNationality(rawPlayers, {
    squadSize: enrichOnly ? 0 : squadSize,
  });

  if (nationFilter?.length) {
    const allowed = new Set(nationFilter.map((entry) => normalizeName(entry)));
    const matchedTeams = grouped.teams.filter((team) =>
      allowed.has(normalizeName(team.name)),
    );
    const found = new Set(
      matchedTeams.map((team) => normalizeName(team.name)),
    );
    const missing = nationFilter.filter(
      (nation) => !found.has(normalizeName(nation)),
    );

    if (missing.length > 0) {
      console.warn(`Nations not found in EA data: ${missing.join(", ")}`);
    }

    const teamIds = new Set(matchedTeams.map((team) => team.id));
    grouped = {
      teams: matchedTeams.map((team) => ({
        ...team,
        name: frenchNationName(team.name),
        country: frenchNationName(team.country),
      })),
      players: grouped.players.filter((player) => teamIds.has(player.teamId)),
    };
  }

  if (grouped.teams.length === 0) {
    throw new Error("EA Ratings API returned no national teams.");
  }

  const importedAt = new Date().toISOString();

  let teamsCount = 0;
  let playersCount = 0;
  let ratingsCount = 0;

  if (enrichOnly && hasExistingPlayers > 0) {
    console.log(
      positionsOnly
        ? "Existing players found, enriching positions/clubs only..."
        : "Existing players found, enriching ratings only...",
    );
    ratingsCount = await enrichExistingRatings(grouped, importedAt);
    teamsCount = existingTeams().length;
    playersCount = hasExistingPlayers;
  } else {
    console.log(
      `Importing ${grouped.teams.length} national teams ` +
        `(top ${squadSize} players each)...`,
    );
    saveTournamentData(grouped.teams, grouped.players, importedAt);
    teamsCount = grouped.teams.length;
    playersCount = grouped.players.length;
    ratingsCount = grouped.players.filter((player) => player.rating !== null)
      .length;
  }

  db.prepare(
    `UPDATE imports
     SET completed_at = ?, status = ?, teams_count = ?, players_count = ?
     WHERE id = ?`,
  ).run(
    new Date().toISOString(),
    "completed",
    teamsCount,
    playersCount,
    importId,
  );

  console.log("");
  console.log(
    `EA import complete: ${teamsCount} teams, ${playersCount} players, ` +
      `${ratingsCount} ratings.`,
  );
  console.log(`Database: ${databasePath}`);
}

try {
  await importEaRatings();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  db.prepare(
    `UPDATE imports
     SET completed_at = ?, status = ?, error = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), "failed", message, importId);

  console.error(`EA import failed: ${message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
