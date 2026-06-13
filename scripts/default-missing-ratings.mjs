import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

const DEFAULT_OVR = Number(process.env.DEFAULT_PLAYER_OVR ?? 50);
const DEFAULT_RATING = DEFAULT_OVR / 10;

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const databasePath = path.resolve(
  rootDir,
  process.env.DATABASE_PATH ?? "./data/foot-games.sqlite",
);

export function applyDefaultMissingRatings(db, importedAt = new Date().toISOString()) {
  const result = db
    .prepare(
      `UPDATE players
       SET
         rating = @rating,
         potential = COALESCE(potential, @potential),
         imported_at = @imported_at
       WHERE rating IS NULL`,
    )
    .run({
      rating: DEFAULT_RATING,
      potential: DEFAULT_OVR,
      imported_at: importedAt,
    });

  return Number(result.changes);
}

function main() {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  const updated = applyDefaultMissingRatings(db);

  console.log(
    `Default rating applied: ${updated} players set to ${DEFAULT_OVR} OVR (${DEFAULT_RATING}).`,
  );
  console.log(`Database: ${databasePath}`);
  db.close();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
