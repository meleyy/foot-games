import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { applyDefaultMissingRatings } from "./default-missing-ratings.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = path.resolve(
  rootDir,
  process.env.DATABASE_PATH ?? "./data/foot-games.sqlite",
);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);

const trimmed = db
  .prepare(`UPDATE players SET name = TRIM(name) WHERE name != TRIM(name)`)
  .run();

const resetDefaults = db
  .prepare(
    `UPDATE players
     SET rating = NULL, potential = NULL
     WHERE rating = 5 AND COALESCE(potential, 50) = 50`,
  )
  .run();

console.log(`Trimmed ${trimmed.changes} player names.`);
console.log(`Reset ${resetDefaults.changes} default 5.0 ratings.`);

db.close();
