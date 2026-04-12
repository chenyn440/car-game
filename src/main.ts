import './style.css';
import { createRacingEngine } from './engine';
import type { EngineEvent, HudState, InputState, RaceResult, RacingEngine } from './engine/types';
import { fetchTopScores, submitScore, validatePlayerName } from './services/leaderboard';
import type { RunResult } from './types';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app container');
}
document.body.classList.add('theme-cn-neon');

app.innerHTML = `
  <div class="layout">
    <main class="panel race-shell arena-panel">
      <canvas id="race-canvas" width="1280" height="720"></canvas>

      <div class="top-hub">
        <div class="top-control-bar">
          <div class="control-full">
            <div class="brand-chip">Turbo Drift Web</div>
            <input id="name-input" maxlength="16" placeholder="玩家昵称（1-16字符）" />
            <button id="start-btn">开始比赛</button>
            <button id="help-btn" class="secondary">玩法说明</button>
            <button id="board-toggle-btn" class="secondary">排行榜</button>
          </div>
          <div class="control-race">
            <button id="camera-btn" class="secondary">镜头（C）</button>
            <button id="quit-btn" class="warn">退出比赛</button>
          </div>
        </div>
        <div id="status" class="status top-status">准备就绪，输入昵称后开始比赛。</div>
      </div>

      <div class="hud-float-tools">
        <button id="hud-toggle-btn" class="secondary">HUD收起</button>
      </div>

      <aside id="leaderboard-drawer" class="leaderboard-drawer">
        <div class="drawer-head">
          <h3>Top 20</h3>
          <div class="drawer-actions">
            <button id="refresh-board-btn" class="secondary">刷新</button>
            <button id="board-close-btn" class="secondary">收起</button>
          </div>
        </div>
        <div class="drawer-table-wrap">
          <table class="score-table">
            <thead>
              <tr>
                <th>#</th>
                <th>昵称</th>
                <th>分数</th>
                <th>记录</th>
                <th>用时</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody id="leaderboard-body"></tbody>
          </table>
        </div>
      </aside>
      <button id="board-edge-btn" class="secondary board-edge-btn">榜单</button>

      <section id="lobby-stage" class="lobby-stage">
        <article class="stage-hero">
          <div class="stage-hero-copy">
            <h2>霓虹赛道已就绪</h2>
            <p>选择昵称后立即开跑。支持漂移蓄氮、道具对抗、天气变化与多圈任务。</p>
            <div class="stage-action-note">主操作入口已在顶部：开始比赛 / 玩法说明 / 排行榜</div>
            <div class="stage-tips">
              <span><strong>W/↑</strong> 油门</span>
              <span><strong>A/D</strong> 转向</span>
              <span><strong>Shift</strong> 漂移</span>
              <span><strong>X</strong> 氮气</span>
              <span><strong>空格</strong> 道具</span>
              <span><strong>C</strong> 镜头</span>
            </div>
          </div>
          <div class="stage-live">
            <div class="stage-live-head">
              <strong>大厅情报</strong>
              <span>每局实时变化</span>
            </div>
            <div class="stage-live-grid">
              <div class="live-item"><span>天气轮换</span><strong>晴 / 雨 / 雾</strong></div>
              <div class="live-item"><span>推荐圈速</span><strong>01:52.400</strong></div>
              <div class="live-item"><span>AI 强度</span><strong>中-高</strong></div>
              <div class="live-item"><span>道具节奏</span><strong>18s 一轮</strong></div>
            </div>
            <div class="stage-live-track">
              <div class="stage-live-track-head">
                <span>实时赛道进度</span>
                <em id="live-track-status">等待开跑</em>
              </div>
              <div id="live-track-line" class="track-line" role="img" aria-label="实时赛道进度"></div>
            </div>
          </div>
        </article>
        <div class="stage-grid">
          <article class="stage-card">
            <strong>开跑流程</strong>
            <p>1. 输入昵称并点击开始</p>
            <p>2. 倒计时结束后按住油门</p>
            <p>3. 弯道漂移，直道开氮气</p>
          </article>
          <article class="stage-card">
            <strong>比赛目标</strong>
            <p>冲线名次越高，得分越高。</p>
            <p>完成任务、连击和近道可额外加分。</p>
          </article>
          <article class="stage-card">
            <strong>每日挑战</strong>
            <p>3 次漂移连击 x4 以上。</p>
            <p>至少 1 圈保持前 2 名。</p>
          </article>
          <article class="stage-card board-card">
            <strong>榜单预览</strong>
            <ul id="board-preview" class="board-preview">
              <li class="empty">正在加载榜单…</li>
            </ul>
          </article>
        </div>
      </section>

      <div id="hud" class="hud">
        <div class="hud-cluster hud-left">
          <div class="hud-item hud-item-primary"><strong>速度</strong><span id="hud-speed">0 km/h</span></div>
        </div>
        <div class="hud-cluster hud-center">
          <div class="hud-item is-lap"><strong>圈数</strong><span id="hud-lap">1/3</span></div>
          <div id="hud-rank-card" class="hud-item is-rank"><strong>排名</strong><span id="hud-position">1/4</span></div>
          <div class="hud-item is-progress"><strong>进度</strong><span id="hud-progress">0%</span></div>
          <div class="hud-item is-time"><strong>计时</strong><span id="hud-time">00:00.000</span></div>
        </div>
        <div class="hud-cluster hud-right">
          <div class="hud-item is-nitro"><strong>氮气</strong><span id="hud-nitro">0%</span></div>
          <div class="hud-item is-heat"><strong>热量</strong><span id="hud-heat">0%</span></div>
          <div class="hud-item is-weather"><strong>天气</strong><span id="hud-weather">晴</span></div>
          <div class="hud-item is-item"><strong>道具</strong><span id="hud-item">无</span></div>
          <div class="hud-item is-objective"><strong>任务</strong><span id="hud-objective">准备中</span></div>
          <div class="hud-item is-style"><strong>技巧</strong><span id="hud-style">0 · x1</span></div>
        </div>
      </div>

      <div id="result-overlay" class="overlay">
        <div class="modal">
          <h3 id="result-title">比赛结果</h3>
          <p id="result-detail"></p>
          <p id="submit-status" class="status"></p>
          <div class="stack">
            <button id="again-btn" class="warn">再来一局</button>
            <button id="lobby-btn" class="secondary">返回大厅</button>
          </div>
        </div>
      </div>

      <div id="help-overlay" class="overlay help-overlay">
        <div class="modal help-modal">
          <div class="help-head">
            <h3 id="help-title">玩法说明</h3>
            <button id="help-close-btn" class="secondary">关闭</button>
          </div>
          <p class="help-subtitle">目标是 3 圈冲线。弯道漂移蓄氮，直道爆发，合理使用道具抢位。</p>
          <div class="help-grid">
            <article class="help-card">
              <strong>基础操作</strong>
              <p><kbd>W / ↑</kbd> 加速</p>
              <p><kbd>A / D</kbd> 左右转向</p>
              <p><kbd>S / ↓</kbd> 刹车修正</p>
            </article>
            <article class="help-card">
              <strong>进阶技巧</strong>
              <p><kbd>Shift</kbd> 漂移蓄氮，出弯拉正</p>
              <p><kbd>X</kbd> 直线开氮气，避免弯中空喷</p>
              <p><kbd>空格</kbd> 使用道具，优先卡超车点</p>
            </article>
            <article class="help-card">
              <strong>比赛目标</strong>
              <p>冲线名次越高，得分越高。</p>
              <p>任务与连击会额外加分。</p>
            </article>
            <article class="help-card">
              <strong>视角与节奏</strong>
              <p><kbd>C</kbd> 切换镜头，提升入弯判断。</p>
              <p>先稳住中线，再压弯心抢速度。</p>
            </article>
          </div>
        </div>
      </div>

      <div id="touch-controls" class="touch-controls">
        <div class="touch-col touch-col-main">
          <button class="touch-btn touch-btn-throttle" data-touch="throttle">油门</button>
          <button class="touch-btn touch-btn-brake" data-touch="brake">刹车</button>
          <button class="touch-btn touch-btn-drift" data-touch="drift">漂移</button>
          <button class="touch-btn touch-btn-nitro" data-touch="nitro">氮气</button>
          <button class="touch-btn touch-btn-steer touch-btn-left" data-touch="left" aria-label="向左转向">◀</button>
          <button class="touch-btn touch-btn-steer touch-btn-right" data-touch="right" aria-label="向右转向">▶</button>
          <button class="touch-btn touch-btn-item" data-touch="item">道具</button>
          <button class="touch-btn touch-btn-camera" data-touch="camera">镜头</button>
        </div>
      </div>

      <div id="coach-card" class="coach-card">
        <strong>新手提示</strong>
        <p id="coach-text">你是底部红色车，先按住油门起步。</p>
        <button id="coach-close" class="secondary">我知道了</button>
      </div>

      <div id="toast" class="toast"></div>
    </main>
  </div>
`;

