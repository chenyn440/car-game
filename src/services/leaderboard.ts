import type { LeaderboardEntry, RunResult } from '../types';

const SUBMITTED_RUNS_KEY = 'rush-grid-submitted-runs';
const apiBaseRaw = (import.meta.env.VITE_LEADERBOARD_API_BASE ?? '').trim();
const apiBase = apiBaseRaw.replace(/\/+$/, '');

function apiUrl(pathname: string): string {
  if (!apiBase) {
    return pathname;
  }
  return `${apiBase}${pathname}`;
}

function parseSubmittedRuns(): Set<string> {
  const raw = localStorage.getItem(SUBMITTED_RUNS_KEY);
  if (!raw) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

function persistSubmittedRuns(runIds: Set<string>): void {
  const compact = Array.from(runIds).slice(-200);
  localStorage.setItem(SUBMITTED_RUNS_KEY, JSON.stringify(compact));
}

async function requestJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(pathname), init);
  } catch {
    throw new Error('本地排行榜服务不可用，请确认 SQLite 服务已启动。');
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error('排行榜服务返回了无效响应。');
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `请求失败（${response.status}）`;
    throw new Error(message);
  }

  return payload as T;
}

export function isLeaderboardConfigured(): boolean {
  // SQLite 本地榜单默认可用；服务未启动时由请求报错提示。
  return true;
}

export function validatePlayerName(input: string): string | null {
  const value = input.trim();
  if (value.length < 1 || value.length > 16) {
    return null;
  }
  return value;
}

function sanitizeRunResult(result: RunResult): RunResult {
  return {
    playerName: result.playerName.trim(),
    runId: result.runId,
    score: Math.max(0, Math.floor(result.score)),
    stage: Math.max(1, Math.min(3, Math.floor(result.stage))),
    durationSec: Math.max(0, Math.floor(result.durationSec)),
  };
}

export async function submitScore(result: RunResult): Promise<void> {
  const safeResult = sanitizeRunResult(result);
  const validName = validatePlayerName(safeResult.playerName);

  if (!validName) {
    throw new Error('昵称长度需在 1 到 16 个字符之间。');
  }

  const submitted = parseSubmittedRuns();
  if (submitted.has(safeResult.runId)) {
    return;
  }

  await requestJson<{ id: string }>('/api/leaderboard', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      playerName: validName,
      score: safeResult.score,
      stage: safeResult.stage,
      durationSec: safeResult.durationSec,
    }),
  });

  submitted.add(safeResult.runId);
  persistSubmittedRuns(submitted);
}

export async function fetchTopScores(limit = 20): Promise<LeaderboardEntry[]> {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const data = await requestJson<{ rows: LeaderboardEntry[] }>(`/api/leaderboard?limit=${safeLimit}`);
  return Array.isArray(data.rows) ? data.rows : [];
}
