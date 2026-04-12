import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.resolve(rootDir, 'data');
const dbFile = path.resolve(dataDir, 'leaderboard.sqlite');

const PORT = Number.parseInt(process.env.LEADERBOARD_PORT ?? '8787', 10);
const HOST = process.env.LEADERBOARD_HOST ?? '127.0.0.1';

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.exec(`
  create table if not exists leaderboard_entries (
    id integer primary key autoincrement,
    player_name text not null check (length(player_name) between 1 and 16),
    score integer not null check (score >= 0),
    stage integer not null check (stage between 1 and 3),
    duration_sec integer not null check (duration_sec >= 0),
    created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  create index if not exists idx_leaderboard_score_desc
    on leaderboard_entries (score desc, duration_sec asc, created_at asc);
`);

const insertScoreStmt = db.prepare(`
  insert into leaderboard_entries (player_name, score, stage, duration_sec)
  values (@playerName, @score, @stage, @durationSec)
`);

const selectTopStmt = db.prepare(`
  select
    id,
    player_name as playerName,
    score,
    stage,
    duration_sec as durationSec,
    created_at as createdAt
  from leaderboard_entries
  order by score desc, duration_sec asc, created_at asc
  limit ?
`);

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '请求体无效。' };
  }

  const playerName = typeof body.playerName === 'string' ? body.playerName.trim() : '';
  const score = Number(body.score);
  const stage = Number(body.stage);
  const durationSec = Number(body.durationSec);

  if (playerName.length < 1 || playerName.length > 16) {
    return { ok: false, error: '昵称长度需在 1 到 16 个字符之间。' };
  }

  if (!Number.isFinite(score) || score < 0) {
    return { ok: false, error: '分数无效。' };
  }

  if (!Number.isFinite(stage) || stage < 1 || stage > 3) {
    return { ok: false, error: '赛段参数无效。' };
  }

  if (!Number.isFinite(durationSec) || durationSec < 0) {
    return { ok: false, error: '用时参数无效。' };
  }

  return {
    ok: true,
    value: {
      playerName,
      score: clampInt(score, 0, Number.MAX_SAFE_INTEGER),
      stage: clampInt(stage, 1, 3),
      durationSec: clampInt(durationSec, 0, Number.MAX_SAFE_INTEGER),
    },
  };
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/leaderboard', (req, res) => {
  const limit = clampInt(Number(req.query.limit), 1, 50);
  const rows = selectTopStmt.all(limit);
  res.json({ rows });
});

app.post('/api/leaderboard', (req, res) => {
  const validated = validatePayload(req.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }

  const result = insertScoreStmt.run(validated.value);
  res.status(201).json({
    id: String(result.lastInsertRowid),
  });
});

app.use((error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : '服务内部错误';
  res.status(500).json({ error: message });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[leaderboard] sqlite db: ${dbFile}`);
  console.log(`[leaderboard] listening on http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