const nameInput = getElement<HTMLInputElement>('name-input');
const startBtn = getElement<HTMLButtonElement>('start-btn');
const cameraBtn = getElement<HTMLButtonElement>('camera-btn');
const hudToggleBtn = getElement<HTMLButtonElement>('hud-toggle-btn');
const quitBtn = getElement<HTMLButtonElement>('quit-btn');
const helpBtn = getElement<HTMLButtonElement>('help-btn');
const boardToggleBtn = getElement<HTMLButtonElement>('board-toggle-btn');
const refreshBtn = getElement<HTMLButtonElement>('refresh-board-btn');
const boardCloseBtn = getElement<HTMLButtonElement>('board-close-btn');
const boardEdgeBtn = getElement<HTMLButtonElement>('board-edge-btn');
const boardPreview = getElement<HTMLUListElement>('board-preview');
const leaderboardDrawer = getElement<HTMLElement>('leaderboard-drawer');
const statusEl = getElement<HTMLDivElement>('status');
const boardBody = getElement<HTMLTableSectionElement>('leaderboard-body');
const liveTrackLine = getElement<HTMLDivElement>('live-track-line');
const liveTrackStatus = getElement<HTMLElement>('live-track-status');

const raceCanvas = getElement<HTMLCanvasElement>('race-canvas');
const hud = getElement<HTMLDivElement>('hud');
const speedEl = getElement<HTMLSpanElement>('hud-speed');
const lapEl = getElement<HTMLSpanElement>('hud-lap');
const positionEl = getElement<HTMLSpanElement>('hud-position');
const rankCardEl = getElement<HTMLDivElement>('hud-rank-card');
const progressEl = getElement<HTMLSpanElement>('hud-progress');
const nitroEl = getElement<HTMLSpanElement>('hud-nitro');
const weatherEl = getElement<HTMLSpanElement>('hud-weather');
const heatEl = getElement<HTMLSpanElement>('hud-heat');
const styleEl = getElement<HTMLSpanElement>('hud-style');
const objectiveEl = getElement<HTMLSpanElement>('hud-objective');
const itemEl = getElement<HTMLSpanElement>('hud-item');
const timeEl = getElement<HTMLSpanElement>('hud-time');

