import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import {
  createSofifaClient,
  discoverLatestRoster,
  fetchCustomizedPlayers,
  fetchNationalTeams,
  fetchTeamSquad,
  normalizeName,
} from "./sofifa-api.mjs";

const WORLD_CUP_SEASON = 2026;

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const databasePath = path.resolve(
  rootDir,
  process.env.DATABASE_PATH ?? "./data/foot-games.sqlite",
);
const schemaPath = path.join(rootDir, "database", "schema.sql");
const requestDelayMs = Number(process.env.SOFIFA_REQUEST_DELAY_MS ?? 1100);
const rosterOverride = process.env.SOFIFA_ROSTER?.trim();
const apiToken = process.env.SOFIFA_API_TOKEN?.trim();

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.exec(fs.readFileSync(schemaPath, "utf8"));
ensureColumn("players", "rating", "REAL");
ensureColumn("players", "appearances", "INTEGER");
ensureColumn("players", "minutes_played", "INTEGER");
ensureColumn("players", "sofifa_id", "INTEGER");
ensureColumn("players", "potential", "INTEGER");

const client = createSofifaClient({ requestDelayMs });

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
  .run("SoFIFA", "FIFA National Teams", WORLD_CUP_SEASON, startedAt, "running");
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
    sofifa_id,
    potential,
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
    @sofifa_id,
    @potential,
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
    sofifa_id = excluded.sofifa_id,
    potential = excluded.potential,
    imported_at = excluded.imported_at
`);

const updatePlayerRating = db.prepare(`
  UPDATE players
  SET
    rating = @rating,
    sofifa_id = @sofifa_id,
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

function existingTeams() {
  return db
    .prepare(`SELECT api_id, name, country FROM teams ORDER BY name`)
    .all();
}

function findNationalTeam(nationalTeams, team) {
  const teamName = normalizeName(team.name ?? team.team_name);
  const teamCountry = normalizeName(team.country ?? team.team_country);

  return (
    nationalTeams.find((entry) => normalizeName(entry.name) === teamName) ??
    nationalTeams.find((entry) => normalizeName(entry.country) === teamCountry) ??
    nationalTeams.find(
      (entry) =>
        normalizeName(entry.country) === teamName ||
        normalizeName(entry.name) === teamCountry,
    )
  );
}

async function enrichExistingRatingsAsync(nationalTeams, importedAt) {
  let updated = 0;

  for (const team of existingTeams()) {
    const sofifaTeam = findNationalTeam(nationalTeams, team);

    if (!sofifaTeam) {
      console.log(`No SoFIFA match for ${team.name}`);
      continue;
    }

    const squad = await fetchTeamSquad(client, sofifaTeam.id);
    const dbPlayers = db
      .prepare(
        `SELECT api_id, name
         FROM players
         WHERE team_id = ?
         ORDER BY name`,
      )
      .all(team.api_id);
    const ratingByName = new Map(
      squad.players.map((player) => [normalizeName(player.name), player]),
    );
    let teamUpdated = 0;

    for (const dbPlayer of dbPlayers) {
      const sofifaPlayer = ratingByName.get(normalizeName(dbPlayer.name));

      if (!sofifaPlayer?.rating) {
        continue;
      }

      updatePlayerRating.run({
        api_id: dbPlayer.api_id,
        rating: sofifaPlayer.rating,
        sofifa_id: sofifaPlayer.id,
        potential: sofifaPlayer.potential,
        imported_at: importedAt,
      });
      teamUpdated += 1;
      updated += 1;
    }

    console.log(
      `${team.name}: ${teamUpdated} ratings updated ` +
        `(${squad.players.length} SoFIFA players)`,
    );
  }

  return updated;
}

async function importNationalSquads(nationalTeams, importedAt) {
  const teams = [];
  const players = [];

  for (const [index, team] of nationalTeams.entries()) {
    const squad = await fetchTeamSquad(client, team.id);
    teams.push(squad.team);
    players.push(...squad.players);

    console.log(
      `[${index + 1}/${nationalTeams.length}] ${team.name}: ` +
        `${squad.players.length} players`,
    );
  }

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
      sofifa_id: player.id,
      potential: player.potential,
      imported_at: importedAt,
    });
  }

  return {
    teams: teams.length,
    players: players.length,
    ratings: players.filter((player) => player.rating !== null).length,
  };
}

async function importCustomizedPlayers(importedAt) {
  console.log("Fetching public customized players from SoFIFA...");
  const { teams, players } = await fetchCustomizedPlayers(client, apiToken);

  if (players.length === 0) {
    throw new Error(
      "SoFIFA returned no public customized players for this API token.",
    );
  }

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
      sofifa_id: player.id,
      potential: player.potential,
      imported_at: importedAt,
    });
  }

  return {
    teams: teams.length,
    players: players.length,
    ratings: players.filter((player) => player.rating !== null).length,
  };
}

async function importSofifaRatings() {
  const importedAt = new Date().toISOString();
  const hasExistingPlayers = db
    .prepare(`SELECT COUNT(*) AS count FROM players`)
    .get().count;

  let teamsCount = 0;
  let playersCount = 0;
  let ratingsCount = 0;

  if (apiToken && hasExistingPlayers === 0) {
    try {
      const summary = await importCustomizedPlayers(importedAt);
      teamsCount = summary.teams;
      playersCount = summary.players;
      ratingsCount = summary.ratings;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (
        !message.includes("no public customized players") &&
        !message.includes("blocked by Cloudflare")
      ) {
        throw error;
      }

      console.log(`Customized import unavailable (${message}). Falling back...`);
    }
  }

  if (playersCount === 0) {
    const roster = rosterOverride ?? (await discoverLatestRoster(client));
    console.log(`Using SoFIFA roster ${roster}`);

    const nationalTeams = await fetchNationalTeams(client, roster);
    console.log(`Found ${nationalTeams.length} national teams on SoFIFA`);

    if (nationalTeams.length === 0) {
      throw new Error("SoFIFA API returned no national teams.");
    }

    if (hasExistingPlayers > 0) {
      console.log("Existing players found, enriching ratings only...");
      ratingsCount = await enrichExistingRatingsAsync(nationalTeams, importedAt);
      teamsCount = existingTeams().length;
      playersCount = hasExistingPlayers;
    } else {
      console.log("Importing national squads and ratings...");
      const summary = await importNationalSquads(nationalTeams, importedAt);
      teamsCount = summary.teams;
      playersCount = summary.players;
      ratingsCount = summary.ratings;
    }
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
    `SoFIFA import complete: ${teamsCount} teams, ${playersCount} players, ` +
      `${ratingsCount} ratings.`,
  );
  console.log(`Database: ${databasePath}`);
}

try {
  await importSofifaRatings();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  db.prepare(
    `UPDATE imports
     SET completed_at = ?, status = ?, error = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), "failed", message, importId);

  console.error(`SoFIFA import failed: ${message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
