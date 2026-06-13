PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teams (
  api_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  country TEXT,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  api_id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  age INTEGER,
  shirt_number INTEGER,
  position TEXT,
  position_code TEXT,
  rating REAL,
  appearances INTEGER,
  minutes_played INTEGER,
  imported_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(api_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS players_team_id_idx ON players(team_id);
CREATE INDEX IF NOT EXISTS players_position_code_idx ON players(position_code);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  competition TEXT NOT NULL,
  season INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  teams_count INTEGER NOT NULL DEFAULT 0,
  players_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