const resultOverlay = getElement<HTMLDivElement>('result-overlay');
const resultTitle = getElement<HTMLHeadingElement>('result-title');
const resultDetail = getElement<HTMLParagraphElement>('result-detail');
const submitStatus = getElement<HTMLParagraphElement>('submit-status');
const againBtn = getElement<HTMLButtonElement>('again-btn');
const lobbyBtn = getElement<HTMLButtonElement>('lobby-btn');
const helpOverlay = getElement<HTMLDivElement>('help-overlay');
const helpCloseBtn = getElement<HTMLButtonElement>('help-close-btn');

const touchControls = getElement<HTMLDivElement>('touch-controls');
const coachCard = getElement<HTMLDivElement>('coach-card');
const coachText = getElement<HTMLParagraphElement>('coach-text');
const coachCloseBtn = getElement<HTMLButtonElement>('coach-close');
const toast = getElement<HTMLDivElement>('toast');

const isMobile = window.matchMedia('(max-width: 980px), (pointer: coarse)').matches;
touchControls.style.display = 'none';
const HUD_COLLAPSE_KEY = 'turbo-drift-hud-collapsed';

if (isMobile) {
  // Prevent double-tap select/zoom gestures inside the game shell.
  let lastTouchEndAt = 0;
  document.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now();
      if (now - lastTouchEndAt < 320) {
        event.preventDefault();
      }
      lastTouchEndAt = now;
    },
    { passive: false },
  );

  document.addEventListener(
    'dblclick',
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );

  const blockGesture = (event: Event) => {
    event.preventDefault();
  };

  document.addEventListener('gesturestart', blockGesture as EventListener, { passive: false });
  document.addEventListener('gesturechange', blockGesture as EventListener, { passive: false });
  document.addEventListener('gestureend', blockGesture as EventListener, { passive: false });
}

let engine: RacingEngine | null = null;
let rafId: number | null = null;
let loadingRun = false;
let lastHudHeartbeatAt = performance.now();
let freezeAttempts = 0;
let activePlayerName = localStorage.getItem('turbo-drift-player') ?? '';
let activeRunId = '';
let toastTimer: number | null = null;
let coachDismissed = localStorage.getItem('turbo-drift-coach-hidden') === '1';
let coachShownOnce = localStorage.getItem('turbo-drift-coach-seen') === '1';
let lastHudPosition = Number.POSITIVE_INFINITY;
let hudOvertakePulseTimer: number | null = null;
let hudLossPulseTimer: number | null = null;
let lastRuntimeToastAt = 0;
let hudCollapsed = localStorage.getItem(HUD_COLLAPSE_KEY) === '1';

