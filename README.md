# Foot Games data importer

Imports the 2026 World Cup national teams and their squads into a local SQLite
database.

## Setup

1. Copy `.env.example` to `.env`.
2. Install dependencies:

```powershell
npm install
```

## Import

### Option A: ESPN squads + EA ratings (recommended)

Imports **official 26-man squads** from ESPN (free, no API key), then enriches
players with EA FC ratings by matching names.

```powershell
npm run import:squads
npm run import:ratings
```

Or both in one command:

```powershell
npm run import:wc
```

### Option A2: ESPN squads + FIFA Index ratings (most up to date)

Uses [fifaindex.com](https://fifaindex.com/) FC 26 player ratings. The first
run may open a browser window to pass Cloudflare once (`FIFAINDEX_HEADED=true`).

```powershell
npm run import:squads
npm run import:fifaindex
```

Or:

```powershell
npm run import:full
```

Optional `.env` settings:

- `FIFAINDEX_HEADED=true` — show browser for Cloudflare verification
- `FIFAINDEX_REQUEST_DELAY_MS=400` — delay between nation page requests

### Option B: EA FC ratings only (not real squads)

Keeps the top-rated EA FC players per nationality — not the real World Cup
squads.

```powershell
npm run import:ratings
```

Ratings are stored on a 0-10 scale (`overallRating` 91 → 9.1).

Optional `.env` settings:

- `EA_REPLACE=true` — replace ESPN squads with EA top players
- `EA_SQUAD_SIZE=26` — players kept per nation when replacing squads
- `EA_REQUEST_DELAY_MS=100` — delay between EA requests
- `ESPN_REQUEST_DELAY_MS=150` — delay between ESPN roster requests

### Option C: SoFIFA ratings (often blocked)

SoFIFA (`api.sofifa.net`) is protected by Cloudflare and may block automated
requests even from your machine. If it works for you:

```powershell
npm run import:sofifa
```

### Option D: World Cup API squads

Run the World Cup API import when your key has data access enabled:

```powershell
npm run import:worldcup
```

If players are already in the database, `npm run import:sofifa` enriches their
ratings by matching player names against SoFIFA squads.

## Inspect

```powershell
npm run db:players
```

## Test page

Launch a small local web UI to browse groups and squads:

```powershell
npm run import:ratings
npm run dev
```

Then open http://localhost:3000

Optional: `PORT=4000` in `.env` to change the port.

The useful tables are:

- `teams`: the national teams.
- `players`: player name, national team, position and rating.
- `imports`: import history and errors.

`rating` is filled when the API provides one, or estimated from goalscorer
data when available. It can be `NULL` before the tournament starts. The
inspection command also shows `rating_100`, which is the same value multiplied
by 10.

## Jeu solo 7-a-side

```powershell
npm run import:full
npm run dev
```

Ouvre http://localhost:3000

1. Choisis une formation et un groupe CDM 2026
2. Draft : nation tirée au sort → 3 joueurs → 3 rolls max par poste
3. Phase de groupes puis 8es, quarts, demis et finale simulés

## API reference

Base URL: `https://api.worldcupapi.com`

Authentication: `?key=YOUR_API_KEY` on every request.

Useful endpoints for the game:

- `/standings?group=A` — teams per group
- `/squads?team_id=...` — full squad
- `/fixtures` — scheduled matches
- `/livescores` — live matches
- `/goalscorers` — top scorers
- `/lineups?match_id=...` — match lineups
