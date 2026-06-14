import "dotenv/config";

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { WORLD_CUP_2026_GROUPS } from "./world-cup-2026-teams.mjs";
import { buildGameBootstrap, writeGameBootstrapFile } from "./export-game-data.mjs";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const webDir = path.join(rootDir, "web");
const databasePath = path.resolve(
  rootDir,
  process.env.DATABASE_PATH ?? "./data/foot-games.sqlite",
);
const port = Number(process.env.PORT ?? 3000);

const db = new Database(databasePath, { readonly: true });

const teamStats = db
  .prepare(
    `SELECT
       teams.api_id,
       teams.name,
       COUNT(players.api_id) AS player_count,
       ROUND(AVG(players.rating), 2) AS avg_rating,
       MAX(players.rating) AS top_rating
     FROM teams
     LEFT JOIN players ON players.team_id = teams.api_id
     GROUP BY teams.api_id, teams.name`,
  )
  .all()
  .reduce((map, team) => {
    map.set(team.name, team);
    return map;
  }, new Map());

const playersByTeam = db.prepare(
  `SELECT
     players.name,
     players.position,
     players.position_code,
     players.rating,
     players.club,
     players.age
   FROM players
   JOIN teams ON teams.api_id = players.team_id
   WHERE teams.name = ?
   ORDER BY players.rating IS NULL, players.rating DESC, players.name`,
);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

const bootstrapPath = path.join(webDir, "data", "game-bootstrap.json");

function ensureGameDataFile() {
  try {
    const count = writeGameBootstrapFile(databasePath, bootstrapPath);
    console.log(`Game data: ${count} players ready`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Game data export skipped: ${message}`);
  }
}

function buildGameBootstrapFromDb() {
  return buildGameBootstrap(db);
}

function buildOverview() {
  const groups = Object.entries(WORLD_CUP_2026_GROUPS).map(([group, nations]) => ({
    group,
    teams: nations.map((name) => {
      const stats = teamStats.get(name);

      return {
        name,
        playerCount: stats?.player_count ?? 0,
        avgRating: stats?.avg_rating ?? null,
        topRating: stats?.top_rating ?? null,
        inDatabase: Boolean(stats?.player_count),
      };
    }),
  }));

  const loadedTeams = groups.flatMap((group) =>
    group.teams.filter((team) => team.inDatabase),
  );
  const playerCount = db
    .prepare(`SELECT COUNT(*) AS count FROM players`)
    .get().count;
  const ratedCount = db
    .prepare(`SELECT COUNT(*) AS count FROM players WHERE rating IS NOT NULL`)
    .get().count;
  const ratingsImportedAt = db
    .prepare(
      `SELECT MAX(imported_at) AS value FROM players WHERE rating IS NOT NULL`,
    )
    .get().value;
  const lastEaImport = db
    .prepare(
      `SELECT completed_at FROM imports
       WHERE source = 'EA Drop API' AND status = 'completed'
       ORDER BY id DESC LIMIT 1`,
    )
    .get()?.completed_at;

  return {
    nationCount: groups.reduce((total, group) => total + group.teams.length, 0),
    loadedTeamCount: loadedTeams.length,
    playerCount,
    ratedCount,
    ratingsImportedAt,
    lastEaImport,
    ratingSource: "FC Ratings FC 26",
    groups,
  };
}

function serveStatic(request, response) {
  const rawPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const relativePath = rawPath.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(webDir, relativePath));

  if (!filePath.startsWith(webDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] ?? "application/octet-stream",
  });
  response.end(fs.readFileSync(filePath));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/game/bootstrap") {
    sendJson(response, 200, buildGameBootstrapFromDb());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/overview") {
    sendJson(response, 200, buildOverview());
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/teams/")) {
    const teamName = decodeURIComponent(url.pathname.slice("/api/teams/".length));

    if (!Object.values(WORLD_CUP_2026_GROUPS).flat().includes(teamName)) {
      sendJson(response, 404, { error: "Équipe inconnue." });
      return;
    }

    sendJson(response, 200, {
      team: teamName,
      players: playersByTeam.all(teamName),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/game.html") {
    response.writeHead(301, { Location: "/" });
    response.end();
    return;
  }

  if (request.method === "GET") {
    serveStatic(request, response);
    return;
  }

  response.writeHead(405);
  response.end("Method not allowed");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Try: $env:PORT=3001; npm run dev`,
    );
  } else {
    console.error(error.message);
  }

  process.exit(1);
});

server.listen(port, () => {
  ensureGameDataFile();
  console.log(`Foot Games: http://localhost:${port}`);
  console.log(`Database: ${databasePath}`);
});