const keyState = {
  left: false,
  right: false,
  throttle: false,
  brake: false,
  drift: false,
  nitro: false,
};

const touchState = {
  left: false,
  right: false,
  throttle: false,
  brake: false,
  drift: false,
  nitro: false,
};

let pendingUseItem = false;
let pendingCameraToggle = false;
let lobbyTrackPreviewRaf: number | null = null;

type LiveTrackRacer = HudState['racers'][number];

nameInput.value = activePlayerName;
coachCard.style.display = 'none';

startBtn.addEventListener('click', () => {
  const name = validatePlayerName(nameInput.value);
  if (!name) {
    statusEl.textContent = '昵称长度需在 1 到 16 个字符之间。';
    return;
  }
  void startRun(name);
});

helpBtn.addEventListener('click', () => {
  showOverlay(helpOverlay);
});

cameraBtn.addEventListener('click', () => {
  pendingCameraToggle = true;
});

hudToggleBtn.addEventListener('click', () => {
  setHudCollapsed(!hudCollapsed);
});

quitBtn.addEventListener('click', () => {
  stopRun();
  hideOverlay(resultOverlay);
  statusEl.textContent = '已退出比赛。';
});

boardToggleBtn.addEventListener('click', () => {
  setLeaderboardDrawer(!leaderboardDrawer.classList.contains('open'));
});

boardCloseBtn.addEventListener('click', () => {
  setLeaderboardDrawer(false);
});

boardEdgeBtn.addEventListener('click', () => {
  setLeaderboardDrawer(true);
});

againBtn.addEventListener('click', () => {
  const name = validatePlayerName(nameInput.value) ?? activePlayerName;
  if (!name) {
    statusEl.textContent = '请先输入有效昵称。';
    return;
  }
  void startRun(name);
});

coachCloseBtn.addEventListener('click', () => {
  coachDismissed = true;
  localStorage.setItem('turbo-drift-coach-hidden', '1');
  coachCard.style.display = 'none';
});

helpCloseBtn.addEventListener('click', () => {
  hideOverlay(helpOverlay);
});

helpOverlay.addEventListener('click', (event) => {
  if (event.target === helpOverlay) {
    hideOverlay(helpOverlay);
  }
});

lobbyBtn.addEventListener('click', () => {
  stopRun();
  hideOverlay(resultOverlay);
  statusEl.textContent = '已返回大厅。';
});

refreshBtn.addEventListener('click', () => {
  void refreshLeaderboard();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && helpOverlay.style.display === 'flex') {
    hideOverlay(helpOverlay);
    return;
  }

  if (event.repeat) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === 'a' || key === 'arrowleft') keyState.left = true;
  if (key === 'd' || key === 'arrowright') keyState.right = true;
  if (key === 'w' || key === 'arrowup') keyState.throttle = true;
  if (key === 's' || key === 'arrowdown') keyState.brake = true;
  if (key === 'shift') keyState.drift = true;
  if (key === 'x' || key === 'control') keyState.nitro = true;
  if (key === 'c' || key === 'v') {
    pendingCameraToggle = true;
  }
  if (key === ' ') {
    pendingUseItem = true;
    event.preventDefault();
  }
});

window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'a' || key === 'arrowleft') keyState.left = false;
  if (key === 'd' || key === 'arrowright') keyState.right = false;
  if (key === 'w' || key === 'arrowup') keyState.throttle = false;
  if (key === 's' || key === 'arrowdown') keyState.brake = false;
  if (key === 'shift') keyState.drift = false;
  if (key === 'x' || key === 'control') keyState.nitro = false;
});

for (const btn of touchControls.querySelectorAll<HTMLButtonElement>('button[data-touch]')) {
  const touchKey = btn.dataset.touch ?? '';

  const press = (event: Event) => {
    event.preventDefault();
    if (touchKey === 'item') {
      pendingUseItem = true;
      return;
    }
    if (touchKey === 'camera') {
      pendingCameraToggle = true;
      return;
    }

    if (touchKey in touchState) {
      (touchState as Record<string, boolean>)[touchKey] = true;
    }
  };

  const release = (event: Event) => {
    event.preventDefault();
    if (touchKey in touchState) {
      (touchState as Record<string, boolean>)[touchKey] = false;
    }
  };

  btn.addEventListener('pointerdown', press, { passive: false });
  btn.addEventListener('pointerup', release, { passive: false });
  btn.addEventListener('pointercancel', release, { passive: false });
  btn.addEventListener('pointerleave', release, { passive: false });
}

