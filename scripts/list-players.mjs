import "dotenv/config";

import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const databasePath = path.resolve(
  rootDir,
  process.env.DATABASE_PATH ?? "./data/foot-games.sqlite",
);

const db = new Database(databasePath, { readonly: true });
const rows = db
  .prepare(
    `SELECT
       teams.name AS team,
       players.name,
       players.position_code AS position,
       players.rating,
       CASE
         WHEN players.rating IS NULL THEN NULL
         ELSE ROUND(players.rating * 10, 1)
       END AS rating_100,
       players.potential,
       players.club,
       players.appearances
     FROM players
     JOIN teams ON teams.api_id = players.team_id
     ORDER BY
       players.rating IS NULL,
       players.rating DESC,
       teams.name,
       players.name`,
  )
  .all();

console.table(rows);
console.log(`${rows.length} players`);
db.close();