window.addEventListener('blur', () => {
  for (const key of Object.keys(keyState) as Array<keyof typeof keyState>) {
    keyState[key] = false;
  }
  for (const key of Object.keys(touchState) as Array<keyof typeof touchState>) {
    touchState[key] = false;
  }
});

window.addEventListener('error', (event) => {
  statusEl.textContent = `前端异常: ${event.message}`;
});

window.addEventListener('unhandledrejection', () => {
  statusEl.textContent = '未处理 Promise 异常。';
});

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}

function setRaceMode(active: boolean): void {
  document.body.classList.toggle('race-mode', active);
  touchControls.style.display = active && isMobile ? 'grid' : 'none';
  setLeaderboardDrawer(false);
  if (active) {
    stopLobbyTrackPreview();
  } else {
    startLobbyTrackPreview();
  }
}

function setHudCollapsed(collapsed: boolean): void {
  hudCollapsed = collapsed;
  document.body.classList.toggle('hud-collapsed', collapsed);
  hudToggleBtn.textContent = collapsed ? 'HUD展开' : 'HUD收起';
  localStorage.setItem(HUD_COLLAPSE_KEY, collapsed ? '1' : '0');
}

function setLeaderboardDrawer(open: boolean): void {
  const inRace = document.body.classList.contains('race-mode');
  const shouldOpen = open && !inRace;
  leaderboardDrawer.classList.toggle('open', shouldOpen);
  boardEdgeBtn.style.display = inRace || shouldOpen ? 'none' : 'inline-flex';
  boardToggleBtn.textContent = shouldOpen ? '收起榜单' : '排行榜';
}

function configureRaceCanvasSize(): void {
  const rect = raceCanvas.getBoundingClientRect();
  const fallbackWidth = Math.max(320, window.innerWidth);
  const fallbackHeight = Math.max(480, window.innerHeight);
  const cssWidth = Math.max(320, Math.floor(rect.width || fallbackWidth));
  const cssHeight = Math.max(180, Math.floor(rect.height || fallbackHeight));

  if (isMobile) {
    const aspect = Math.min(2.2, Math.max(1.45, cssHeight / cssWidth));
    const renderWidth = Math.round(Math.min(560, Math.max(420, cssWidth * 1.22)));
    const renderHeight = Math.round(Math.min(1180, Math.max(720, renderWidth * aspect)));
    raceCanvas.width = renderWidth;
    raceCanvas.height = renderHeight;
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  raceCanvas.width = Math.max(960, Math.round(cssWidth * dpr));
  raceCanvas.height = Math.max(540, Math.round(cssHeight * dpr));
}

function renderBoardPreview(rows: Array<{ playerName: string; score: number; durationSec: number }>): void {
  if (rows.length === 0) {
    boardPreview.innerHTML = '<li class="empty">暂无记录，先跑一局吧</li>';
    return;
  }

  boardPreview.innerHTML = rows
    .slice(0, 4)
    .map(
      (entry, index) =>
        `<li><span>#${index + 1} ${escapeHtml(entry.playerName)}</span><strong>${entry.score}</strong><em>${entry.durationSec}s</em></li>`,
    )
    .join('');
}

async function startRun(playerName: string): Promise<void> {
  if (loadingRun) {
    return;
  }

  loadingRun = true;
  activePlayerName = playerName;
  localStorage.setItem('turbo-drift-player', playerName);

  try {
    stopRun();
    setRaceMode(true);
    configureRaceCanvasSize();

    engine = await createRacingEngine({
      canvas: raceCanvas,
      width: raceCanvas.width,
      height: raceCanvas.height,
      mobile: isMobile,
    });
    hideOverlay(resultOverlay);
    if (!coachDismissed && !coachShownOnce) {
      coachText.textContent = '倒计时结束后全程按油门，先稳住赛道中线。';
      coachCard.style.display = 'grid';
      coachShownOnce = true;
      localStorage.setItem('turbo-drift-coach-seen', '1');
    }

    activeRunId = crypto.randomUUID();
    engine.startRace(playerName, activeRunId, {
      laps: 3,
      aiCount: isMobile ? 6 : 8,
      difficultyTier: 'hard_pro',
    });

    statusEl.textContent = `赛车手 ${playerName} 已就位，比赛开始。`;
    lastHudHeartbeatAt = performance.now();
    freezeAttempts = 0;

    const frame = (now: number) => {
      if (!engine) {
        return;
      }

      const input = buildInputState();
      engine.setInput(input);
      pendingUseItem = false;
      pendingCameraToggle = false;

      engine.tick(now);
      flushEngineEvents(engine.getAndClearEvents());

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
  } catch (error) {
    setRaceMode(false);
    statusEl.textContent = error instanceof Error ? error.message : '启动比赛失败。';
  } finally {
    loadingRun = false;
  }
}

function buildInputState(): InputState {
  const left = keyState.left || touchState.left;
  const right = keyState.right || touchState.right;

  return {
    steer: (right ? 1 : 0) + (left ? -1 : 0),
    throttle: keyState.throttle || touchState.throttle,
    brake: keyState.brake || touchState.brake,
    drift: keyState.drift || touchState.drift,
    nitro: keyState.nitro || touchState.nitro,
    useItem: pendingUseItem,
    cameraToggle: pendingCameraToggle,
  };
}

function stopRun(): void {
  setRaceMode(false);
  coachCard.style.display = 'none';
  hud.classList.remove('overtake-pulse');
  rankCardEl.classList.remove('overtake-pulse');
  hud.classList.remove('loss-pulse');
  rankCardEl.classList.remove('loss-pulse');
  if (hudOvertakePulseTimer !== null) {
    window.clearTimeout(hudOvertakePulseTimer);
    hudOvertakePulseTimer = null;
  }
  if (hudLossPulseTimer !== null) {
    window.clearTimeout(hudLossPulseTimer);
    hudLossPulseTimer = null;
  }
  lastHudPosition = Number.POSITIVE_INFINITY;
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (engine) {
    engine.dispose();
    engine = null;
  }
}

function flushEngineEvents(events: EngineEvent[]): void {
  for (const event of events) {
    if (event.type === 'hud_update') {
      const prevPosition = lastHudPosition;
      lastHudHeartbeatAt = performance.now();
      freezeAttempts = 0;
      speedEl.textContent = `${event.payload.speed} km/h`;
      lapEl.textContent = `${event.payload.lap}/${event.payload.totalLaps}`;
      positionEl.textContent = `${event.payload.position}/${event.payload.totalRacers}`;
      progressEl.textContent = `${event.payload.progressPct}%`;
      nitroEl.textContent = `${event.payload.nitroPct}%`;
      weatherEl.textContent = event.payload.weather;
      heatEl.textContent = `${event.payload.heatPct}%`;
      styleEl.textContent = `${event.payload.styleScore} · x${Math.max(1, event.payload.combo)}`;
      objectiveEl.textContent = `${event.payload.objectiveText} ${event.payload.objectiveProgress}`;
      itemEl.textContent = toItemLabel(event.payload.currentItem);
      timeEl.textContent = formatMs(event.payload.raceTimeMs);
      lastHudPosition = event.payload.position;

      if (
        event.payload.countdownMs <= 0 &&
        Number.isFinite(prevPosition) &&
        event.payload.position < prevPosition
      ) {
        triggerHudOvertakePulse();
      } else if (
        event.payload.countdownMs <= 0 &&
        Number.isFinite(prevPosition) &&
        event.payload.position > prevPosition
      ) {
        triggerHudLossPulse();
      }

      if (event.payload.countdownMs > 0) {
        statusEl.textContent = '准备起跑：按住油门，GO 后冲出去。';
      } else if (event.payload.combo >= 2) {
        statusEl.textContent = `漂移连击 x${event.payload.combo}，保持连招。`;
      } else if (event.payload.lap >= event.payload.totalLaps) {
        statusEl.textContent = '最后一圈，保持速度冲线。';
      } else if (event.payload.weather !== '晴') {
        statusEl.textContent = `天气${event.payload.weather}：注意抓地与走线。`;
      } else if (event.payload.jammed) {
        statusEl.textContent = '宿敌干扰中：谨慎转向。';
      } else if (event.payload.heatPct >= 80) {
        statusEl.textContent = '氮气快过热，先松一下。';
      } else if (event.payload.position >= 3) {
        statusEl.textContent = '你当前靠后，优先用道具或氮气超车。';
      } else {
        statusEl.textContent = '保持节奏：弯道漂移，直道开氮气。';
      }

      if (!coachDismissed) {
        coachText.textContent = getCoachMessage(event.payload.nitroPct, event.payload.currentItem, event.payload.countdownMs);
      }
      renderLiveTrack(
        event.payload.racers,
        event.payload.countdownMs > 0
          ? '发车倒计时'
          : `第 ${event.payload.lap}/${event.payload.totalLaps} 圈 · 实时`,
      );
      continue;
    }

    if (event.type === 'message') {
      showToast(event.payload.text);
      continue;
    }

    if (event.type === 'item_changed') {
      itemEl.textContent = toItemLabel(event.payload.item);
      continue;
    }

    if (event.type === 'runtime_error') {
      statusEl.textContent = `运行异常: ${event.payload.message}`;
      const now = performance.now();
      if (now - lastRuntimeToastAt > 2600) {
        showToast('检测到异常，已尝试恢复。');
        lastRuntimeToastAt = now;
      }
      continue;
    }

    if (event.type === 'race_finished') {
      void onRaceFinished(event.payload.result, event.payload.leaderboard);
    }
  }
}

function renderLiveTrack(racers: LiveTrackRacer[], statusLabel: string): void {
  liveTrackStatus.textContent = statusLabel;
  liveTrackLine.replaceChildren();
  liveTrackLine.classList.toggle('is-empty', racers.length === 0);
  if (racers.length === 0) {
    return;
  }

  const sorted = [...racers].sort((a, b) => a.progressPct - b.progressPct);
  let prevProgress = -100;
  let overlapRank = 0;

  for (const racer of sorted) {
    overlapRank = Math.abs(racer.progressPct - prevProgress) < 3.5 ? overlapRank + 1 : 0;
    prevProgress = racer.progressPct;

    const dot = document.createElement('i');
    dot.className = `track-dot ${racer.isPlayer ? 'is-player' : 'is-ai'}${racer.finished ? ' is-finished' : ''}`;
    dot.style.left = `${clampValue(racer.progressPct, 1.5, 98.5)}%`;
    dot.style.setProperty('--track-dot-y', `${(overlapRank % 3) * 10 - 10}px`);
    dot.title = `${racer.position}. ${racer.name} · ${racer.lap}圈 · ${racer.progressPct}%`;
    liveTrackLine.appendChild(dot);
  }
}

function startLobbyTrackPreview(): void {
  if (lobbyTrackPreviewRaf !== null) {
    return;
  }

  const loop = (now: number) => {
    if (document.body.classList.contains('race-mode')) {
      stopLobbyTrackPreview();
      return;
    }

    const t = now * 0.001;
    const sampleCount = isMobile ? 5 : 8;
    const synthetic: LiveTrackRacer[] = [];

    for (let i = 0; i < sampleCount; i += 1) {
      const isPlayerRacer = i === 0;
      const speed = isPlayerRacer ? 0.112 : 0.096 + i * 0.005;
      const base = isPlayerRacer ? 16 : (i / sampleCount) * 78 + 9;
      const wave = Math.sin(t * (0.8 + i * 0.13) + i * 0.92) * 2.6;
      const progressPct = (base + t * speed * 100 + wave + 1000) % 100;
      synthetic.push({
        id: isPlayerRacer ? 'player' : `demo-ai-${i}`,
        name: isPlayerRacer ? '你' : `AI-${i}`,
        isPlayer: isPlayerRacer,
        position: i + 1,
        progressPct,
        lap: 1,
        finished: false,
      });
    }

    const ranked = [...synthetic].sort((a, b) => b.progressPct - a.progressPct);
    const withPosition = ranked.map((racer, index) => ({ ...racer, position: index + 1 }));
    renderLiveTrack(withPosition, '等待开跑 · 实时预演');
    lobbyTrackPreviewRaf = window.requestAnimationFrame(loop);
  };

  lobbyTrackPreviewRaf = window.requestAnimationFrame(loop);
}

function stopLobbyTrackPreview(): void {
  if (lobbyTrackPreviewRaf !== null) {
    window.cancelAnimationFrame(lobbyTrackPreviewRaf);
    lobbyTrackPreviewRaf = null;
  }
}

function triggerHudOvertakePulse(): void {
  hud.classList.remove('overtake-pulse');
  rankCardEl.classList.remove('overtake-pulse');
  hud.classList.remove('loss-pulse');
  rankCardEl.classList.remove('loss-pulse');
  // force reflow so repeated supers can retrigger animation
  void hud.offsetWidth;
  hud.classList.add('overtake-pulse');
  rankCardEl.classList.add('overtake-pulse');
  if (hudOvertakePulseTimer !== null) {
    window.clearTimeout(hudOvertakePulseTimer);
  }
  hudOvertakePulseTimer = window.setTimeout(() => {
    hud.classList.remove('overtake-pulse');
    rankCardEl.classList.remove('overtake-pulse');
    hudOvertakePulseTimer = null;
  }, 320);
}

function triggerHudLossPulse(): void {
  hud.classList.remove('loss-pulse');
  rankCardEl.classList.remove('loss-pulse');
  hud.classList.remove('overtake-pulse');
  rankCardEl.classList.remove('overtake-pulse');
  // force reflow so repeated drops can retrigger animation
  void hud.offsetWidth;
  hud.classList.add('loss-pulse');
  rankCardEl.classList.add('loss-pulse');
  if (hudLossPulseTimer !== null) {
    window.clearTimeout(hudLossPulseTimer);
  }
  hudLossPulseTimer = window.setTimeout(() => {
    hud.classList.remove('loss-pulse');
    rankCardEl.classList.remove('loss-pulse');
    hudLossPulseTimer = null;
  }, 340);
}

async function onRaceFinished(result: RaceResult, leaderboard: RunResult): Promise<void> {
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId);
    rafId = null;
  }

  resultTitle.textContent = '比赛结束';
  resultDetail.textContent = `名次 ${result.finishPosition}/${result.totalRacers} · 总用时 ${formatMs(result.totalTimeMs)} · 最快圈 ${formatMs(result.bestLapMs)} · 技巧 ${result.styleScore} · 连击 x${Math.max(1, result.bestCombo)} · 分数 ${result.score}`;
  showOverlay(resultOverlay);

  submitStatus.textContent = '正在提交本地榜单...';
  try {
    await submitScore(leaderboard);
    submitStatus.textContent = '成绩提交成功。';
  } catch (error) {
    submitStatus.textContent = error instanceof Error ? error.message : '成绩提交失败。';
  }

  await refreshLeaderboard();
}

async function refreshLeaderboard(): Promise<void> {
  statusEl.textContent = '正在读取排行榜...';

  try {
    const rows = await fetchTopScores(20);
    if (rows.length === 0) {
      boardBody.innerHTML = '<tr><td colspan="6">暂无数据</td></tr>';
      renderBoardPreview([]);
      statusEl.textContent = '暂无记录，完成一局后会出现在榜单。';
      return;
    }

    boardBody.innerHTML = rows
      .map((entry, index) => {
        const date = new Date(entry.createdAt);
        const dateLabel = Number.isNaN(date.getTime())
          ? '--'
          : date.toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });

        return `<tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(entry.playerName)}</td>
          <td>${entry.score}</td>
          <td>${entry.stage}</td>
          <td>${entry.durationSec}s</td>
          <td>${dateLabel}</td>
        </tr>`;
      })
      .join('');

    renderBoardPreview(rows);
    statusEl.textContent = `已更新 ${rows.length} 条记录。`;
  } catch (error) {
    boardBody.innerHTML = '<tr><td colspan="6">读取失败</td></tr>';
    boardPreview.innerHTML = '<li class="empty">读取失败，请稍后重试</li>';
    statusEl.textContent = error instanceof Error ? error.message : '读取排行榜失败。';
  }
}

function showToast(message: string): void {
  toast.textContent = message;
  toast.style.display = 'block';

  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    toast.style.display = 'none';
    toastTimer = null;
  }, 1500);
}

function showOverlay(element: HTMLElement): void {
  element.style.display = 'flex';
}

function hideOverlay(element: HTMLElement): void {
  element.style.display = 'none';
}

function toItemLabel(item: string | null): string {
  if (!item) return '无';
  if (item === 'rocket') return '导弹';
  if (item === 'banana') return '香蕉';
  if (item === 'shield') return '护盾';
  if (item === 'boost') return '加速';
  return item;
}

function getCoachMessage(nitroPct: number, item: string | null, countdownMs: number): string {
  if (countdownMs > 0) {
    return '倒计时中：先按住油门，GO 后立即转向贴线。';
  }
  if (item) {
    return `你拿到了${toItemLabel(item)}，现在按空格/道具键使用。`;
  }
  if (nitroPct >= 35) {
    return '氮气够了：直线按 X 开氮气，弯道别乱开。';
  }
  return '弯道按住 Shift 漂移蓄氮，出弯再加速。';
}

function formatMs(value: number): string {
  const ms = Math.max(0, Math.floor(value));
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.setInterval(() => {
  if (!engine || rafId === null) {
    return;
  }

  const stallThresholdMs = isMobile ? 3600 : 3000;
  const stalled = performance.now() - lastHudHeartbeatAt > stallThresholdMs;
  if (!stalled) {
    return;
  }

  freezeAttempts += 1;
  statusEl.textContent = '检测到卡顿，正在恢复...';
  showToast('卡顿恢复中');
  lastHudHeartbeatAt = performance.now();

  if (freezeAttempts >= 4) {
    const validName = validatePlayerName(nameInput.value) ?? activePlayerName;
    if (validName) {
      void startRun(validName);
    }
  }
}, 1000);

void refreshLeaderboard();
setLeaderboardDrawer(false);
setHudCollapsed(hudCollapsed);
startLobbyTrackPreview();
