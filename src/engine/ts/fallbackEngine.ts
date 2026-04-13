import type { EngineEvent, EngineInitOptions, HudState, InputState, RaceConfig, RacerItem, RaceResult, RacingEngine } from '../types';
import type { RunResult } from '../../types';

const FIXED_STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 120;
const MAX_STEPS = 5;
const TRACK_SEGMENTS = 260;
const SEGMENT_LENGTH = 140;
const TRACK_LENGTH = TRACK_SEGMENTS * SEGMENT_LENGTH;
const WORLD_PROGRESS_SCALE = 2.45;
const MAX_SPEED = 520;
const DESKTOP_CRUISE_FLOOR = 118;
const MOBILE_CRUISE_FLOOR = 82;
const DESKTOP_STUN_ROLL_FLOOR = 86;
const MOBILE_STUN_ROLL_FLOOR = 60;
const STALL_SPEED_THRESHOLD_DESKTOP = 64;
const STALL_SPEED_THRESHOLD_MOBILE = 44;
const STALL_RECOVERY_TRIGGER_MS = 900;
const STALL_RECOVERY_COOLDOWN_MS = 1900;
const DESKTOP_STALL_RECOVERY_SPEED = 136;
const MOBILE_STALL_RECOVERY_SPEED = 96;
const DESKTOP_OBSTACLE_RENDER_SCALE = 1.62;
const MOBILE_OBSTACLE_RENDER_SCALE = 1.12;
const STATIC_OBSTACLE_HIT_LANE_THRESHOLD = 0.31;
const STATIC_OBSTACLE_NEAR_MISS_MIN = 0.27;
const STATIC_OBSTACLE_NEAR_MISS_MAX = 0.46;
const DYNAMIC_OBSTACLE_HIT_LANE_BASE = 0.27;
const OBSTACLE_IMPACT_BASE_MS = 360;
const OBSTACLE_IMPACT_HEAVY_MS = 560;
const MIN_DESKTOP_DRAW_DISTANCE = 100;
const MIN_MOBILE_DRAW_DISTANCE = 96;
const MIN_ROAD_X = -1.28;
const MAX_ROAD_X = 1.28;
const DRAW_DISTANCE = 132;
const MOBILE_DRAW_DISTANCE = 118;
const DESKTOP_HUD_FLUSH_MS = 130;
const MOBILE_HUD_FLUSH_MS = 120;
const MOBILE_MAX_STEPS = 8;
const ITEM_INTERVAL_DISTANCE = 1450;
const ROADSIDE_POST_SPACING = 170;
const ROAD_TOP_HALF_RATIO = 0.104;
const ROAD_NEAR_HALF_RATIO = 0.436;
const LANE_VISUAL_SCALE = 0.68;
const EMP_COOLDOWN_MS = 5600;
const ENDGAME_PROGRESS = 0.8;
const RIVAL_SURGE_BASE_MS = 2800;
const AI_CATCHUP_START_DISTANCE = 120;
const AI_CATCHUP_SPAN_DISTANCE = 500;
const AI_FINISH_GRACE_MS = 30_000;

type DifficultyTier = 'normal' | 'hard_mid' | 'hard_pro';

interface DifficultyPreset {
  aiAggression: number;
  aiBlockChance: number;
  aiTargetSpeedFactor: number;
  aiItemGainRate: number;
  aiUseItemChanceFactor: number;
  playerRecoveryPenalty: number;
  obstaclePenaltyFactor: number;
  movingObstacleFactor: number;
  endgamePressure: number;
}

const DIFFICULTY_PRESETS: Record<DifficultyTier, DifficultyPreset> = {
  normal: {
    aiAggression: 0.88,
    aiBlockChance: 0.2,
    aiTargetSpeedFactor: 0.95,
    aiItemGainRate: 0.82,
    aiUseItemChanceFactor: 0.84,
    playerRecoveryPenalty: 0.9,
    obstaclePenaltyFactor: 0.9,
    movingObstacleFactor: 0.82,
    endgamePressure: 0.85,
  },
  hard_mid: {
    aiAggression: 1.04,
    aiBlockChance: 0.4,
    aiTargetSpeedFactor: 1.02,
    aiItemGainRate: 1.08,
    aiUseItemChanceFactor: 1.1,
    playerRecoveryPenalty: 1.08,
    obstaclePenaltyFactor: 1.12,
    movingObstacleFactor: 1.05,
    endgamePressure: 1.08,
  },
  hard_pro: {
    aiAggression: 1.2,
    aiBlockChance: 0.54,
    aiTargetSpeedFactor: 1.1,
    aiItemGainRate: 1.24,
    aiUseItemChanceFactor: 1.24,
    playerRecoveryPenalty: 1.2,
    obstaclePenaltyFactor: 1.24,
    movingObstacleFactor: 1.14,
    endgamePressure: 1.3,
  },
};

interface Segment {
  curve: number;
  hill: number;
}

interface CarState {
  id: string;
  name: string;
  isPlayer: boolean;
  aiProfile: 'aggressive' | 'balanced' | 'defensive';
  lane: number;
  speed: number;
  distance: number;
  lap: number;
  finished: boolean;
  finishTimeMs: number;
  aiSkill: number;
  aiTargetLane: number;
  aiRetargetMs: number;
  aiUseItemCooldownMs: number;
  item: RacerItem | null;
  stunMs: number;
  shieldMs: number;
  boostMs: number;
  aiBlockUntilMs: number;
  aiPressureCooldownMs: number;
  aiRiskLevel: number;
  aiStrategyTimerMs: number;
}

interface Trap {
  distance: number;
  lane: number;
  ownerId: string;
  ttlMs: number;
}

interface TrackZone {
  id: string;
  type: 'boost_pad' | 'mud' | 'jump' | 'shortcut' | 'obstacle';
  start: number;
  end: number;
  laneMin: number;
  laneMax: number;
  obstacleLanes?: number[];
  obstacleOffsets?: number[];
}

interface NarrowChokeZone {
  id: string;
  start: number;
  end: number;
  laneMin: number;
  laneMax: number;
}

interface DynamicObstacle {
  id: string;
  start: number;
  end: number;
  baseLane: number;
  amplitude: number;
  periodMs: number;
  phaseMs: number;
  size: number;
}

interface AiItemPlan {
  use: boolean;
  trapLane?: number;
  cooldownScale?: number;
}

interface OvertakeCameraState {
  intensity: number;
  side: -1 | 1;
}

type SceneType = 'tunnel' | 'cliff' | 'bridge' | 'neon_city';

interface SceneZone {
  id: string;
  type: SceneType;
  start: number;
  end: number;
  intensity: number;
  side?: -1 | 1;
}

type WeatherMode = 'clear' | 'rain' | 'fog';

type ObjectiveKind = 'drift' | 'overtake' | 'jump' | 'boost' | 'shortcut';

interface LapObjective {
  kind: ObjectiveKind;
  target: number;
  progress: number;
  done: boolean;
  rewardStyle: number;
  rewardNitro: number;
  label: string;
}

interface FallbackEngineOptions {
  scoreRace?: (finishPosition: number, totalRacers: number, totalTimeMs: number, nitroPct: number) => number;
  simulatePlayerStep?: (
    speed: number,
    lane: number,
    steer: number,
    curve: number,
    throttle: boolean,
    brake: boolean,
    stunned: boolean,
    boostActive: boolean,
    drifting: boolean,
    driftDirection: number,
    dtMs: number,
  ) => { speed: number; lane: number };
  simulateAiStep?: (
    speed: number,
    lane: number,
    targetLane: number,
    targetSpeed: number,
    aiRisk: number,
    laneProfileMul: number,
    dtMs: number,
    blocked: boolean,
    stunned: boolean,
    chokeMin: number,
    chokeMax: number,
    hasChoke: boolean,
    cliffGust: number,
  ) => { speed: number; lane: number };
  simulateAiStepBatch?: (inputs: Float32Array) => Float32Array;
  simulateAiHazardBatch?: (
    aiInputs: Float32Array,
    staticInputs: Float32Array,
    dynamicInputs: Float32Array,
    trackLength: number,
  ) => Float32Array;
  detectPlayerStaticHazardsBatch?: (
    playerDistance: number,
    playerLane: number,
    playerSpeed: number,
    playerAirMs: number,
    staticInputs: Float32Array,
    trackLength: number,
  ) => Float32Array;
  detectPlayerDynamicHazardsBatch?: (
    playerDistance: number,
    playerLane: number,
    playerSpeed: number,
    playerAirMs: number,
    dynamicInputs: Float32Array,
    trackLength: number,
  ) => Float32Array;
  detectPlayerInteractionsBatch?: (
    playerDistance: number,
    playerLane: number,
    aiInputs: Float32Array,
    trapInputs: Float32Array,
    trackLength: number,
  ) => Float32Array;
  computePlayerRelationsBatch?: (
    playerDistance: number,
    playerLane: number,
    playerSpeed: number,
    currentSteer: number,
    previousOvertakeSide: number,
    aiInputs: Float32Array,
    trackLength: number,
  ) => Float32Array;
  selectNearestAheadTargetIndex?: (
    userDistance: number,
    candidateDistances: Float32Array,
    maxDistance: number,
    trackLength: number,
  ) => number;
  onReadyMessage?: string;
}

export function createFallbackEngine(options: EngineInitOptions, tuning: FallbackEngineOptions = {}): RacingEngine {
  const ctx = options.canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('无法初始化 Canvas 2D 上下文');
  }
  const drawDistance = options.mobile ? MOBILE_DRAW_DISTANCE : DRAW_DISTANCE;
  const hudFlushIntervalMs = options.mobile ? MOBILE_HUD_FLUSH_MS : DESKTOP_HUD_FLUSH_MS;
  const maxStepsPerTick = options.mobile ? MOBILE_MAX_STEPS : MAX_STEPS;
  const recoveryRuntimeCooldown = options.mobile ? 3600 : 2600;
  const minDrawDistance = options.mobile ? MIN_MOBILE_DRAW_DISTANCE : MIN_DESKTOP_DRAW_DISTANCE;

  const segments = buildTrack();
  const trackZones = buildTrackZones();
  const sceneZones = buildTrackScenes();
  const narrowChokeZones = buildNarrowChokeZones();
  const dynamicObstacles = buildDynamicObstacles();
  let resolvedTrackZones = trackZones;
  const events: EngineEvent[] = [];

  let cfg: RaceConfig = { laps: 3, aiCount: 3 };
  let playerName = 'Player';
  let runId = `${Date.now()}`;

  let lastNow = 0;
  let accumulator = 0;
  let disposed = false;
  let countdownMs = 3200;
  let raceTimeMs = 0;
  let hudFlushMs = 0;
  let nextItemDistance = ITEM_INTERVAL_DISTANCE;

  let drifting = false;
  let driftCharge = 0;
  let driftDirection = 0;
  let driftCombo = 0;
  let bestDriftCombo = 0;
  let nitro = 0;
  let nitroHeat = 0;
  let nitroOverheatMs = 0;
  let empJammedMs = 0;
  let rivalEmpCooldownMs = 0;
  let styleScore = 0;
  let objectiveCompleted = 0;
  let lapObjective: LapObjective = createObjective(1);
  let lastPlayerPosition = 1;
  let overtakeChainMs = 0;
  let overtakeChainCount = 0;
  let draftingMs = 0;
  let draftBurstCooldownMs = 0;
  let draftActive = false;
  let playerAirMs = 0;
  let playerAirCooldownMs = 0;
  let playerLastZoneKey = '';
  let playerLastSceneKey = '';
  let zoneMessageCooldownMs = 0;
  let sceneMessageCooldownMs = 0;
  let zonePatternIndex = 0;
  let currentWeather: WeatherMode = 'clear';
  let difficultyTier: DifficultyTier = 'hard_mid';
  let difficultyPreset: DifficultyPreset = DIFFICULTY_PRESETS.hard_mid;
  let rivalId = '';
  let shortcutVisitedKeys = new Set<string>();
  let obstacleHitKeys = new Set<string>();
  let obstacleNearMissKeys = new Set<string>();
  let aiObstacleHitKeys = new Set<string>();
  let aiDynamicObstacleHitKeys = new Set<string>();
  let dynamicObstacleHitKeys = new Set<string>();
  let cameraMode: 'near' | 'far' = 'near';
  let cameraToggleLatch = false;
  let overtakeFxIntensity = 0;
  let overtakeFxSide: -1 | 1 = 1;
  let overtakeBurstMs = 0;
  let overtakeLossMs = 0;
  let overtakeLossSide: -1 | 1 = 1;
  let runtimeRecoveryCooldownMs = 0;
  let dynamicDrawDistance = drawDistance;
  let stableRuntimeMs = 0;
  let rivalSurgeMs = 0;
  let rivalSurgeCooldownMs = 0;
  let rivalSurgeSide: -1 | 1 = 1;
  let offroadMs = 0;
  let offroadWarnCooldownMs = 0;
  let playerCarContactCooldownMs = 0;
  let playerTrapContactCooldownMs = 0;
  let playerStallMs = 0;
  let playerStallRecoveryCooldownMs = 0;
  let stateRepairCooldownMs = 0;
  let playerNoProgressMs = 0;
  let obstacleImpactMs = 0;
  let obstacleImpactSide: -1 | 1 = 1;
  let obstacleImpactStrength = 0;

  let currentInput: InputState = {
    steer: 0,
    throttle: false,
    brake: false,
    drift: false,
    nitro: false,
    useItem: false,
    cameraToggle: false,
  };

  let previousUseItem = false;

  let cars: CarState[] = [];
  let traps: Trap[] = [];
  let finished = false;

  let lapStartMs = 0;
  let bestLapMs = Number.POSITIVE_INFINITY;
  let firstAiFinishAtMs = -1;

  function startRace(name: string, id: string, config: RaceConfig): void {
    playerName = name;
    runId = id;
    difficultyTier =
      config.difficultyTier === 'hard_pro' || config.difficultyTier === 'normal' || config.difficultyTier === 'hard_mid'
        ? config.difficultyTier
        : 'hard_mid';
    difficultyPreset = DIFFICULTY_PRESETS[difficultyTier];
    cfg = {
      laps: Math.max(1, Math.min(6, Math.floor(config.laps))),
      aiCount: Math.max(2, Math.min(8, Math.floor(config.aiCount))),
    };

    accumulator = 0;
    lastNow = 0;
    countdownMs = 3200;
    raceTimeMs = 0;
    hudFlushMs = 0;
    nextItemDistance = ITEM_INTERVAL_DISTANCE;
    drifting = false;
    driftCharge = 0;
    driftDirection = 0;
    driftCombo = 0;
    bestDriftCombo = 0;
    nitro = 0;
    nitroHeat = 0;
    nitroOverheatMs = 0;
    empJammedMs = 0;
    rivalEmpCooldownMs = 0;
    styleScore = 0;
    objectiveCompleted = 0;
    lapObjective = createObjective(1);
    lastPlayerPosition = 1;
    overtakeChainMs = 0;
    overtakeChainCount = 0;
    draftingMs = 0;
    draftBurstCooldownMs = 0;
    draftActive = false;
    playerAirMs = 0;
    playerAirCooldownMs = 0;
    playerLastZoneKey = '';
    playerLastSceneKey = '';
    zoneMessageCooldownMs = 0;
    sceneMessageCooldownMs = 0;
    zonePatternIndex = 0;
    currentWeather = chooseOpeningWeather();
    shortcutVisitedKeys = new Set<string>();
    obstacleHitKeys = new Set<string>();
    obstacleNearMissKeys = new Set<string>();
    aiObstacleHitKeys = new Set<string>();
    aiDynamicObstacleHitKeys = new Set<string>();
    dynamicObstacleHitKeys = new Set<string>();
    cameraMode = 'near';
    cameraToggleLatch = false;
    overtakeFxIntensity = 0;
    overtakeFxSide = 1;
    overtakeBurstMs = 0;
    overtakeLossMs = 0;
    overtakeLossSide = 1;
    runtimeRecoveryCooldownMs = 0;
    rivalSurgeMs = 0;
    rivalSurgeCooldownMs = 0;
    rivalSurgeSide = 1;
    offroadMs = 0;
    offroadWarnCooldownMs = 0;
    playerCarContactCooldownMs = 0;
    playerTrapContactCooldownMs = 0;
    playerStallMs = 0;
    playerStallRecoveryCooldownMs = 0;
    stateRepairCooldownMs = 0;
    playerNoProgressMs = 0;
    obstacleImpactMs = 0;
    obstacleImpactSide = 1;
    obstacleImpactStrength = 0;
    previousUseItem = false;
    traps = [];
    finished = false;
    lapStartMs = 0;
    bestLapMs = Number.POSITIVE_INFINITY;
    firstAiFinishAtMs = -1;

    cars = [];
    cars.push(createCar('player', playerName, true, 0));
    for (let i = 0; i < cfg.aiCount; i += 1) {
      const lane = -0.75 + i * (1.5 / Math.max(1, cfg.aiCount - 1));
      cars.push(createCar(`ai-${i + 1}`, `AI-${i + 1}`, false, lane));
    }
    rivalId = pickRival(cars);

    if (tuning.onReadyMessage) {
      pushMessage(tuning.onReadyMessage);
    }
    if (rivalId) {
      const rival = cars.find((car) => car.id === rivalId);
      if (rival) {
        pushMessage(`宿敌登场：${rival.name}`);
      }
    }
    pushMessage(`本圈任务：${lapObjective.label}`);
    const zoneLabel = refreshZonePattern('start');
    pushMessage(`机关布局：${zoneLabel}`);
    pushMessage(`难度：${difficultyTier === 'hard_pro' ? '硬核压制' : difficultyTier === 'normal' ? '标准' : '中高压制'}`);
    pushMessage(`天气：${weatherLabel(currentWeather)}`);
    pushMessage('倒计时开始');
    flushHud(true);
  }

  function createCar(id: string, name: string, isPlayer: boolean, lane: number): CarState {
    const aiIndex = isPlayer ? 0 : Math.max(1, Number.parseInt(id.split('-')[1] ?? '1', 10) || 1);
    const aiProfile: CarState['aiProfile'] = isPlayer
      ? 'balanced'
      : aiIndex % 3 === 1
        ? 'aggressive'
        : aiIndex % 3 === 2
          ? 'balanced'
          : 'defensive';
    const contenderBonus = aiIndex >= Math.max(2, Math.ceil(cfg.aiCount * 0.72)) ? 0.08 : 0;

    return {
      id,
      name,
      isPlayer,
      aiProfile,
      lane,
      speed: isPlayer ? 0 : 132 + aiIndex * 10 + (aiProfile === 'aggressive' ? 10 : 0),
      // Unified start line: all racers spawn at the same longitudinal position.
      distance: 0,
      lap: 1,
      finished: false,
      finishTimeMs: 0,
      aiSkill: isPlayer ? 1 : (0.96 + aiIndex * 0.054 + contenderBonus) * (0.9 + difficultyPreset.aiAggression * 0.1),
      aiTargetLane: lane,
      aiRetargetMs: isPlayer ? 0 : 560 + aiIndex * 120,
      aiUseItemCooldownMs: 1000,
      item: null,
      stunMs: 0,
      shieldMs: 0,
      boostMs: 0,
      aiBlockUntilMs: 0,
      aiPressureCooldownMs: 900 + aiIndex * 120,
      aiRiskLevel: clamp(0.44 + aiIndex * 0.08 + (aiProfile === 'aggressive' ? 0.04 : 0), 0.36, 0.94),
      aiStrategyTimerMs: 420 + aiIndex * 80,
    };
  }

  function setInput(input: InputState): void {
    const braking = Boolean(input.brake);
    currentInput = {
      steer: Math.max(-1, Math.min(1, input.steer)),
      throttle: Boolean(input.throttle),
      brake: braking,
      drift: input.drift,
      nitro: input.nitro,
      useItem: input.useItem,
      cameraToggle: input.cameraToggle,
    };
  }

  function sanitizeCarMotionState(car: CarState, isPlayer: boolean): void {
    const playerFloor = options.mobile ? MOBILE_CRUISE_FLOOR : DESKTOP_CRUISE_FLOOR;
    let repaired = false;
    if (!Number.isFinite(car.speed)) {
      car.speed = isPlayer ? playerFloor : 120;
      repaired = true;
    }
    car.speed = clamp(car.speed, 0, MAX_SPEED * 1.22);

    if (!Number.isFinite(car.lane)) {
      car.lane = 0;
      repaired = true;
    }
    car.lane = clamp(car.lane, -1.6, 1.6);

    if (!Number.isFinite(car.distance) || car.distance < 0) {
      car.distance = 0;
      repaired = true;
    }

    if (!Number.isFinite(car.stunMs) || car.stunMs < 0) {
      car.stunMs = 0;
      repaired = true;
    }
    if (!Number.isFinite(car.shieldMs) || car.shieldMs < 0) {
      car.shieldMs = 0;
      repaired = true;
    }
    if (!Number.isFinite(car.boostMs) || car.boostMs < 0) {
      car.boostMs = 0;
      repaired = true;
    }

    if (repaired && stateRepairCooldownMs <= 0) {
      pushRuntimeError('检测到异常状态，已自动纠正');
      stateRepairCooldownMs = 2200;
    }
  }

  function tick(nowMs: number): void {
    if (disposed || cars.length === 0) {
      return;
    }

    try {
      if (lastNow === 0) {
        lastNow = nowMs;
      }

      let frameMs = nowMs - lastNow;
      lastNow = nowMs;
      if (!Number.isFinite(frameMs) || frameMs < 0) {
        frameMs = FIXED_STEP_MS;
      }

      frameMs = Math.min(frameMs, MAX_FRAME_MS);
      accumulator += frameMs;
      runtimeRecoveryCooldownMs = Math.max(0, runtimeRecoveryCooldownMs - frameMs);

      let steps = 0;
      while (accumulator >= FIXED_STEP_MS && steps < maxStepsPerTick) {
        simulate(FIXED_STEP_MS);
        accumulator -= FIXED_STEP_MS;
        steps += 1;
      }

      if (steps === maxStepsPerTick && accumulator >= FIXED_STEP_MS) {
        // Drop excessive backlog instead of burst catch-up simulation to avoid visual jumps.
        accumulator = Math.min(accumulator, FIXED_STEP_MS * 0.7);
        stableRuntimeMs = 0;
        dynamicDrawDistance = Math.max(minDrawDistance, dynamicDrawDistance - (options.mobile ? 3 : 4));
        if (runtimeRecoveryCooldownMs <= 0) {
          pushRuntimeError('帧积压过大，已自动恢复时钟');
          runtimeRecoveryCooldownMs = recoveryRuntimeCooldown;
        }
      } else {
        if (accumulator < FIXED_STEP_MS * 0.7 && steps > 0) {
          stableRuntimeMs += frameMs;
          if (stableRuntimeMs >= (options.mobile ? 2200 : 1600) && dynamicDrawDistance < drawDistance) {
            dynamicDrawDistance = Math.min(drawDistance, dynamicDrawDistance + 2);
            stableRuntimeMs = 0;
          }
        } else {
          stableRuntimeMs = Math.max(0, stableRuntimeMs - frameMs * 0.45);
        }
      }

      render(ctx as CanvasRenderingContext2D, options.width, options.height);
      hudFlushMs += frameMs;
      if (hudFlushMs >= hudFlushIntervalMs) {
        flushHud(false);
        hudFlushMs = 0;
      }
    } catch (error) {
      pushRuntimeError(error instanceof Error ? error.message : String(error));
      stableRuntimeMs = 0;
      dynamicDrawDistance = Math.max(minDrawDistance, dynamicDrawDistance - (options.mobile ? 2 : 3));
      try {
        flushHud(true);
      } catch {
        // Keep runtime resilient even if HUD flush fails.
      }
    }
  }

  function simulate(dtMs: number): void {
    if (finished) {
      return;
    }

    const player = cars[0];
    sanitizeCarMotionState(player, true);
    const stepStartDistance = player.distance;

    if (currentInput.cameraToggle && !cameraToggleLatch) {
      cameraToggleLatch = true;
      cameraMode = cameraMode === 'near' ? 'far' : 'near';
      pushMessage(cameraMode === 'near' ? '镜头：近景冲刺' : '镜头：远景全览');
    } else if (!currentInput.cameraToggle) {
      cameraToggleLatch = false;
    }

    if (countdownMs > 0) {
      const previousCountdown = countdownMs;
      countdownMs = Math.max(0, countdownMs - dtMs);
      if (countdownMs === 0) {
        if (currentInput.throttle && previousCountdown <= 220) {
          player.boostMs = Math.max(player.boostMs, 740);
          nitro = Math.min(100, nitro + 12);
          styleScore += 180;
          driftCombo = Math.max(1, driftCombo + 1);
          bestDriftCombo = Math.max(bestDriftCombo, driftCombo);
          updateObjective('boost', 1);
          pushMessage('完美起步');
        }
        pushMessage('Go!');
      }
      // Freeze AI during countdown so nobody moves before "Go!".
      for (let i = 1; i < cars.length; i += 1) {
        const ai = cars[i];
        ai.speed = 0;
        ai.boostMs = 0;
        ai.stunMs = Math.max(0, ai.stunMs - dtMs);
      }
      return;
    }

    raceTimeMs += dtMs;

    player.stunMs = Math.max(0, player.stunMs - dtMs);
    player.shieldMs = Math.max(0, player.shieldMs - dtMs);
    player.boostMs = Math.max(0, player.boostMs - dtMs);
    playerAirMs = Math.max(0, playerAirMs - dtMs);
    playerAirCooldownMs = Math.max(0, playerAirCooldownMs - dtMs);
    zoneMessageCooldownMs = Math.max(0, zoneMessageCooldownMs - dtMs);
    sceneMessageCooldownMs = Math.max(0, sceneMessageCooldownMs - dtMs);
    nitroOverheatMs = Math.max(0, nitroOverheatMs - dtMs);
    empJammedMs = Math.max(0, empJammedMs - dtMs);
    rivalEmpCooldownMs = Math.max(0, rivalEmpCooldownMs - dtMs);
    overtakeBurstMs = Math.max(0, overtakeBurstMs - dtMs);
    overtakeLossMs = Math.max(0, overtakeLossMs - dtMs);
    rivalSurgeMs = Math.max(0, rivalSurgeMs - dtMs);
    rivalSurgeCooldownMs = Math.max(0, rivalSurgeCooldownMs - dtMs);
    offroadWarnCooldownMs = Math.max(0, offroadWarnCooldownMs - dtMs);
    playerCarContactCooldownMs = Math.max(0, playerCarContactCooldownMs - dtMs);
    playerTrapContactCooldownMs = Math.max(0, playerTrapContactCooldownMs - dtMs);
    playerStallRecoveryCooldownMs = Math.max(0, playerStallRecoveryCooldownMs - dtMs);
    stateRepairCooldownMs = Math.max(0, stateRepairCooldownMs - dtMs);
    obstacleImpactMs = Math.max(0, obstacleImpactMs - dtMs);
    obstacleImpactStrength = Math.max(0, obstacleImpactStrength - dtMs * 0.0018);

    const speedRatio = clamp(player.speed / MAX_SPEED, 0, 1.25);
    const curveAtPlayer = getSegmentAtDistance(player.distance).curve;
    const activeScenes = getScenesAtDistance(player.distance);
    const activeChokes = getNarrowChokesAtDistance(player.distance);
    const chokeBounds = effectiveChokeBounds(activeChokes);
    const bridgeScene = getSceneByType(activeScenes, 'bridge');
    const cliffScene = getSceneByType(activeScenes, 'cliff');
    const weatherGrip = currentWeather === 'rain' ? 0.78 : currentWeather === 'fog' ? 0.9 : 1;
    const bridgeGripPenalty = bridgeScene && currentWeather !== 'clear' ? (currentWeather === 'rain' ? 0.965 : 0.978) : 1;
    const chokeGripPenalty = chokeBounds ? 0.965 : 1;
    const jamRatio = empJammedMs > 0 ? 0.68 : 1;

    if (currentInput.drift && Math.abs(currentInput.steer) > 0.22 && speedRatio > 0.35) {
      drifting = true;
      driftDirection = Math.sign(currentInput.steer) || driftDirection;
      driftCharge = Math.min(100, driftCharge + dtMs * (0.024 + speedRatio * 0.022) * weatherGrip * jamRatio);
    } else if (drifting) {
      drifting = false;
      const driftEval = evaluateDrift(driftCharge);
      if (driftEval) {
        driftCombo += driftEval.comboGain;
        bestDriftCombo = Math.max(bestDriftCombo, driftCombo);
        const comboMul = 1 + Math.min(7, driftCombo) * 0.16;
        const styleGain = Math.round(driftEval.styleBase * comboMul);
        const nitroGain = driftEval.nitroGain + Math.min(18, driftCombo * 1.4);
        styleScore += styleGain;
        nitro = Math.min(100, nitro + nitroGain);
        updateObjective('drift', 1);
        player.boostMs = Math.max(player.boostMs, driftEval.boostMs);
        pushMessage(`${driftEval.grade} 漂移 x${driftCombo} +${styleGain}`);
      } else {
        if (driftCharge > 10) {
          breakCombo('漂移不够干净');
        }
        nitro = Math.min(100, nitro + driftCharge * 0.2);
      }
      driftCharge = 0;
      driftDirection = 0;
    }

    if (currentInput.nitro && nitro > 0 && nitroOverheatMs <= 0) {
      const burn = Math.min(nitro, dtMs * 0.042);
      nitro -= burn;
      player.boostMs = Math.max(player.boostMs, 240);
      nitroHeat = Math.min(100, nitroHeat + dtMs * 0.07 * (currentWeather === 'rain' ? 1.08 : 1));
    }
    nitroHeat = Math.max(0, nitroHeat - dtMs * 0.028);
    if (nitroHeat >= 100) {
      nitroOverheatMs = 1650;
      nitroHeat = 64;
      player.boostMs = 0;
      breakCombo('氮气过热');
      pushMessage('氮气过热');
    }
    if (nitroOverheatMs > 0) {
      player.speed *= 0.992;
    }

    draftBurstCooldownMs = Math.max(0, draftBurstCooldownMs - dtMs);
    overtakeChainMs = Math.max(0, overtakeChainMs - dtMs);

    const step = tuning.simulatePlayerStep
      ? tuning.simulatePlayerStep(
          player.speed,
          player.lane,
          currentInput.steer * weatherGrip * jamRatio * bridgeGripPenalty * chokeGripPenalty,
          curveAtPlayer,
          currentInput.throttle,
          currentInput.brake,
          player.stunMs > 0,
          player.boostMs > 0,
          drifting,
          driftDirection,
          dtMs,
        )
      : simulatePlayerStepFallback(
          player.speed,
          player.lane,
          currentInput.steer * weatherGrip * jamRatio * bridgeGripPenalty * chokeGripPenalty,
          curveAtPlayer,
          currentInput.throttle,
          currentInput.brake,
          player.stunMs > 0,
          player.boostMs > 0,
          drifting,
          driftDirection,
          dtMs,
        );

    player.speed = clamp(step.speed, 0, MAX_SPEED * 1.2);
    player.lane = clamp(step.lane, -1.6, 1.6);
    if (currentWeather === 'rain') {
      player.speed = clamp(player.speed * 0.996, 0, MAX_SPEED * 1.2);
      const steerSign = Math.sign(currentInput.steer);
      if (steerSign !== 0) {
        player.lane += steerSign * curveAtPlayer * 0.0024;
      }
    } else if (currentWeather === 'fog') {
      player.speed = clamp(player.speed * 0.998, 0, MAX_SPEED * 1.2);
    }
    if (empJammedMs > 0) {
      player.lane += Math.sin(raceTimeMs * 0.035) * 0.0016 * dtMs;
    }
    if (bridgeScene && currentWeather !== 'clear') {
      player.speed = clamp(player.speed * (currentWeather === 'rain' ? 0.9984 : 0.9992), 0, MAX_SPEED * 1.2);
    }
    if (cliffScene) {
      const gust = Math.sin(raceTimeMs * 0.0049 + player.distance * 0.0016) * cliffScene.intensity;
      const gustDir = cliffScene.side ?? 1;
      player.lane += gust * gustDir * 0.00075 * dtMs;
    }

    const stabilityAssistActive = Math.abs(currentInput.steer) < 0.08 && !drifting && player.stunMs <= 0;
    const stabilityAimLane = clamp(preferredLaneForDistance(player.distance + 120) * 0.36, -0.48, 0.48);
    if (stabilityAssistActive) {
      const speedNorm = clamp(player.speed / MAX_SPEED, 0, 1);
      const blend = clamp(0.045 + speedNorm * 0.11 + dtMs * 0.0002, 0.045, 0.22);
      player.lane = lerp(player.lane, stabilityAimLane, blend);
    }

    const roadOverflow = Math.max(0, Math.abs(player.lane) - MAX_ROAD_X);
    if (roadOverflow > 0) {
      offroadMs = Math.min(2200, offroadMs + dtMs * (0.72 + roadOverflow * 1.4));
      const shoulderAimLane = clamp(stabilityAimLane, -0.28, 0.28);
      const shoulderRecoveryBlend = clamp(0.12 + roadOverflow * 0.06 + dtMs * 0.00025, 0.12, 0.36);
      player.lane = lerp(player.lane, shoulderAimLane, shoulderRecoveryBlend);
      const offroadDrag = clamp(0.992 - roadOverflow * 0.018, 0.94, 0.992);
      player.speed *= offroadDrag;
      player.boostMs = Math.max(0, player.boostMs - dtMs * (0.28 + roadOverflow * 0.42));
      nitro = Math.max(0, nitro - dtMs * (0.004 + roadOverflow * 0.006));
      if (offroadMs > 520 && offroadWarnCooldownMs <= 0) {
        pushMessage('压上路肩，速度流失');
        offroadWarnCooldownMs = 980;
      }
      if (offroadMs > 1460 && player.stunMs < 90) {
        player.stunMs = 90;
      }
    } else {
      offroadMs = Math.max(0, offroadMs - dtMs * 2.6);
    }

    if (chokeBounds) {
      if (player.lane < chokeBounds.laneMin) {
        player.lane = chokeBounds.laneMin;
        player.speed *= 0.985 * (1 - (difficultyPreset.playerRecoveryPenalty - 1) * 0.06);
      } else if (player.lane > chokeBounds.laneMax) {
        player.lane = chokeBounds.laneMax;
        player.speed *= 0.985 * (1 - (difficultyPreset.playerRecoveryPenalty - 1) * 0.06);
      } else {
        player.speed *= 0.9992;
      }
    }

    // Keep manual throttle feel: rolling floor only while throttle is pressed.
    if (!currentInput.brake && currentInput.throttle) {
      const cruiseFloor = options.mobile ? MOBILE_CRUISE_FLOOR : DESKTOP_CRUISE_FLOOR;
      const stunFloor = options.mobile ? MOBILE_STUN_ROLL_FLOOR : DESKTOP_STUN_ROLL_FLOOR;
      const rollingFloor = player.stunMs > 0 ? stunFloor : cruiseFloor;
      player.speed = Math.max(player.speed, rollingFloor);
    }

    const stallThreshold = options.mobile ? STALL_SPEED_THRESHOLD_MOBILE : STALL_SPEED_THRESHOLD_DESKTOP;
    if (!currentInput.brake && currentInput.throttle && player.speed < stallThreshold) {
      playerStallMs = Math.min(STALL_RECOVERY_TRIGGER_MS * 2.2, playerStallMs + dtMs);
    } else {
      playerStallMs = Math.max(0, playerStallMs - dtMs * 1.8);
    }

    if (playerStallMs >= STALL_RECOVERY_TRIGGER_MS && playerStallRecoveryCooldownMs <= 0) {
      const recoverySpeed = options.mobile ? MOBILE_STALL_RECOVERY_SPEED : DESKTOP_STALL_RECOVERY_SPEED;
      player.speed = Math.max(player.speed, recoverySpeed * 0.9);
      player.stunMs = Math.min(player.stunMs, 160);
      offroadMs = Math.max(0, offroadMs - 520);
      player.lane = lerp(player.lane, clamp(stabilityAimLane, -0.42, 0.42), 0.24);
      playerStallMs = 0;
      playerStallRecoveryCooldownMs = STALL_RECOVERY_COOLDOWN_MS;
    }

    const activeZones = getZonesForCar(player.distance, player.lane);
    const zoneKey = activeZones.map((zone) => zone.id).sort().join('|');
    if (zoneKey !== playerLastZoneKey && zoneMessageCooldownMs <= 0) {
      if (activeZones.some((zone) => zone.type === 'boost_pad')) {
        updateObjective('boost', 1);
        pushMessage('进入加速带');
        zoneMessageCooldownMs = 900;
      } else if (activeZones.some((zone) => zone.type === 'shortcut')) {
        pushMessage('近道入口');
        zoneMessageCooldownMs = 900;
      } else if (activeZones.some((zone) => zone.type === 'mud')) {
        pushMessage('进入泥地区');
        zoneMessageCooldownMs = 900;
      } else if (activeZones.some((zone) => zone.type === 'jump')) {
        pushMessage('前方跳台');
        zoneMessageCooldownMs = 900;
      } else if (activeZones.some((zone) => zone.type === 'obstacle')) {
        pushMessage('前方路障');
        zoneMessageCooldownMs = 900;
      }
    }
    playerLastZoneKey = zoneKey;

    if (chokeBounds && zoneMessageCooldownMs <= 0) {
      pushMessage('进入窄路段');
      zoneMessageCooldownMs = 900;
    }
    if (zoneMessageCooldownMs <= 0) {
      const dynamicThreat = getDynamicObstaclesNearDistance(player.distance, 210).some(
        ({ worldDistance }) => worldDistance - player.distance > 72,
      );
      if (dynamicThreat) {
        pushMessage('前方动态障碍');
        zoneMessageCooldownMs = 900;
      }
    }

    const sceneKey = activeScenes.map((scene) => scene.id).sort().join('|');
    if (sceneKey !== playerLastSceneKey && sceneMessageCooldownMs <= 0) {
      const activeScene =
        getSceneByType(activeScenes, 'tunnel') ??
        getSceneByType(activeScenes, 'bridge') ??
        getSceneByType(activeScenes, 'cliff') ??
        getSceneByType(activeScenes, 'neon_city');
      if (activeScene?.type === 'tunnel') {
        pushMessage('进入隧道');
        sceneMessageCooldownMs = 1200;
      } else if (activeScene?.type === 'bridge') {
        pushMessage('驶上高架桥');
        sceneMessageCooldownMs = 1200;
      } else if (activeScene?.type === 'cliff') {
        pushMessage('悬崖风口，稳住车身');
        sceneMessageCooldownMs = 1200;
      } else if (activeScene?.type === 'neon_city') {
        pushMessage('霓虹城区路段');
        sceneMessageCooldownMs = 1200;
      }
    }
    playerLastSceneKey = sceneKey;

    applyTrackZonesToPlayer(player, activeZones, dtMs);
    handleObstacleCollisions(player);
    handleDynamicObstacleCollisions(player, dtMs);

    const draft = getDraftState(player);
    draftActive = draft.active;
    if (draft.active) {
      const gainFactor = 0.16 + draft.intensity * 0.22;
      player.speed = clamp(player.speed + dtMs * gainFactor, 0, MAX_SPEED * 1.22);
      draftingMs = Math.min(2000, draftingMs + dtMs * (0.9 + draft.intensity * 0.8));
      if (draftingMs > 980 && draftBurstCooldownMs <= 0) {
        player.boostMs = Math.max(player.boostMs, 430);
        nitro = Math.min(100, nitro + 7);
        draftBurstCooldownMs = 2400;
        pushMessage(`尾流爆发 ${draft.targetName}`);
      }
    } else {
      draftingMs = Math.max(0, draftingMs - dtMs * 1.5);
    }

    // Final forward-motion guard: zones/hazards may have reduced speed after
    // the early floor logic, so enforce a last rolling floor before advancing distance.
    if (!currentInput.brake && currentInput.throttle) {
      const cruiseFloor = options.mobile ? MOBILE_CRUISE_FLOOR : DESKTOP_CRUISE_FLOOR;
      const stunFloor = options.mobile ? MOBILE_STUN_ROLL_FLOOR : DESKTOP_STUN_ROLL_FLOOR;
      const rollingFloor = player.stunMs > 0 ? stunFloor : cruiseFloor;
      player.speed = Math.max(player.speed, rollingFloor);
    }

    const prevLap = player.lap;
    player.distance += player.speed * (dtMs / 1000) * WORLD_PROGRESS_SCALE;
    player.lap = Math.floor(player.distance / TRACK_LENGTH) + 1;

    if (player.lap > prevLap) {
      const lastLap = raceTimeMs - lapStartMs;
      lapStartMs = raceTimeMs;
      if (prevLap >= 1) {
        bestLapMs = Math.min(bestLapMs, lastLap);
      }
      pushMessage(`第 ${Math.min(cfg.laps, player.lap)} 圈`);
      if (player.lap <= cfg.laps) {
        const zoneLabel = refreshZonePattern('lap');
        pushMessage(`机关布局：${zoneLabel}`);
        currentWeather = rotateWeatherForLap(currentWeather);
        pushMessage(`天气变化：${weatherLabel(currentWeather)}`);
        lapObjective = createObjective(player.lap);
        pushMessage(`本圈任务：${lapObjective.label}`);
      }
    }

    if (player.distance >= nextItemDistance) {
      nextItemDistance += ITEM_INTERVAL_DISTANCE;
      if (!player.item) {
        const ranking = [...cars].sort((a, b) => b.distance - a.distance);
        const position = ranking.findIndex((car) => car.id === player.id) + 1;
        player.item = randomPlayerItem(position, cars.length);
        events.push({ type: 'item_changed', payload: { item: player.item } });
      }
    }

    const risingUseItem = currentInput.useItem && !previousUseItem;
    previousUseItem = currentInput.useItem;
    if (risingUseItem && player.item) {
      useItem(player, player.item);
      player.item = null;
      events.push({ type: 'item_changed', payload: { item: null } });
    }

    maybeTriggerRivalSurge(player);
    updateAi(dtMs, true);
    maybeAutoFinishByAi();
    updateTraps(dtMs);
    handleCarInteractions();
    const movedDistance = player.distance - stepStartDistance;
    const noProgressThreshold = options.mobile ? 0.75 : 1.1;
    if (!currentInput.brake && currentInput.throttle && countdownMs <= 0 && movedDistance < noProgressThreshold) {
      playerNoProgressMs = Math.min(2400, playerNoProgressMs + dtMs);
    } else {
      playerNoProgressMs = Math.max(0, playerNoProgressMs - dtMs * 1.8);
    }
    if (playerNoProgressMs > 260) {
      const recoverRatio = clamp((playerNoProgressMs - 260) / 720, 0, 1);
      const recoverySpeed = options.mobile ? MOBILE_STALL_RECOVERY_SPEED : DESKTOP_STALL_RECOVERY_SPEED;
      player.speed = Math.max(player.speed, recoverySpeed * (0.82 + recoverRatio * 0.26));
      player.stunMs = Math.min(player.stunMs, 160 - recoverRatio * 80);
      player.lane = lerp(
        player.lane,
        clamp(preferredLaneForDistance(player.distance + 90) * 0.3, -0.34, 0.34),
        0.08 + recoverRatio * 0.16,
      );
    }
    updatePositionBonuses();

    if (player.distance >= TRACK_LENGTH * cfg.laps && !finished) {
      finishRace();
    }
  }

  function maybeTriggerRivalSurge(player: CarState): void {
    if (rivalSurgeCooldownMs > 0 || rivalSurgeMs > 0 || !rivalId) {
      return;
    }
    const rival = cars.find((car) => car.id === rivalId);
    if (!rival || rival.finished) {
      return;
    }

    const rel = normalizeDistance(player.distance - rival.distance);
    const laneGap = Math.abs(player.lane - rival.lane);
    const progress = clamp(player.distance / (TRACK_LENGTH * cfg.laps), 0, 1);
    const endgameFactor = progress > ENDGAME_PROGRESS ? (progress - ENDGAME_PROGRESS) / (1 - ENDGAME_PROGRESS) : 0;
    const ranking = [...cars].sort((a, b) => b.distance - a.distance);
    const playerPosition = ranking.findIndex((car) => car.id === player.id) + 1;
    const nearChase = rel > 36 && rel < 380 && laneGap < 0.62;
    const endgameDuel = playerPosition === 1 && rel > 22 && rel < 460 && endgameFactor > 0.34;
    if (!nearChase && !endgameDuel) {
      return;
    }

    rivalSurgeMs = RIVAL_SURGE_BASE_MS + endgameFactor * 1100 + difficultyPreset.aiAggression * 240;
    rivalSurgeCooldownMs = Math.max(3800, 8200 - difficultyPreset.endgamePressure * 1700 - endgameFactor * 1800);
    rivalSurgeSide = rival.lane >= player.lane ? 1 : -1;
    rival.boostMs = Math.max(rival.boostMs, 1060 + endgameFactor * 520);
    rival.aiBlockUntilMs = Math.max(rival.aiBlockUntilMs, raceTimeMs + 900 + endgameFactor * 420);
    rival.aiPressureCooldownMs = Math.max(0, rival.aiPressureCooldownMs - (420 + endgameFactor * 200));

    if (playerPosition <= 2) {
      pushMessage('宿敌冲刺：守住线路');
    } else {
      pushMessage('宿敌贴近：准备防守');
    }
  }

  function updateAi(dtMs: number, raceActive: boolean): void {
    const player = cars[0];
    sanitizeCarMotionState(player, true);
    const ranking = [...cars].sort((a, b) => b.distance - a.distance);
    const playerPosition = ranking.findIndex((car) => car.id === player.id) + 1;
    const raceProgress = clamp(player.distance / (TRACK_LENGTH * cfg.laps), 0, 1);
    const leadPressureMul =
      playerPosition <= 2 ? 1 + (3 - playerPosition) * (0.026 + difficultyPreset.aiAggression * 0.02) : 1;
    const backfieldEaseMul = playerPosition >= Math.max(4, cars.length - 1) ? 0.985 : 1;
    type AiStepPlan = {
      ai: CarState;
      profile: CarState['aiProfile'];
      endgameFactor: number;
      chaseIntensity: number;
      rivalSurgeNorm: number;
      blocked: boolean;
      laneProfileMul: number;
      targetSpeed: number;
      chokeMin: number;
      chokeMax: number;
      hasChoke: boolean;
      cliffGust: number;
      stunned: boolean;
    };
    const stepPlans: AiStepPlan[] = [];

    for (let i = 1; i < cars.length; i += 1) {
      const ai = cars[i];
      sanitizeCarMotionState(ai, false);
      if (ai.finished) {
        continue;
      }

      ai.stunMs = Math.max(0, ai.stunMs - dtMs);
      ai.shieldMs = Math.max(0, ai.shieldMs - dtMs);
      ai.boostMs = Math.max(0, ai.boostMs - dtMs);
      ai.aiRetargetMs -= dtMs;
      ai.aiUseItemCooldownMs -= dtMs;
      ai.aiPressureCooldownMs = Math.max(0, ai.aiPressureCooldownMs - dtMs);
      ai.aiStrategyTimerMs -= dtMs;
      if (raceActive && ai.id === rivalId) {
        ai.aiUseItemCooldownMs -= dtMs * 0.28;
      }

      const profile = ai.aiProfile;
      const rivalSurgeNorm = ai.id === rivalId ? clamp(rivalSurgeMs / (RIVAL_SURGE_BASE_MS + 1200), 0, 1) : 0;
      const endgameFactor = raceProgress > ENDGAME_PROGRESS ? (raceProgress - ENDGAME_PROGRESS) / (1 - ENDGAME_PROGRESS) : 0;
      const relToPlayer = normalizeDistance(player.distance - ai.distance);
      const playerLaneDiff = Math.abs(player.lane - ai.lane);
      const preferredLane = preferredLaneForDistance(ai.distance + 120);
      const chokeBounds = effectiveChokeBounds(getNarrowChokesAtDistance(ai.distance));
      const chaseIntensity = clamp((relToPlayer - AI_CATCHUP_START_DISTANCE) / AI_CATCHUP_SPAN_DISTANCE, 0, 1);

      if (ai.aiStrategyTimerMs <= 0 || ai.aiRetargetMs <= 0) {
        const laneRange = (profile === 'aggressive' ? 0.82 : profile === 'defensive' ? 0.4 : 0.6) * difficultyPreset.aiAggression;
        ai.aiStrategyTimerMs =
          profile === 'aggressive'
            ? 300 + Math.random() * 520
            : profile === 'defensive'
              ? 520 + Math.random() * 780
              : 380 + Math.random() * 620;
        ai.aiRetargetMs =
          profile === 'aggressive'
            ? 320 + Math.random() * 660
            : profile === 'defensive'
              ? 620 + Math.random() * 980
              : 460 + Math.random() * 800;

        if (relToPlayer < -14 && relToPlayer > -320 && playerLaneDiff < 0.42 && ai.aiPressureCooldownMs <= 0) {
          const blockChance =
            difficultyPreset.aiBlockChance *
            (profile === 'aggressive' ? 1.2 : profile === 'defensive' ? 0.75 : 1) *
            (relToPlayer > -140 ? 1.16 : 0.9) *
            (1 + difficultyPreset.endgamePressure * endgameFactor * 0.52) *
            (ai.id === rivalId ? 1.16 + rivalSurgeNorm * 0.34 : 1);
          if (Math.random() < blockChance) {
            ai.aiBlockUntilMs = raceTimeMs + 980 + Math.random() * 760;
            ai.aiPressureCooldownMs = 1580 + Math.random() * 1220;
          }
        }

        if (ai.aiBlockUntilMs > raceTimeMs) {
          ai.aiTargetLane = clamp(player.lane + Math.sign(player.lane || ai.lane || 1) * 0.04, -1.02, 1.02);
        } else if (relToPlayer > 24 && relToPlayer < 320) {
          const overtakeSide = player.lane >= 0 ? -1 : 1;
          const overtakeLane = clamp(player.lane + overtakeSide * (0.24 + ai.aiRiskLevel * 0.18), -1.05, 1.05);
          ai.aiTargetLane = clamp(lerp(preferredLane, overtakeLane, 0.68), -1.05, 1.05);
        } else {
          ai.aiTargetLane = clamp(preferredLane + (-0.5 + Math.random()) * laneRange, -1.05, 1.05);
        }
        if (rivalSurgeNorm > 0.08 && relToPlayer > -120 && relToPlayer < 220) {
          const pressureLane = clamp(player.lane + (player.lane >= 0 ? -0.04 : 0.04), -1.02, 1.02);
          ai.aiTargetLane = clamp(lerp(ai.aiTargetLane, pressureLane, 0.2 + rivalSurgeNorm * 0.36), -1.05, 1.05);
        }
      }

      const blocked = ai.aiBlockUntilMs > raceTimeMs;
      const laneProfileMul = profile === 'aggressive' ? 1.08 : profile === 'defensive' ? 0.85 : 1;
      const aiScenes = getScenesAtDistance(ai.distance);
      const aiBridgeScene = getSceneByType(aiScenes, 'bridge');
      const aiCliffScene = getSceneByType(aiScenes, 'cliff');
      let targetSpeed = (184 + ai.aiSkill * 204) * (raceActive ? 1 : 0.45) * difficultyPreset.aiTargetSpeedFactor;
      targetSpeed += profile === 'aggressive' ? 28 : profile === 'defensive' ? -8 : 10;
      if (blocked) {
        targetSpeed += 10;
      }
      if (relToPlayer > 20 && relToPlayer < 340) {
        targetSpeed += 26 + ai.aiRiskLevel * 16;
      }
      if (chaseIntensity > 0) {
        targetSpeed += (24 + ai.aiRiskLevel * 28) * chaseIntensity;
      }
      if (ai.id === rivalId && relToPlayer > 10 && relToPlayer < 360) {
        targetSpeed += 28 + endgameFactor * 18;
      }
      if (ai.id === rivalId && chaseIntensity > 0) {
        targetSpeed += (26 + difficultyPreset.endgamePressure * 14) * chaseIntensity;
      }
      if (rivalSurgeNorm > 0.08) {
        targetSpeed += 24 + rivalSurgeNorm * 64;
      }
      if (ai.boostMs > 0) {
        targetSpeed += profile === 'aggressive' ? 100 : profile === 'defensive' ? 64 : 82;
      }
      if (currentWeather === 'rain') {
        targetSpeed *= profile === 'aggressive' ? 0.92 : 0.94;
      } else if (currentWeather === 'fog') {
        targetSpeed *= 0.96;
      }
      const curveDrag = Math.abs(getSegmentAtDistance(ai.distance).curve) * (profile === 'defensive' ? 75 : 64);
      targetSpeed -= curveDrag;
      if (aiBridgeScene && currentWeather !== 'clear') {
        targetSpeed *= currentWeather === 'rain' ? 0.972 : 0.984;
      }
      if (chokeBounds) {
        targetSpeed *= 0.982;
      }
      targetSpeed *= ai.id === rivalId ? leadPressureMul * 1.02 : leadPressureMul;
      if (ai.id !== rivalId && playerPosition >= Math.max(4, cars.length - 1)) {
        targetSpeed *= backfieldEaseMul;
      }
      targetSpeed *= 1 + chaseIntensity * (profile === 'aggressive' ? 0.05 : 0.035);
      if (rivalSurgeNorm > 0.08) {
        targetSpeed *= 1 + rivalSurgeNorm * 0.08;
      }
      targetSpeed *= 1 + difficultyPreset.endgamePressure * endgameFactor * 0.055;

      const cliffGust = aiCliffScene
        ? Math.sin(raceTimeMs * 0.0043 + ai.distance * 0.0015) * aiCliffScene.intensity * (aiCliffScene.side ?? 1)
        : 0;
      stepPlans.push({
        ai,
        profile,
        endgameFactor,
        chaseIntensity,
        rivalSurgeNorm,
        blocked,
        laneProfileMul,
        targetSpeed,
        chokeMin: chokeBounds?.laneMin ?? 0,
        chokeMax: chokeBounds?.laneMax ?? 0,
        hasChoke: Boolean(chokeBounds),
        cliffGust,
        stunned: ai.stunMs > 0,
      });
    }

    const applySingleAiStep = (plan: AiStepPlan): void => {
      const { ai } = plan;
      const nextAiStep = tuning.simulateAiStep
        ? tuning.simulateAiStep(
            ai.speed,
            ai.lane,
            ai.aiTargetLane,
            plan.targetSpeed,
            ai.aiRiskLevel,
            plan.laneProfileMul,
            dtMs,
            plan.blocked,
            plan.stunned,
            plan.chokeMin,
            plan.chokeMax,
            plan.hasChoke,
            plan.cliffGust,
          )
        : simulateAiStepFallback(
            ai.speed,
            ai.lane,
            ai.aiTargetLane,
            plan.targetSpeed,
            ai.aiRiskLevel,
            plan.laneProfileMul,
            dtMs,
            plan.blocked,
            plan.stunned,
            plan.chokeMin,
            plan.chokeMax,
            plan.hasChoke,
            plan.cliffGust,
          );
      ai.speed = nextAiStep.speed;
      ai.lane = nextAiStep.lane;
    };

    if (stepPlans.length > 0 && tuning.simulateAiStepBatch && stepPlans.length > 1) {
      const stride = 13;
      const packed = new Float32Array(stepPlans.length * stride);
      for (let idx = 0; idx < stepPlans.length; idx += 1) {
        const plan = stepPlans[idx];
        const base = idx * stride;
        packed[base] = plan.ai.speed;
        packed[base + 1] = plan.ai.lane;
        packed[base + 2] = plan.ai.aiTargetLane;
        packed[base + 3] = plan.targetSpeed;
        packed[base + 4] = plan.ai.aiRiskLevel;
        packed[base + 5] = plan.laneProfileMul;
        packed[base + 6] = dtMs;
        packed[base + 7] = plan.blocked ? 1 : 0;
        packed[base + 8] = plan.stunned ? 1 : 0;
        packed[base + 9] = plan.chokeMin;
        packed[base + 10] = plan.chokeMax;
        packed[base + 11] = plan.hasChoke ? 1 : 0;
        packed[base + 12] = plan.cliffGust;
      }

      const result = tuning.simulateAiStepBatch(packed);
      if (result.length === stepPlans.length * 2) {
        for (let idx = 0; idx < stepPlans.length; idx += 1) {
          const plan = stepPlans[idx];
          plan.ai.speed = Number.isFinite(result[idx * 2]) ? result[idx * 2] : plan.ai.speed;
          plan.ai.lane = Number.isFinite(result[idx * 2 + 1]) ? result[idx * 2 + 1] : plan.ai.lane;
        }
      } else {
        for (const plan of stepPlans) {
          applySingleAiStep(plan);
        }
      }
    } else {
      for (const plan of stepPlans) {
        applySingleAiStep(plan);
      }
    }

    const aiStaticHazardMeta: Array<{ localDistance: number; zoneId: string; slot: number }> = [];
    const aiDynamicHazardMeta: Array<{ localDistance: number; obstacleId: string }> = [];
    const staticHitIndices = new Int32Array(stepPlans.length).fill(-1);
    const dynamicHitIndices = new Int32Array(stepPlans.length).fill(-1);
    let hazardBatchApplied = false;
    if (stepPlans.length > 0 && tuning.simulateAiHazardBatch) {
      const aiStride = 4;
      const aiPacked = new Float32Array(stepPlans.length * aiStride);
      for (let idx = 0; idx < stepPlans.length; idx += 1) {
        const plan = stepPlans[idx];
        const packedFlags = (plan.ai.id === rivalId ? 1 : 0) + (plan.profile === 'aggressive' ? 2 : 0);
        const base = idx * aiStride;
        aiPacked[base] = plan.ai.distance;
        aiPacked[base + 1] = plan.ai.lane;
        aiPacked[base + 2] = plan.ai.aiRiskLevel;
        aiPacked[base + 3] = packedFlags;
      }

      const staticPacked: number[] = [];
      for (const zone of resolvedTrackZones) {
        if (zone.type !== 'obstacle') {
          continue;
        }
        const offsets = zone.obstacleOffsets ?? [0.5];
        const lanes = zone.obstacleLanes ?? [(zone.laneMin + zone.laneMax) * 0.5];
        const count = Math.min(offsets.length, lanes.length);
        for (let slot = 0; slot < count; slot += 1) {
          const localDistance = zone.start + (zone.end - zone.start) * offsets[slot];
          staticPacked.push(localDistance, lanes[slot]);
          aiStaticHazardMeta.push({ localDistance, zoneId: zone.id, slot });
        }
      }

      const dynamicPacked: number[] = [];
      for (const obstacle of dynamicObstacles) {
        dynamicPacked.push(
          obstacle.start,
          dynamicObstacleLane(obstacle, raceTimeMs) * difficultyPreset.movingObstacleFactor,
          obstacle.size,
        );
        aiDynamicHazardMeta.push({
          localDistance: obstacle.start,
          obstacleId: obstacle.id,
        });
      }

      if (aiStaticHazardMeta.length > 0 || aiDynamicHazardMeta.length > 0) {
        const result = tuning.simulateAiHazardBatch(
          aiPacked,
          Float32Array.from(staticPacked),
          Float32Array.from(dynamicPacked),
          TRACK_LENGTH,
        );
        if (result.length === stepPlans.length * 3) {
          hazardBatchApplied = true;
          for (let idx = 0; idx < stepPlans.length; idx += 1) {
            const plan = stepPlans[idx];
            const laneDelta = result[idx * 3];
            if (Number.isFinite(laneDelta) && Math.abs(laneDelta) > 0.0001) {
              plan.ai.lane = clamp(plan.ai.lane + laneDelta, -1.2, 1.2);
            }
            const staticIdxRaw = result[idx * 3 + 1];
            const dynamicIdxRaw = result[idx * 3 + 2];
            staticHitIndices[idx] = Number.isFinite(staticIdxRaw) ? Math.round(staticIdxRaw) : -1;
            dynamicHitIndices[idx] = Number.isFinite(dynamicIdxRaw) ? Math.round(dynamicIdxRaw) : -1;
          }
        }
      }
    }

    const applyAiStaticHitByIndex = (ai: CarState, staticIdx: number): void => {
      if (staticIdx < 0 || staticIdx >= aiStaticHazardMeta.length) {
        return;
      }
      const meta = aiStaticHazardMeta[staticIdx];
      const obstacleDistance = toNearestWorldDistance(meta.localDistance, ai.distance);
      const lapKey = Math.floor(obstacleDistance / TRACK_LENGTH);
      const key = `${ai.id}:${lapKey}:${meta.zoneId}:${meta.slot}`;
      if (aiObstacleHitKeys.has(key)) {
        return;
      }
      aiObstacleHitKeys.add(key);
      if (ai.id === rivalId) {
        ai.speed *= 0.76;
        ai.stunMs = Math.max(ai.stunMs, 320);
      } else {
        ai.speed *= ai.aiProfile === 'aggressive' ? 0.64 : 0.58;
        ai.stunMs = Math.max(ai.stunMs, ai.aiProfile === 'aggressive' ? 520 : 660);
      }
    };

    const applyAiDynamicHitByIndex = (ai: CarState, dynamicIdx: number): void => {
      if (dynamicIdx < 0 || dynamicIdx >= aiDynamicHazardMeta.length) {
        return;
      }
      const meta = aiDynamicHazardMeta[dynamicIdx];
      const worldDistance = toNearestWorldDistance(meta.localDistance, ai.distance);
      const lapKey = Math.floor(worldDistance / TRACK_LENGTH);
      const key = `${ai.id}:${lapKey}:${meta.obstacleId}`;
      if (aiDynamicObstacleHitKeys.has(key)) {
        return;
      }
      aiDynamicObstacleHitKeys.add(key);
      if (ai.id === rivalId) {
        ai.speed *= 0.84;
        ai.stunMs = Math.max(ai.stunMs, 240);
      } else {
        ai.speed *= ai.aiProfile === 'aggressive' ? 0.74 : 0.67;
        ai.stunMs = Math.max(ai.stunMs, ai.aiProfile === 'aggressive' ? 380 : 540);
      }
    };

    for (let idx = 0; idx < stepPlans.length; idx += 1) {
      const plan = stepPlans[idx];
      const { ai } = plan;
      applyTrackZonesToAi(ai, dtMs);
      if (hazardBatchApplied) {
        applyAiStaticHitByIndex(ai, staticHitIndices[idx]);
        applyAiDynamicHitByIndex(ai, dynamicHitIndices[idx]);
      } else {
        handleAiObstacleCollisions(ai);
        handleAiDynamicObstacleCollisions(ai);
      }

      if (
        raceActive &&
        ai.id === rivalId &&
        rivalEmpCooldownMs <= 0 &&
        empJammedMs <= 0 &&
        ai.distance > player.distance &&
        normalizeDistance(ai.distance - player.distance) < 300 &&
        Math.abs(ai.lane - player.lane) < 0.3
      ) {
        empJammedMs = 1700;
        rivalEmpCooldownMs = EMP_COOLDOWN_MS;
        pushMessage(`宿敌干扰波 ${ai.name}`);
      }

      ai.distance += ai.speed * (dtMs / 1000) * WORLD_PROGRESS_SCALE;
      ai.lap = Math.floor(ai.distance / TRACK_LENGTH) + 1;

      if (
        !ai.item &&
        Math.random() <
          0.0058 *
            difficultyPreset.aiItemGainRate *
            (1 + plan.endgameFactor * 0.42) *
            (1 + plan.chaseIntensity * 0.54) *
            (ai.id === rivalId ? 1.18 + plan.rivalSurgeNorm * 0.3 : 1)
      ) {
        ai.item = randomItem();
      }

      if (ai.item && ai.aiUseItemCooldownMs <= 0 && raceActive) {
        const itemPlan = planAiItemUse(ai, player, plan.endgameFactor);
        if (itemPlan.use) {
          useItem(ai, ai.item, itemPlan.trapLane !== undefined ? { trapLane: itemPlan.trapLane } : undefined);
          ai.item = null;
          const baseCooldown =
            plan.profile === 'aggressive'
              ? 1700 + Math.random() * 1300
              : plan.profile === 'defensive'
                ? 2900 + Math.random() * 2100
                : 2400 + Math.random() * 1800;
          ai.aiUseItemCooldownMs = baseCooldown * (itemPlan.cooldownScale ?? 1) * (1 - plan.chaseIntensity * 0.18);
        }
      }

      if (ai.distance >= TRACK_LENGTH * cfg.laps) {
        ai.finished = true;
        ai.finishTimeMs = raceTimeMs;
        if (firstAiFinishAtMs < 0) {
          firstAiFinishAtMs = raceTimeMs;
          pushMessage(`${ai.name} 已冲线`);
        }
      }
    }
  }

  function maybeAutoFinishByAi(): void {
    if (finished) {
      return;
    }

    const player = cars[0];
    if (player.finished) {
      return;
    }

    const aiCars = cars.slice(1);
    const finishedAiCount = aiCars.reduce((count, ai) => count + (ai.finished ? 1 : 0), 0);
    if (finishedAiCount === 0) {
      return;
    }

    if (finishedAiCount === aiCars.length) {
      pushMessage('所有对手已完赛，比赛结束');
      finishRace();
      return;
    }

    if (firstAiFinishAtMs >= 0 && raceTimeMs - firstAiFinishAtMs >= AI_FINISH_GRACE_MS) {
      pushMessage('对手领先完赛，比赛超时结算');
      finishRace();
    }
  }

  function pickRival(allCars: CarState[]): string {
    const aiCars = allCars.filter((car) => !car.isPlayer);
    if (aiCars.length === 0) {
      return '';
    }
    const weighted = [...aiCars].sort((a, b) => {
      const profileWeight = (car: CarState) => (car.aiProfile === 'aggressive' ? 0.14 : car.aiProfile === 'balanced' ? 0.08 : 0.03);
      const scoreA = a.aiSkill + profileWeight(a) + a.aiRiskLevel * 0.08;
      const scoreB = b.aiSkill + profileWeight(b) + b.aiRiskLevel * 0.08;
      return scoreB - scoreA;
    });
    return weighted[0]?.id ?? aiCars[0].id;
  }

  function planAiItemUse(ai: CarState, player: CarState, endgameFactor: number): AiItemPlan {
    if (!ai.item) {
      return { use: false };
    }
    const profile = ai.aiProfile;
    const relToPlayer = normalizeDistance(player.distance - ai.distance);
    const playerLaneDiff = Math.abs(player.lane - ai.lane);
    const pressure = 1 + difficultyPreset.endgamePressure * endgameFactor * 0.34;
    const rivalBonus = ai.id === rivalId ? 1.2 : 1;
    const surgeBonus = ai.id === rivalId ? 1 + clamp(rivalSurgeMs / (RIVAL_SURGE_BASE_MS + 900), 0, 1) * 0.34 : 1;
    const chaseUrgency = clamp((relToPlayer - 36) / 380, 0, 1);
    const defendUrgency = clamp((-relToPlayer - 36) / 320, 0, 1);
    const baseChance =
      (profile === 'aggressive' ? 0.044 : profile === 'defensive' ? 0.019 : 0.031) *
      difficultyPreset.aiUseItemChanceFactor *
      pressure *
      rivalBonus *
      surgeBonus *
      (1 + chaseUrgency * 0.42 + defendUrgency * 0.18);

    if (ai.item === 'rocket') {
      if (relToPlayer <= 36 || relToPlayer >= 860) {
        return { use: false };
      }
      const lockBonus = playerLaneDiff < 0.26 ? 1.3 : playerLaneDiff < 0.46 ? 1.08 : 0.84;
      const chaseBonus = relToPlayer < 280 ? 1.22 : relToPlayer < 520 ? 1.06 : 0.9;
      const useChance = baseChance * lockBonus * chaseBonus;
      return { use: Math.random() < useChance, cooldownScale: 0.84 };
    }

    if (ai.item === 'banana') {
      const chokes = getNarrowChokesAtDistance(ai.distance + 260);
      const choke = chokes[0] ?? null;
      const chokeCenter = choke ? (choke.laneMin + choke.laneMax) * 0.5 : preferredLaneForDistance(ai.distance + 180);
      const trapLane = clamp(lerp(chokeCenter, player.lane, 0.58), -1.08, 1.08);
      const isDefendingLead = relToPlayer < -36 && relToPlayer > -340;
      const isChokeSetup = Boolean(choke) && relToPlayer < 220;
      const useChance = baseChance * (isDefendingLead ? 1.32 : 0.92) * (isChokeSetup ? 1.28 : 1);
      return {
        use: Math.random() < useChance,
        trapLane,
        cooldownScale: isChokeSetup ? 0.86 : 1,
      };
    }

    if (ai.item === 'boost') {
      const inChaseWindow = relToPlayer > 90 && relToPlayer < 520;
      const useChance = baseChance * (inChaseWindow ? 1.42 : 0.84);
      return { use: Math.random() < useChance, cooldownScale: inChaseWindow ? 0.8 : 0.95 };
    }

    if (ai.item === 'shield') {
      const needsDefense = relToPlayer < -24 && relToPlayer > -320;
      const useChance = baseChance * (needsDefense ? 1.22 : 0.82);
      return { use: Math.random() < useChance, cooldownScale: 1.04 };
    }

    return { use: Math.random() < baseChance };
  }

  function createObjective(lap: number): LapObjective {
    const roll = Math.random();
    if (roll < 0.2) {
      const target = 2 + Math.min(2, lap);
      return {
        kind: 'drift',
        target,
        progress: 0,
        done: false,
        rewardStyle: 340 + lap * 120,
        rewardNitro: 16 + lap * 4,
        label: '完成漂移',
      };
    }
    if (roll < 0.4) {
      const target = 2 + Math.min(2, lap);
      return {
        kind: 'overtake',
        target,
        progress: 0,
        done: false,
        rewardStyle: 360 + lap * 110,
        rewardNitro: 14 + lap * 5,
        label: '完成超车',
      };
    }
    if (roll < 0.58) {
      return {
        kind: 'boost',
        target: 2 + Math.min(1, lap),
        progress: 0,
        done: false,
        rewardStyle: 300 + lap * 100,
        rewardNitro: 20 + lap * 5,
        label: '踩加速带',
      };
    }
    if (roll < 0.78) {
      return {
        kind: 'shortcut',
        target: 1 + Math.min(2, lap - 1),
        progress: 0,
        done: false,
        rewardStyle: 480 + lap * 130,
        rewardNitro: 22 + lap * 5,
        label: '穿越近道',
      };
    }
    return {
      kind: 'jump',
      target: 1 + Math.min(2, lap - 1),
      progress: 0,
      done: false,
      rewardStyle: 420 + lap * 120,
      rewardNitro: 18 + lap * 5,
      label: '触发跳台',
    };
  }

  function updateObjective(kind: ObjectiveKind, amount: number): void {
    if (lapObjective.done || lapObjective.kind !== kind || amount <= 0) {
      return;
    }
    lapObjective.progress = Math.min(lapObjective.target, lapObjective.progress + amount);
    if (lapObjective.progress < lapObjective.target) {
      return;
    }
    lapObjective.done = true;
    objectiveCompleted += 1;
    styleScore += lapObjective.rewardStyle;
    nitro = Math.min(100, nitro + lapObjective.rewardNitro);
    playerAirCooldownMs = Math.max(0, playerAirCooldownMs - 220);
    cars[0].boostMs = Math.max(cars[0].boostMs, 620);
    pushMessage(`任务完成 +${lapObjective.rewardStyle}`);
  }

  function objectiveProgressLabel(objective: LapObjective): string {
    if (objective.done) {
      return '完成';
    }
    return `${Math.floor(objective.progress)}/${objective.target}`;
  }

  function refreshZonePattern(trigger: 'start' | 'lap'): string {
    zonePatternIndex += 1;
    const lapPressure =
      cars.length > 0
        ? clamp((Math.max(1, cars[0].lap) - 1) / Math.max(1, cfg.laps - 1), 0, 1)
        : 0;
    const modeRoll = (zonePatternIndex + (difficultyTier === 'hard_pro' ? 1 : 0)) % 3;
    const baseShift = modeRoll === 0 ? 0 : modeRoll === 1 ? 0.13 : -0.13;
    const hardScale = (difficultyTier === 'hard_pro' ? 1.16 : difficultyTier === 'hard_mid' ? 1 : 0.88) * (1 + lapPressure * 0.08);
    const obstacleWidthScale = (modeRoll === 0 ? 0.94 : modeRoll === 1 ? 0.86 : 0.82) * (1 - lapPressure * 0.12);
    const patternTag = modeRoll === 0 ? '平衡' : modeRoll === 1 ? '右压' : '左压';

    resolvedTrackZones = trackZones.map((zone, index) => {
      const wave = Math.sin(zonePatternIndex * 0.81 + index * 1.27);
      const shift = (baseShift + wave * 0.06) * hardScale;
      let laneMin = clamp(zone.laneMin + shift, -1.24, 1.2);
      let laneMax = clamp(zone.laneMax + shift, -1.2, 1.24);
      if (laneMax - laneMin < 0.2) {
        const center = (laneMin + laneMax) * 0.5;
        laneMin = center - 0.1;
        laneMax = center + 0.1;
      }

      if (zone.type === 'obstacle') {
        const center = (laneMin + laneMax) * 0.5;
        const halfSpan = Math.max(0.22, ((laneMax - laneMin) * 0.5) * obstacleWidthScale);
        laneMin = clamp(center - halfSpan, -1.24, 1.1);
        laneMax = clamp(center + halfSpan, -1.1, 1.24);
      }

      const obstacleLanes = zone.obstacleLanes
        ? zone.obstacleLanes.map((lane, laneIndex) =>
            clamp(lane + shift * 0.8 + Math.sin(zonePatternIndex * 1.22 + laneIndex * 0.96) * 0.08 * hardScale, -1.06, 1.06),
          )
        : undefined;
      const obstacleOffsets = zone.obstacleOffsets
        ? zone.obstacleOffsets.map((offset, offsetIndex) =>
            clamp(
              offset + Math.sin(zonePatternIndex * 0.64 + offsetIndex * 1.44) * (0.05 + lapPressure * 0.02),
              0.12,
              0.88,
            ),
          )
        : undefined;

      return {
        ...zone,
        laneMin,
        laneMax,
        obstacleLanes,
        obstacleOffsets,
      };
    });

    const avgCenter =
      resolvedTrackZones.reduce((sum, zone) => sum + (zone.laneMin + zone.laneMax) * 0.5, 0) / Math.max(1, resolvedTrackZones.length);
    const laneHint = avgCenter > 0.12 ? '偏右线路' : avgCenter < -0.12 ? '偏左线路' : '中线路线';
    return trigger === 'start' ? `${laneHint}（${patternTag}）` : `${laneHint}（${patternTag} 轮换）`;
  }

  function getZonesAtDistance(distance: number): TrackZone[] {
    const normalized = normalizeTrackDistance(distance);
    return resolvedTrackZones.filter((zone) => normalized >= zone.start && normalized <= zone.end);
  }

  function getZonesForCar(distance: number, lane: number): TrackZone[] {
    return getZonesAtDistance(distance).filter((zone) => lane >= zone.laneMin && lane <= zone.laneMax);
  }

  function getScenesAtDistance(distance: number): SceneZone[] {
    const normalized = normalizeTrackDistance(distance);
    return sceneZones.filter((scene) => sceneContainsDistance(scene, normalized));
  }

  function getSceneByType(scenes: SceneZone[], type: SceneType): SceneZone | null {
    return scenes.find((scene) => scene.type === type) ?? null;
  }

  function getNarrowChokesAtDistance(distance: number): NarrowChokeZone[] {
    const normalized = normalizeTrackDistance(distance);
    return narrowChokeZones.filter((zone) => sceneContainsDistance(zone, normalized));
  }

  function getDynamicObstaclesNearDistance(distance: number, maxAheadDistance: number): Array<{ obstacle: DynamicObstacle; worldDistance: number }> {
    const result: Array<{ obstacle: DynamicObstacle; worldDistance: number }> = [];
    const normalizedBase = normalizeTrackDistance(distance);
    for (const obstacle of dynamicObstacles) {
      const startGap = (obstacle.start - normalizedBase + TRACK_LENGTH) % TRACK_LENGTH;
      if (startGap > maxAheadDistance) {
        continue;
      }
      const worldDistance = toNearestWorldDistance(obstacle.start, distance);
      const rel = worldDistance - distance;
      if (rel < -120 || rel > maxAheadDistance) {
        continue;
      }
      result.push({ obstacle, worldDistance });
    }
    return result;
  }

  function dynamicObstacleLane(obstacle: DynamicObstacle, nowMs: number): number {
    const raceProgress =
      cars.length > 0
        ? clamp(cars[0].distance / (TRACK_LENGTH * Math.max(1, cfg.laps)), 0, 1)
        : 0;
    const pressure = Math.max(0, raceProgress - 0.35);
    const ampScale = 1 + pressure * 0.34;
    const periodScale = clamp(1 - pressure * 0.22, 0.72, 1);
    return obstacle.baseLane + Math.sin((nowMs + obstacle.phaseMs) / (obstacle.periodMs * periodScale) * Math.PI * 2) * obstacle.amplitude * ampScale;
  }

  function effectiveChokeBounds(chokes: NarrowChokeZone[]): { laneMin: number; laneMax: number } | null {
    if (chokes.length === 0) {
      return null;
    }
    let laneMin = -1.28;
    let laneMax = 1.28;
    for (const zone of chokes) {
      laneMin = Math.max(laneMin, zone.laneMin);
      laneMax = Math.min(laneMax, zone.laneMax);
    }
    return { laneMin, laneMax };
  }

  function preferredLaneForDistance(distance: number): number {
    const segment = getSegmentAtDistance(distance);
    const curve = segment.curve;
    if (Math.abs(curve) < 0.008) {
      return 0;
    }
    return clamp(-Math.sign(curve) * 0.54, -0.92, 0.92);
  }

  function applyTrackZonesToPlayer(player: CarState, activeZones: TrackZone[], dtMs: number): void {
    let inMud = false;

    for (const zone of activeZones) {
      if (zone.type === 'boost_pad') {
        player.boostMs = Math.max(player.boostMs, 320);
        nitro = Math.min(100, nitro + dtMs * 0.006);
        styleScore += dtMs * 0.04;
        continue;
      }

      if (zone.type === 'mud') {
        inMud = true;
        player.speed *= 0.985;
        if (player.boostMs > 0) {
          player.boostMs = Math.max(0, player.boostMs - dtMs * 1.2);
        }
        continue;
      }

      if (zone.type === 'jump' && playerAirMs <= 0 && playerAirCooldownMs <= 0 && player.speed > 135) {
        playerAirMs = 520 + clamp(player.speed, 0, MAX_SPEED) * 0.42;
        playerAirCooldownMs = 1300;
        styleScore += 210;
        driftCombo += 1;
        bestDriftCombo = Math.max(bestDriftCombo, driftCombo);
        updateObjective('jump', 1);
        pushMessage('跳台腾空');
        continue;
      }

      if (zone.type === 'shortcut') {
        const entryKey = `${player.lap}:${zone.id}`;
        const center = (zone.laneMin + zone.laneMax) * 0.5;
        const laneError = Math.abs(player.lane - center);
        const risky = player.speed > 210 && Math.abs(currentInput.steer) > 0.58;

        if (!shortcutVisitedKeys.has(entryKey)) {
          if (laneError <= 0.14 && player.speed > 165) {
            shortcutVisitedKeys.add(entryKey);
            raceTimeMs = Math.max(0, raceTimeMs - 820);
            styleScore += 280;
            nitro = Math.min(100, nitro + 12);
            player.boostMs = Math.max(player.boostMs, 760);
            updateObjective('shortcut', 1);
            pushMessage('近道成功 -0.8s');
          } else if (risky) {
            shortcutVisitedKeys.add(entryKey);
            player.speed *= currentWeather === 'rain' ? 0.82 : 0.88;
            player.lane += Math.sign(currentInput.steer) * 0.08;
            breakCombo('近道失误');
            pushMessage('近道打滑');
          }
        } else {
          player.speed = clamp(player.speed + dtMs * 0.02, 0, MAX_SPEED * 1.22);
        }
        continue;
      }

      if (zone.type === 'obstacle') {
        player.speed *= 0.998;
      }
    }

    if (inMud && driftCombo >= 2) {
      breakCombo('陷入泥地');
    }
  }

  function applyTrackZonesToAi(ai: CarState, dtMs: number): void {
    const activeZones = getZonesForCar(ai.distance, ai.lane);
    for (const zone of activeZones) {
      if (zone.type === 'boost_pad') {
        ai.boostMs = Math.max(ai.boostMs, 240);
      } else if (zone.type === 'mud') {
        ai.speed *= 0.988;
      } else if (zone.type === 'jump') {
        ai.speed = Math.min(MAX_SPEED * 1.08, ai.speed + dtMs * 0.03);
      } else if (zone.type === 'shortcut') {
        if (ai.aiProfile === 'aggressive') {
          ai.speed = Math.min(MAX_SPEED * 1.12, ai.speed + dtMs * 0.04);
        } else if (ai.aiProfile === 'defensive') {
          ai.speed *= 0.993;
        }
      } else if (zone.type === 'obstacle') {
        ai.speed *= ai.aiProfile === 'aggressive' ? 0.997 : 0.994;
      }
    }
  }

  function handleObstacleCollisions(player: CarState): void {
    const raceProgress = clamp(player.distance / (TRACK_LENGTH * cfg.laps), 0, 1);
    const hazardScale = 1 + Math.max(0, raceProgress - 0.32) * 0.82;
    if (tuning.detectPlayerStaticHazardsBatch) {
      type StaticObstacleMeta = { localDistance: number; lane: number; zoneId: string; slot: number };
      const packed: number[] = [];
      const metas: StaticObstacleMeta[] = [];
      for (const zone of resolvedTrackZones) {
        if (zone.type !== 'obstacle') {
          continue;
        }
        const offsets = zone.obstacleOffsets ?? [0.5];
        const lanes = zone.obstacleLanes ?? [(zone.laneMin + zone.laneMax) * 0.5];
        const count = Math.min(offsets.length, lanes.length);
        for (let i = 0; i < count; i += 1) {
          const localDistance = zone.start + (zone.end - zone.start) * offsets[i];
          packed.push(localDistance, lanes[i]);
          metas.push({ localDistance, lane: lanes[i], zoneId: zone.id, slot: i });
        }
      }
      if (metas.length > 0) {
        const states = tuning.detectPlayerStaticHazardsBatch(
          player.distance,
          player.lane,
          player.speed,
          playerAirMs,
          Float32Array.from(packed),
          TRACK_LENGTH,
        );
        if (states.length === metas.length) {
          for (let idx = 0; idx < metas.length; idx += 1) {
            const state = Math.round(states[idx] ?? 0);
            if (state <= 0) {
              continue;
            }
            const meta = metas[idx];
            const obstacleDistance = toNearestWorldDistance(meta.localDistance, player.distance);
            const lapKey = Math.floor(obstacleDistance / TRACK_LENGTH);
            const key = `${lapKey}:${meta.zoneId}:${meta.slot}`;

            if (state === 1) {
              if (obstacleHitKeys.has(key)) {
                continue;
              }
              obstacleHitKeys.add(key);
              obstacleNearMissKeys.delete(key);

              if (player.shieldMs > 0) {
                player.shieldMs = 0;
                const penalty = difficultyPreset.obstaclePenaltyFactor;
                player.speed *= clamp(0.88 - (penalty - 1) * 0.08 - (hazardScale - 1) * 0.06, 0.62, 0.9);
                player.boostMs = Math.max(0, player.boostMs - (320 + 90 * penalty) * hazardScale);
                const laneKick = (player.lane >= meta.lane ? 1 : -1) * 0.12;
                player.lane = clamp(player.lane + laneKick, -1.6, 1.6);
                triggerObstacleImpact(meta.lane, false, laneKick);
                pushMessage('护盾爆掉，冲击减速');
                continue;
              }

              const penalty = difficultyPreset.obstaclePenaltyFactor;
              player.stunMs = Math.max(player.stunMs, (1180 + 200 * penalty) * hazardScale);
              player.speed = Math.min(
                player.speed * (currentWeather === 'rain' ? 0.24 : 0.3) / (penalty * hazardScale),
                92 - penalty * 7,
              );
              player.boostMs = 0;
              nitro = Math.max(0, nitro - (12 + penalty * 6) * hazardScale);
              raceTimeMs += (260 + penalty * 140) * hazardScale;
              const laneKick = (player.lane >= meta.lane ? 1 : -1) * 0.24;
              player.lane = clamp(player.lane + laneKick, -1.6, 1.6);
              styleScore = Math.max(0, styleScore - (220 + penalty * 60) * hazardScale);
              triggerObstacleImpact(meta.lane, true, laneKick);
              breakCombo('撞上路障');
              pushMessage('重撞路障 -0.4s');
              continue;
            }

            if (state === 2 && !obstacleNearMissKeys.has(key)) {
              obstacleNearMissKeys.add(key);
              styleScore += 140;
              nitro = Math.min(100, nitro + 5);
              pushMessage('极限贴边 +140');
            }
          }
          return;
        }
      }
    }

    for (const zone of resolvedTrackZones) {
      if (zone.type !== 'obstacle') {
        continue;
      }
      const offsets = zone.obstacleOffsets ?? [0.5];
      const lanes = zone.obstacleLanes ?? [(zone.laneMin + zone.laneMax) * 0.5];
      const count = Math.min(offsets.length, lanes.length);
      for (let i = 0; i < count; i += 1) {
        const localDistance = zone.start + (zone.end - zone.start) * offsets[i];
        const obstacleDistance = toNearestWorldDistance(localDistance, player.distance);
        const rel = obstacleDistance - player.distance;
        if (rel < -70 || rel > 120) {
          continue;
        }

        const lapKey = Math.floor(obstacleDistance / TRACK_LENGTH);
        const key = `${lapKey}:${zone.id}:${i}`;
        const laneDiff = Math.abs(player.lane - lanes[i]);
        if (laneDiff < STATIC_OBSTACLE_HIT_LANE_THRESHOLD && Math.abs(rel) < 72 && playerAirMs <= 0) {
          if (obstacleHitKeys.has(key)) {
            continue;
          }
          obstacleHitKeys.add(key);
          obstacleNearMissKeys.delete(key);

          if (player.shieldMs > 0) {
            player.shieldMs = 0;
            const penalty = difficultyPreset.obstaclePenaltyFactor;
            player.speed *= clamp(0.88 - (penalty - 1) * 0.08 - (hazardScale - 1) * 0.06, 0.62, 0.9);
            player.boostMs = Math.max(0, player.boostMs - (320 + 90 * penalty) * hazardScale);
            const laneKick = (player.lane >= lanes[i] ? 1 : -1) * 0.12;
            player.lane = clamp(player.lane + laneKick, -1.6, 1.6);
            triggerObstacleImpact(lanes[i], false, laneKick);
            pushMessage('护盾爆掉，冲击减速');
            continue;
          }

          const penalty = difficultyPreset.obstaclePenaltyFactor;
          player.stunMs = Math.max(player.stunMs, (1180 + 200 * penalty) * hazardScale);
          player.speed = Math.min(
            player.speed * (currentWeather === 'rain' ? 0.24 : 0.3) / (penalty * hazardScale),
            92 - penalty * 7,
          );
          player.boostMs = 0;
          nitro = Math.max(0, nitro - (12 + penalty * 6) * hazardScale);
          raceTimeMs += (260 + penalty * 140) * hazardScale;
          const laneKick = (player.lane >= lanes[i] ? 1 : -1) * 0.24;
          player.lane = clamp(player.lane + laneKick, -1.6, 1.6);
          styleScore = Math.max(0, styleScore - (220 + penalty * 60) * hazardScale);
          triggerObstacleImpact(lanes[i], true, laneKick);
          breakCombo('撞上路障');
          pushMessage('重撞路障 -0.4s');
          continue;
        }

        if (
          laneDiff >= STATIC_OBSTACLE_NEAR_MISS_MIN &&
          laneDiff < STATIC_OBSTACLE_NEAR_MISS_MAX &&
          rel > -22 &&
          rel < 90 &&
          player.speed > 145 &&
          !obstacleNearMissKeys.has(key)
        ) {
          obstacleNearMissKeys.add(key);
          styleScore += 140;
          nitro = Math.min(100, nitro + 5);
          pushMessage('极限贴边 +140');
        }
      }
    }
  }

  function handleAiObstacleCollisions(ai: CarState): void {
    for (const zone of resolvedTrackZones) {
      if (zone.type !== 'obstacle') {
        continue;
      }
      const offsets = zone.obstacleOffsets ?? [0.5];
      const lanes = zone.obstacleLanes ?? [(zone.laneMin + zone.laneMax) * 0.5];
      const count = Math.min(offsets.length, lanes.length);
      for (let i = 0; i < count; i += 1) {
        const localDistance = zone.start + (zone.end - zone.start) * offsets[i];
        const obstacleDistance = toNearestWorldDistance(localDistance, ai.distance);
        const rel = obstacleDistance - ai.distance;
        if (rel < -56 || rel > 170) {
          continue;
        }

        const lapKey = Math.floor(obstacleDistance / TRACK_LENGTH);
        const key = `${ai.id}:${lapKey}:${zone.id}:${i}`;
        const laneDiff = ai.lane - lanes[i];
        const absLaneDiff = Math.abs(laneDiff);

        if (rel > 18 && rel < 180 && absLaneDiff < 0.34) {
          const steerAway =
            (laneDiff >= 0 ? 1 : -1) *
            (ai.aiProfile === 'aggressive' ? 0.011 : 0.013) *
            (ai.id === rivalId ? 1.12 : 1);
          ai.lane = clamp(ai.lane + steerAway, -1.2, 1.2);
        }

        if (Math.abs(rel) < 64 && absLaneDiff < 0.2) {
          if (aiObstacleHitKeys.has(key)) {
            continue;
          }
          aiObstacleHitKeys.add(key);
          if (ai.id === rivalId) {
            ai.speed *= 0.76;
            ai.stunMs = Math.max(ai.stunMs, 320);
          } else {
            ai.speed *= ai.aiProfile === 'aggressive' ? 0.64 : 0.58;
            ai.stunMs = Math.max(ai.stunMs, ai.aiProfile === 'aggressive' ? 520 : 660);
          }
        }
      }
    }
  }

  function handleDynamicObstacleCollisions(player: CarState, dtMs: number): void {
    const raceProgress = clamp(player.distance / (TRACK_LENGTH * cfg.laps), 0, 1);
    const hazardScale = 1 + Math.max(0, raceProgress - 0.34) * 0.86;
    const near = getDynamicObstaclesNearDistance(player.distance, 220);
    if (tuning.detectPlayerDynamicHazardsBatch && near.length > 0) {
      type DynamicObstacleMeta = { localDistance: number; lane: number; size: number; obstacleId: string };
      const packed: number[] = [];
      const metas: DynamicObstacleMeta[] = [];
      for (const { obstacle } of near) {
        const lane =
          dynamicObstacleLane(obstacle, raceTimeMs) *
          difficultyPreset.movingObstacleFactor *
          (1 + (hazardScale - 1) * 0.24);
        packed.push(obstacle.start, lane, obstacle.size);
        metas.push({
          localDistance: obstacle.start,
          lane,
          size: obstacle.size,
          obstacleId: obstacle.id,
        });
      }
      const states = tuning.detectPlayerDynamicHazardsBatch(
        player.distance,
        player.lane,
        player.speed,
        playerAirMs,
        Float32Array.from(packed),
        TRACK_LENGTH,
      );
      if (states.length === metas.length) {
        for (let idx = 0; idx < metas.length; idx += 1) {
          const state = Math.round(states[idx] ?? 0);
          if (state <= 0) {
            continue;
          }
          const meta = metas[idx];
          const worldDistance = toNearestWorldDistance(meta.localDistance, player.distance);
          const lapKey = Math.floor(worldDistance / TRACK_LENGTH);
          const key = `${lapKey}:${meta.obstacleId}`;
          if (state === 1) {
            if (dynamicObstacleHitKeys.has(key)) {
              continue;
            }
            dynamicObstacleHitKeys.add(key);
            const penalty = difficultyPreset.obstaclePenaltyFactor;
            player.speed *= clamp(0.62 - (penalty - 1) * 0.1 - (hazardScale - 1) * 0.12, 0.34, 0.72);
            player.stunMs = Math.max(player.stunMs, (760 + penalty * 220) * hazardScale);
            player.boostMs = Math.max(0, player.boostMs - (240 + penalty * 80) * hazardScale);
            const laneKick = (player.lane >= meta.lane ? 1 : -1) * (0.16 + meta.size * 0.035);
            player.lane = clamp(player.lane + laneKick, -1.6, 1.6);
            raceTimeMs += (140 + penalty * 120) * hazardScale;
            nitro = Math.max(0, nitro - (6 + penalty * 4) * hazardScale);
            triggerObstacleImpact(meta.lane, true, laneKick);
            breakCombo('撞到移动障碍');
            pushMessage('撞上动态障碍，车速大损');
          } else if (state === 2) {
            styleScore += dtMs * 0.12;
          }
        }
        return;
      }
    }

    for (const { obstacle, worldDistance } of near) {
      const rel = worldDistance - player.distance;
      if (rel < -50 || rel > 120) {
        continue;
      }
      const lapKey = Math.floor(worldDistance / TRACK_LENGTH);
      const key = `${lapKey}:${obstacle.id}`;
      const lane = dynamicObstacleLane(obstacle, raceTimeMs) * difficultyPreset.movingObstacleFactor * (1 + (hazardScale - 1) * 0.24);
      const laneDiff = Math.abs(player.lane - lane);
      const hitLaneThreshold = (DYNAMIC_OBSTACLE_HIT_LANE_BASE + obstacle.size * 0.02) * (1 + (hazardScale - 1) * 0.18);
      if (Math.abs(rel) < 64 && laneDiff < hitLaneThreshold) {
        if (dynamicObstacleHitKeys.has(key)) {
          continue;
        }
        dynamicObstacleHitKeys.add(key);
        const penalty = difficultyPreset.obstaclePenaltyFactor;
        player.speed *= clamp(0.62 - (penalty - 1) * 0.1 - (hazardScale - 1) * 0.12, 0.34, 0.72);
        player.stunMs = Math.max(player.stunMs, (760 + penalty * 220) * hazardScale);
        player.boostMs = Math.max(0, player.boostMs - (240 + penalty * 80) * hazardScale);
        const laneKick = (player.lane >= lane ? 1 : -1) * (0.16 + obstacle.size * 0.035);
        player.lane = clamp(player.lane + laneKick, -1.6, 1.6);
        raceTimeMs += (140 + penalty * 120) * hazardScale;
        nitro = Math.max(0, nitro - (6 + penalty * 4) * hazardScale);
        triggerObstacleImpact(lane, true, laneKick);
        breakCombo('撞到移动障碍');
        pushMessage('撞上动态障碍，车速大损');
      } else if (rel > -12 && rel < 84 && laneDiff < hitLaneThreshold + 0.1 && player.speed > 165) {
        styleScore += dtMs * 0.12;
      }
    }
  }

  function handleAiDynamicObstacleCollisions(ai: CarState): void {
    const near = getDynamicObstaclesNearDistance(ai.distance, 210);
    for (const { obstacle, worldDistance } of near) {
      const rel = worldDistance - ai.distance;
      if (rel < -40 || rel > 150) {
        continue;
      }
      const lane = dynamicObstacleLane(obstacle, raceTimeMs) * difficultyPreset.movingObstacleFactor;
      const laneDiff = ai.lane - lane;
      const absLaneDiff = Math.abs(laneDiff);
      const avoidRange = 0.3 + obstacle.size * 0.04;
      if (rel > 18 && rel < 165 && absLaneDiff < avoidRange) {
        const steerAway = (laneDiff >= 0 ? 1 : -1) * (0.006 + ai.aiRiskLevel * 0.008) * (ai.id === rivalId ? 1.14 : 1);
        ai.lane = clamp(ai.lane + steerAway, -1.2, 1.2);
      }
      if (Math.abs(rel) < 56 && absLaneDiff < 0.16 + obstacle.size * 0.03) {
        const lapKey = Math.floor(worldDistance / TRACK_LENGTH);
        const key = `${ai.id}:${lapKey}:${obstacle.id}`;
        if (aiDynamicObstacleHitKeys.has(key)) {
          continue;
        }
        aiDynamicObstacleHitKeys.add(key);
        if (ai.id === rivalId) {
          ai.speed *= 0.84;
          ai.stunMs = Math.max(ai.stunMs, 240);
        } else {
          ai.speed *= ai.aiProfile === 'aggressive' ? 0.74 : 0.67;
          ai.stunMs = Math.max(ai.stunMs, ai.aiProfile === 'aggressive' ? 380 : 540);
        }
      }
    }
  }

  function getDraftState(player: CarState): { active: boolean; intensity: number; targetName: string } {
    if (tuning.computePlayerRelationsBatch) {
      const aiInputs: number[] = [];
      const aiNames: string[] = [];
      for (let i = 1; i < cars.length; i += 1) {
        const ai = cars[i];
        if (ai.finished) {
          continue;
        }
        aiInputs.push(ai.distance, ai.lane, ai.speed);
        aiNames.push(ai.name);
      }
      if (aiNames.length === 0) {
        return { active: false, intensity: 0, targetName: '' };
      }
      const result = tuning.computePlayerRelationsBatch(
        player.distance,
        player.lane,
        player.speed,
        currentInput.steer,
        overtakeFxSide,
        Float32Array.from(aiInputs),
        TRACK_LENGTH,
      );
      if (result.length >= 4) {
        const intensity = clamp(Number(result[0] ?? 0), 0, 1.2);
        const targetIdx = Math.round(Number(result[1] ?? -1));
        const targetName = targetIdx >= 0 && targetIdx < aiNames.length ? aiNames[targetIdx] : '';
        return {
          active: intensity > 0.55,
          intensity,
          targetName,
        };
      }
    }

    let best: { dist: number; laneDiff: number; targetName: string } | null = null;

    for (let i = 1; i < cars.length; i += 1) {
      const ai = cars[i];
      if (ai.finished) {
        continue;
      }

      const dist = normalizeDistance(ai.distance - player.distance);
      if (dist < 42 || dist > 380) {
        continue;
      }

      const laneDiff = Math.abs(ai.lane - player.lane);
      if (laneDiff > 0.24) {
        continue;
      }

      if (!best || dist < best.dist) {
        best = {
          dist,
          laneDiff,
          targetName: ai.name,
        };
      }
    }

    if (!best || player.speed < 120) {
      return { active: false, intensity: 0, targetName: '' };
    }

    const distScore = 1 - clamp((best.dist - 42) / (380 - 42), 0, 1);
    const laneScore = 1 - clamp(best.laneDiff / 0.24, 0, 1);
    const intensity = clamp(0.45 + distScore * 0.38 + laneScore * 0.35, 0, 1.2);

    return {
      active: intensity > 0.55,
      intensity,
      targetName: best.targetName,
    };
  }

  function getOvertakeCameraState(player: CarState): OvertakeCameraState {
    if (tuning.computePlayerRelationsBatch) {
      const aiInputs: number[] = [];
      for (let i = 1; i < cars.length; i += 1) {
        const ai = cars[i];
        if (ai.finished) {
          continue;
        }
        aiInputs.push(ai.distance, ai.lane, ai.speed);
      }
      if (aiInputs.length > 0) {
        const result = tuning.computePlayerRelationsBatch(
          player.distance,
          player.lane,
          player.speed,
          currentInput.steer,
          overtakeFxSide,
          Float32Array.from(aiInputs),
          TRACK_LENGTH,
        );
        if (result.length >= 4) {
          return {
            intensity: clamp(Number(result[2] ?? 0), 0, 1),
            side: Number(result[3] ?? overtakeFxSide) >= 0 ? 1 : -1,
          };
        }
      }
    }

    let bestIntensity = 0;
    let bestSide: -1 | 1 = overtakeFxSide;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 1; i < cars.length; i += 1) {
      const ai = cars[i];
      if (ai.finished) {
        continue;
      }

      const rel = normalizeDistance(ai.distance - player.distance);
      if (rel <= 10 || rel > 260) {
        continue;
      }

      const laneDelta = ai.lane - player.lane;
      const laneGap = Math.abs(laneDelta);
      if (laneGap > 0.66) {
        continue;
      }

      const distFactor = 1 - clamp((rel - 10) / 250, 0, 1);
      const laneFactor = 1 - clamp(laneGap / 0.66, 0, 1);
      const closingFactor = clamp((player.speed - ai.speed + 50) / 210, 0, 1);
      const intensity = clamp(distFactor * 0.62 + laneFactor * 0.28 + closingFactor * 0.24, 0, 1);

      if (intensity > bestIntensity || (Math.abs(intensity - bestIntensity) < 0.02 && rel < bestDistance)) {
        bestIntensity = intensity;
        bestDistance = rel;
        if (laneDelta > 0.01) {
          bestSide = 1;
        } else if (laneDelta < -0.01) {
          bestSide = -1;
        } else {
          bestSide = currentInput.steer >= 0 ? 1 : -1;
        }
      }
    }

    return {
      intensity: bestIntensity,
      side: bestSide,
    };
  }

  function evaluateDrift(charge: number):
    | { grade: 'GOOD' | 'GREAT' | 'PERFECT'; comboGain: number; styleBase: number; nitroGain: number; boostMs: number }
    | null {
    if (charge < 26) {
      return null;
    }

    if (charge >= 74) {
      return {
        grade: 'PERFECT',
        comboGain: 2,
        styleBase: 420 + charge * 12,
        nitroGain: charge * 0.62,
        boostMs: 1480 + charge * 7,
      };
    }

    if (charge >= 52) {
      return {
        grade: 'GREAT',
        comboGain: 1,
        styleBase: 260 + charge * 9,
        nitroGain: charge * 0.54,
        boostMs: 1260 + charge * 6,
      };
    }

    return {
      grade: 'GOOD',
      comboGain: 1,
      styleBase: 150 + charge * 7,
      nitroGain: charge * 0.46,
      boostMs: 1020 + charge * 5,
    };
  }

  function breakCombo(reason: string): void {
    if (driftCombo >= 2) {
      pushMessage(`${reason}，连击中断`);
    }
    driftCombo = 0;
  }

  function triggerObstacleImpact(hitLane: number, heavy: boolean, laneKick: number): void {
    const playerLane = cars[0]?.lane ?? 0;
    const laneDelta = hitLane - playerLane;
    obstacleImpactSide = laneDelta >= 0 ? 1 : -1;
    obstacleImpactStrength = Math.max(
      obstacleImpactStrength,
      clamp((heavy ? 0.62 : 0.4) + Math.abs(laneKick) * 1.35, 0.32, 1),
    );
    obstacleImpactMs = Math.max(obstacleImpactMs, heavy ? OBSTACLE_IMPACT_HEAVY_MS : OBSTACLE_IMPACT_BASE_MS);
  }

  function updatePositionBonuses(): void {
    const player = cars[0];
    const ranking = [...cars].sort((a, b) => b.distance - a.distance);
    const position = ranking.findIndex((car) => car.id === player.id) + 1;

    if (position < lastPlayerPosition) {
      const gained = lastPlayerPosition - position;
      updateObjective('overtake', gained);
      if (overtakeChainMs <= 0) {
        overtakeChainCount = 0;
      }
      overtakeChainCount += gained;
      overtakeChainMs = 2600;

      const bonus = Math.round(130 * gained * (1 + Math.min(5, overtakeChainCount) * 0.2));
      styleScore += bonus;
      nitro = Math.min(100, nitro + gained * 4);
      overtakeBurstMs = Math.max(overtakeBurstMs, 320 + gained * 130);
      pushMessage(`连超 x${overtakeChainCount} +${bonus} 技巧分`);
    } else if (position > lastPlayerPosition) {
      const lost = position - lastPlayerPosition;
      overtakeChainCount = 0;
      overtakeChainMs = 0;
      const playerIndex = ranking.findIndex((car) => car.id === player.id);
      const passer = playerIndex > 0 ? ranking[playerIndex - 1] : null;
      if (passer) {
        const laneDelta = passer.lane - player.lane;
        if (laneDelta > 0.02) {
          overtakeLossSide = 1;
        } else if (laneDelta < -0.02) {
          overtakeLossSide = -1;
        } else {
          overtakeLossSide = currentInput.steer >= 0 ? 1 : -1;
        }
      }
      overtakeLossMs = Math.max(overtakeLossMs, 340 + lost * 150);
      styleScore = Math.max(0, styleScore - lost * 42);
      if (lost >= 1) {
        pushMessage('被超车，马上反击');
      }
    } else if (overtakeChainMs <= 0) {
      overtakeChainCount = 0;
    }

    lastPlayerPosition = position;
  }

  function updateTraps(dtMs: number): void {
    const playerDistance = cars[0].distance;
    traps = traps
      .map((trap) => ({ ...trap, ttlMs: trap.ttlMs - dtMs }))
      .filter((trap) => trap.ttlMs > 0 && playerDistance - trap.distance < 2600);
  }

  function handleCarInteractions(): void {
    const player = cars[0];
    const airborne = playerAirMs > 0;
    const raceProgress = clamp(player.distance / (TRACK_LENGTH * cfg.laps), 0, 1);
    const hazardScale = 1 + Math.max(0, raceProgress - 0.36) * 0.66;
    const carContactReady = playerCarContactCooldownMs <= 0;
    const trapContactReady = playerTrapContactCooldownMs <= 0;
    if (!airborne && tuning.detectPlayerInteractionsBatch) {
      const aiPacked: number[] = [];
      const aiRefs: CarState[] = [];
      for (let i = 1; i < cars.length; i += 1) {
        const ai = cars[i];
        aiPacked.push(ai.distance, ai.lane);
        aiRefs.push(ai);
      }

      const trapPacked: number[] = [];
      const trapRefs: Trap[] = [];
      for (const trap of traps) {
        trapPacked.push(trap.distance, trap.lane, trap.ownerId === player.id ? 0 : 1);
        trapRefs.push(trap);
      }

      const result = tuning.detectPlayerInteractionsBatch(
        player.distance,
        player.lane,
        Float32Array.from(aiPacked),
        Float32Array.from(trapPacked),
        TRACK_LENGTH,
      );
      if (result.length === 4) {
        let handled = false;
        const aiIdx = Math.round(result[0] ?? -1);
        const aiDist = Number(result[1] ?? 0);
        if (carContactReady && aiIdx >= 0 && aiIdx < aiRefs.length) {
          const ai = aiRefs[aiIdx];
          const impact = 0.86 - (difficultyPreset.playerRecoveryPenalty - 1) * 0.08;
          player.speed *= impact;
          ai.speed *= impact;
          player.speed = Math.max(player.speed, 36);
          ai.speed = Math.max(ai.speed, 48);
          if (aiDist > 0) {
            player.lane -= 0.035;
          } else {
            player.lane += 0.035;
          }
          if (player.speed > 260) {
            player.stunMs = Math.max(player.stunMs, 140 + (hazardScale - 1) * 120);
            nitro = Math.max(0, nitro - (4 + (hazardScale - 1) * 6));
          }
          breakCombo('碰撞失误');
          playerCarContactCooldownMs = 340;
          handled = true;
        }

        const trapIdx = Math.round(result[2] ?? -1);
        if (!handled && trapContactReady && trapIdx >= 0 && trapIdx < trapRefs.length) {
          const trap = trapRefs[trapIdx];
          if (player.shieldMs > 0) {
            player.shieldMs = 0;
          } else {
            player.stunMs = Math.max(player.stunMs, (760 + 160 * difficultyPreset.playerRecoveryPenalty) * hazardScale);
            player.speed *= clamp(0.52 - (difficultyPreset.playerRecoveryPenalty - 1) * 0.07 - (hazardScale - 1) * 0.08, 0.34, 0.58);
            player.speed = Math.max(player.speed, 32);
            breakCombo('踩陷阱');
            pushMessage('踩到香蕉了');
          }
          trap.ttlMs = 0;
          playerTrapContactCooldownMs = 380;
        }
        return;
      }
    }

    let handledCarContact = false;
    for (let i = 1; i < cars.length; i += 1) {
      if (!carContactReady) {
        break;
      }
      if (airborne) {
        break;
      }
      const ai = cars[i];
      const dist = normalizeDistance(ai.distance - player.distance);
      if (Math.abs(dist) < 64 && Math.abs(ai.lane - player.lane) < 0.18) {
        const impact = 0.86 - (difficultyPreset.playerRecoveryPenalty - 1) * 0.08;
        player.speed *= impact;
        ai.speed *= impact;
        player.speed = Math.max(player.speed, 36);
        ai.speed = Math.max(ai.speed, 48);
        if (dist > 0) {
          player.lane -= 0.035;
        } else {
          player.lane += 0.035;
        }
        if (player.speed > 260) {
          player.stunMs = Math.max(player.stunMs, 140 + (hazardScale - 1) * 120);
          nitro = Math.max(0, nitro - (4 + (hazardScale - 1) * 6));
        }
        breakCombo('碰撞失误');
        playerCarContactCooldownMs = 340;
        handledCarContact = true;
        break;
      }
    }

    if (handledCarContact || !trapContactReady) {
      return;
    }

    for (const trap of traps) {
      if (airborne) {
        break;
      }
      if (trap.ownerId === player.id) {
        continue;
      }
      const dist = normalizeDistance(player.distance - trap.distance);
      if (Math.abs(dist) < 54 && Math.abs(player.lane - trap.lane) < 0.2) {
        if (player.shieldMs > 0) {
          player.shieldMs = 0;
        } else {
          player.stunMs = Math.max(player.stunMs, (760 + 160 * difficultyPreset.playerRecoveryPenalty) * hazardScale);
          player.speed *= clamp(0.52 - (difficultyPreset.playerRecoveryPenalty - 1) * 0.07 - (hazardScale - 1) * 0.08, 0.34, 0.58);
          player.speed = Math.max(player.speed, 32);
          breakCombo('踩陷阱');
          pushMessage('踩到香蕉了');
        }
        trap.ttlMs = 0;
        playerTrapContactCooldownMs = 380;
        break;
      }
    }
  }

  function useItem(user: CarState, item: RacerItem, options: { trapLane?: number } = {}): void {
    if (item === 'boost') {
      user.boostMs = Math.max(user.boostMs, 2100);
      if (user.isPlayer) {
        pushMessage('使用氮气加速');
      }
      return;
    }

    if (item === 'shield') {
      user.shieldMs = Math.max(user.shieldMs, 5200);
      if (user.isPlayer) {
        pushMessage('护盾已开启');
      }
      return;
    }

    if (item === 'banana') {
      traps.push({
        distance: user.distance,
        lane: clamp(options.trapLane ?? user.lane, -1.2, 1.2),
        ownerId: user.id,
        ttlMs: 9000,
      });
      if (user.isPlayer) {
        pushMessage('放置香蕉');
      }
      return;
    }

    if (item === 'rocket') {
      const candidates = cars.filter((car) => car.id !== user.id);
      let target: { car: CarState; dist: number } | undefined;
      if (tuning.selectNearestAheadTargetIndex) {
        const idx = tuning.selectNearestAheadTargetIndex(
          user.distance,
          Float32Array.from(candidates.map((car) => car.distance)),
          820,
          TRACK_LENGTH,
        );
        if (idx >= 0 && idx < candidates.length) {
          const car = candidates[idx];
          target = {
            car,
            dist: normalizeDistance(car.distance - user.distance),
          };
        }
      } else {
        target = candidates
          .map((car) => ({ car, dist: normalizeDistance(car.distance - user.distance) }))
          .filter((pair) => pair.dist > 0 && pair.dist < 820)
          .sort((a, b) => a.dist - b.dist)[0];
      }

      if (!target) {
        if (user.isPlayer) {
          pushMessage('前方无目标');
        }
        return;
      }

      if (target.car.shieldMs > 0) {
        target.car.shieldMs = 0;
      } else {
        target.car.stunMs = Math.max(target.car.stunMs, 760);
        target.car.speed *= 0.52;
      }

      if (user.isPlayer) {
        pushMessage(`导弹命中 ${target.car.name}`);
      }
    }
  }

  function finishRace(): void {
    finished = true;
    const player = cars[0];

    const ranked = [...cars].sort((a, b) => b.distance - a.distance);
    const finishPosition = ranked.findIndex((car) => car.id === player.id) + 1;

    const totalScoreFromWasm = tuning.scoreRace?.(
      finishPosition,
      cars.length,
      Math.round(raceTimeMs),
      Math.round(nitro),
    );

    const positionScoreMap = [0, 6800, 5100, 3600, 2600, 1800, 1000, 600, 350];
    const positionScore = positionScoreMap[Math.min(positionScoreMap.length - 1, finishPosition)] ?? 300;
    const timeScore = Math.max(0, Math.round(8200 - raceTimeMs / 13));
    const nitroScore = Math.round(nitro * 12);
    const objectiveBonus = objectiveCompleted * 260;
    const styleBonus = Math.round(styleScore) + objectiveBonus;
    const comboBonus = Math.round(bestDriftCombo * 130);
    const wasmBase =
      typeof totalScoreFromWasm === 'number' && Number.isFinite(totalScoreFromWasm) && totalScoreFromWasm > 0
        ? Math.round(totalScoreFromWasm)
        : positionScore + timeScore + nitroScore;
    const totalScore = wasmBase + styleBonus + comboBonus;

    const result: RaceResult = {
      playerName,
      finishPosition,
      totalRacers: cars.length,
      totalTimeMs: Math.round(raceTimeMs),
      bestLapMs: Number.isFinite(bestLapMs) ? Math.round(bestLapMs) : Math.round(raceTimeMs),
      styleScore: Math.round(styleScore),
      bestCombo: bestDriftCombo,
      score: totalScore,
      runId,
    };

    const leaderboard: RunResult = {
      playerName,
      score: totalScore,
      stage: 3,
      durationSec: Math.floor(raceTimeMs / 1000),
      runId,
    };

    events.push({ type: 'race_finished', payload: { result, leaderboard } });
    pushMessage('比赛结束');
  }

  function flushHud(force: boolean): void {
    if (cars.length === 0) {
      return;
    }

    if (!force && events.some((e) => e.type === 'hud_update')) {
      return;
    }

    const player = cars[0];
    const ranking = [...cars].sort((a, b) => b.distance - a.distance);
    const position = ranking.findIndex((car) => car.id === player.id) + 1;
    const racers = ranking.map((car, index) => ({
      id: car.id,
      name: car.name,
      isPlayer: car.isPlayer,
      position: index + 1,
      progressPct: Math.round(clamp((car.distance / (TRACK_LENGTH * cfg.laps)) * 100, 0, 100)),
      lap: Math.min(cfg.laps, car.lap),
      finished: car.finished,
    }));

    const hud: HudState = {
      speed: Math.round(player.speed),
      lap: Math.min(cfg.laps, player.lap),
      totalLaps: cfg.laps,
      position,
      totalRacers: cars.length,
      progressPct: Math.round(clamp((player.distance / (TRACK_LENGTH * cfg.laps)) * 100, 0, 100)),
      nitroPct: Math.round(clamp(nitro, 0, 100)),
      weather: weatherLabel(currentWeather),
      heatPct: Math.round(clamp(nitroHeat, 0, 100)),
      jammed: empJammedMs > 0,
      objectiveText: lapObjective.label,
      objectiveProgress: objectiveProgressLabel(lapObjective),
      combo: driftCombo,
      styleScore: Math.round(styleScore),
      currentItem: player.item,
      raceTimeMs,
      countdownMs,
      racers,
    };

    events.push({ type: 'hud_update', payload: hud });
  }

  function render(renderCtx: CanvasRenderingContext2D, width: number, height: number): void {
    const player = cars[0];
    const baseDistance = player.distance;
    const mobileView = options.mobile;
    const speedNorm = clamp(player.speed / MAX_SPEED, 0, 1.25);
    const activeDrawDistance = Math.round(clamp(dynamicDrawDistance, minDrawDistance, drawDistance));
    const detailScale = clamp(activeDrawDistance / drawDistance, 0.72, 1);
    const playerSegment = getSegmentAtDistance(baseDistance);
    const isNearCamera = cameraMode === 'near';
    const curveCenterScale = mobileView ? 124 : 152;
    const lanePerspectiveScale = mobileView ? 178 : 220;
    const roadTopHalfRatio = mobileView ? ROAD_TOP_HALF_RATIO + 0.018 : ROAD_TOP_HALF_RATIO;
    const roadNearHalfRatio = mobileView ? ROAD_NEAR_HALF_RATIO + 0.022 : ROAD_NEAR_HALF_RATIO;
    const perspectiveDepthScale = mobileView ? 1.04 : 0.92;
    const laneCameraFollow = 0;
    const cameraLane = 0;
    const playerScreenLane = player.lane - cameraLane;
    const boostNorm = clamp(player.boostMs / 900, 0, 1);
    const draftNorm = clamp(draftingMs / 1200, 0, 1);
    const driftNorm = drifting ? 1 : 0;
    const rivalSurgeNorm = clamp(rivalSurgeMs / (RIVAL_SURGE_BASE_MS + 1200), 0, 1);
    const obstacleImpactNorm = clamp(
      (obstacleImpactMs / OBSTACLE_IMPACT_HEAVY_MS) * (0.6 + obstacleImpactStrength * 0.7),
      0,
      1.2,
    );
    const overtakeState = getOvertakeCameraState(player);
    overtakeFxIntensity = lerp(overtakeFxIntensity, overtakeState.intensity, 0.18);
    if (overtakeState.intensity > 0.18) {
      overtakeFxSide = overtakeState.side;
    }
    const overtakeBurstNorm = clamp(overtakeBurstMs / 420, 0, 1);
    const overtakeLossNorm = clamp(overtakeLossMs / 500, 0, 1);
    const overtakeFx = clamp(overtakeFxIntensity + overtakeBurstNorm * 0.58 - overtakeLossNorm * 0.1, 0, 1);
    const pulse = speedNorm * 0.7 + boostNorm * 0.55;
    const overtakeCompression = overtakeFx * (0.08 + speedNorm * 0.06 + boostNorm * 0.04);
    const lossPull = overtakeLossNorm * (0.05 + speedNorm * 0.05);
    const cameraMotionScale = (mobileView ? 1 : 0.74) * (0.84 + detailScale * 0.16);
    const cameraJitterXBase = Math.sin(raceTimeMs * (0.042 + speedNorm * 0.014)) * (2.5 + pulse * 4.4) * cameraMotionScale;
    const cameraJitterYBase = Math.cos(raceTimeMs * (0.034 + speedNorm * 0.013)) * (1.7 + pulse * 3.9) * cameraMotionScale;
    const overtakeJitterX = Math.sin(raceTimeMs * (0.11 + overtakeFx * 0.08)) * (1.2 + overtakeFx * 4.4) * overtakeFxSide;
    const overtakeJitterY = Math.cos(raceTimeMs * (0.09 + overtakeFx * 0.07)) * (0.8 + overtakeFx * 2.6);
    const lossJitterX = Math.sin(raceTimeMs * (0.084 + overtakeLossNorm * 0.06)) * (0.9 + overtakeLossNorm * 3.2) * -overtakeLossSide;
    const lossJitterY = Math.cos(raceTimeMs * (0.078 + overtakeLossNorm * 0.05)) * (0.5 + overtakeLossNorm * 1.8);
    const rivalSurgeJitterX = Math.sin(raceTimeMs * (0.092 + rivalSurgeNorm * 0.06)) * (0.5 + rivalSurgeNorm * 2.3) * rivalSurgeSide;
    const rivalSurgeJitterY = Math.cos(raceTimeMs * (0.066 + rivalSurgeNorm * 0.05)) * (0.3 + rivalSurgeNorm * 1.3);
    const impactJitterX =
      Math.sin(raceTimeMs * (0.19 + obstacleImpactNorm * 0.12)) *
      (1.1 + obstacleImpactNorm * 6.4) *
      obstacleImpactSide *
      obstacleImpactNorm;
    const impactJitterY =
      Math.cos(raceTimeMs * (0.15 + obstacleImpactNorm * 0.08)) *
      (0.8 + obstacleImpactNorm * 4.2) *
      obstacleImpactNorm;
    const cameraJitterX = cameraJitterXBase + overtakeJitterX + lossJitterX + rivalSurgeJitterX + impactJitterX;
    const cameraJitterY = cameraJitterYBase + overtakeJitterY + lossJitterY + rivalSurgeJitterY + impactJitterY;
    const cameraLean =
      driftDirection * driftNorm * (5 + speedNorm * 8) +
      overtakeFxSide * overtakeFx * (isNearCamera ? 2.6 : 1.4) +
      -overtakeLossSide * overtakeLossNorm * (isNearCamera ? 3.2 : 1.8) +
      rivalSurgeSide * rivalSurgeNorm * (isNearCamera ? 1.4 : 0.8) +
      obstacleImpactSide * obstacleImpactNorm * (isNearCamera ? 5.6 : 3.2);
    const cameraDistance =
      (isNearCamera ? 0.74 : 1.02) *
      (1 - overtakeCompression * (isNearCamera ? 0.48 : 0.32) + lossPull * (isNearCamera ? 0.9 : 0.62));
    const horizonBase = isNearCamera
      ? 0.006 - speedNorm * 0.024 - boostNorm * 0.008 - overtakeCompression * 0.026 + lossPull * 0.056
      : 0.072 - speedNorm * 0.018 - overtakeCompression * 0.015 + lossPull * 0.034;
    const mobileHorizonLift = mobileView ? -height * 0.055 : 0;
    const horizonY = clamp(
      height * horizonBase - playerSegment.hill * (isNearCamera ? 18 : 11) + mobileHorizonLift,
      -height * 0.08,
      height * 0.14,
    );
    const fovFactor =
      1 + speedNorm * (isNearCamera ? 0.58 : 0.34) + boostNorm * 0.16 + overtakeCompression * 0.34 - lossPull * 0.4;

    renderSky(renderCtx, width, height, baseDistance, speedNorm, boostNorm, draftNorm);

    let prevY = height;
    let prevHalfWidth = width * 0.5;
    let prevCenter = width * 0.5 + cameraJitterX + cameraLean;
    let curveAcc = 0;

    for (let i = activeDrawDistance; i >= 1; i -= 1) {
      const depth = i / activeDrawDistance;
      const worldDistance = baseDistance + i * SEGMENT_LENGTH;
      const segment = getSegmentAtDistance(worldDistance);
      const segmentIndex = Math.floor(worldDistance / SEGMENT_LENGTH);
      curveAcc += segment.curve;

      const perspective = 1 - depth;
      const hillShift = segment.hill * (0.14 + perspective * 1.45) * (isNearCamera ? 32 : 21);
      const y =
        horizonY + (perspective * perspective * height * perspectiveDepthScale) / (fovFactor * cameraDistance) + cameraJitterY + hillShift;
      const halfRatio = roadTopHalfRatio + (roadNearHalfRatio - roadTopHalfRatio) * perspective;
      const halfWidth =
        width *
        (halfRatio +
          (speedNorm * (isNearCamera ? 0.012 : 0.007) + overtakeCompression * 0.009 - lossPull * 0.007) * perspective);
      const waveYaw = Math.sin((worldDistance + raceTimeMs * 0.05) * 0.0019) * perspective * (0.35 + speedNorm * 0.7);
      const xCenter =
        width * 0.5 +
        curveAcc * curveCenterScale -
        cameraLane * perspective * lanePerspectiveScale +
        cameraJitterX * 0.34 +
        cameraLean * 0.52 +
        waveYaw;

      if (y < prevY) {
        const segmentScenes = getScenesAtDistance(worldDistance);
        const bridgeScene = getSceneByType(segmentScenes, 'bridge');
        const tunnelScene = getSceneByType(segmentScenes, 'tunnel');
        const cliffScene = getSceneByType(segmentScenes, 'cliff');
        const neonScene = getSceneByType(segmentScenes, 'neon_city');

        const vergeColor = bridgeScene
          ? '#0c2635'
          : tunnelScene
            ? '#13161b'
            : cliffScene
              ? '#1a2419'
              : neonScene
                ? '#062830'
                : '#0a3822';
        renderCtx.fillStyle = vergeColor;
        renderCtx.fillRect(0, y, width, prevY - y + 1);
        if (neonScene && perspective > 0.16) {
          const haze = renderCtx.createLinearGradient(0, y, 0, prevY);
          haze.addColorStop(0, 'rgba(96, 236, 255, 0.08)');
          haze.addColorStop(1, 'rgba(255, 122, 92, 0.06)');
          renderCtx.fillStyle = haze;
          renderCtx.fillRect(0, y, width, prevY - y + 1);
        }
        renderSceneLayer(
          renderCtx,
          width,
          segmentScenes,
          worldDistance,
          segmentIndex,
          y,
          prevY,
          xCenter,
          prevCenter,
          halfWidth,
          prevHalfWidth,
          perspective,
        );

        const roadTopColor = tunnelScene
          ? '#4d535c'
          : bridgeScene
            ? '#4e616f'
            : neonScene
              ? '#4f5664'
              : '#636977';
        const roadBottomColor = tunnelScene
          ? '#2f353e'
          : bridgeScene
            ? '#33424d'
            : neonScene
              ? '#333945'
              : '#3e434f';
        const roadGradient = renderCtx.createLinearGradient(0, y, 0, prevY);
        roadGradient.addColorStop(0, roadTopColor);
        roadGradient.addColorStop(1, roadBottomColor);
        renderCtx.fillStyle = roadGradient;
        renderCtx.beginPath();
        renderCtx.moveTo(xCenter - halfWidth, y);
        renderCtx.lineTo(xCenter + halfWidth, y);
        renderCtx.lineTo(prevCenter + prevHalfWidth, prevY);
        renderCtx.lineTo(prevCenter - prevHalfWidth, prevY);
        renderCtx.closePath();
        renderCtx.fill();

        if (perspective > 0.1) {
          const seamTopHalf = halfWidth * 0.13;
          const seamBottomHalf = prevHalfWidth * 0.13;
          renderCtx.fillStyle = tunnelScene ? 'rgba(22, 25, 30, 0.26)' : 'rgba(18, 22, 28, 0.16)';
          renderCtx.beginPath();
          renderCtx.moveTo(xCenter - seamTopHalf, y);
          renderCtx.lineTo(xCenter + seamTopHalf, y);
          renderCtx.lineTo(prevCenter + seamBottomHalf, prevY);
          renderCtx.lineTo(prevCenter - seamBottomHalf, prevY);
          renderCtx.closePath();
          renderCtx.fill();
        }

        const curbTop = halfWidth * 0.105;
        const curbBottom = prevHalfWidth * 0.105;
        const leftOuterTop = xCenter - halfWidth;
        const leftOuterBottom = prevCenter - prevHalfWidth;
        const rightOuterTop = xCenter + halfWidth;
        const rightOuterBottom = prevCenter + prevHalfWidth;
        const leftInnerTop = leftOuterTop + curbTop;
        const leftInnerBottom = leftOuterBottom + curbBottom;
        const rightInnerTop = rightOuterTop - curbTop;
        const rightInnerBottom = rightOuterBottom - curbBottom;
        const curbLight = segmentIndex % 2 === 0;
        const curbLightColor = tunnelScene ? 'rgba(205, 220, 233, 0.62)' : 'rgba(255, 232, 192, 0.74)';
        const curbDarkColor = tunnelScene ? 'rgba(70, 84, 99, 0.66)' : 'rgba(237, 102, 84, 0.68)';
        renderCtx.fillStyle = curbLight ? curbLightColor : curbDarkColor;
        renderCtx.beginPath();
        renderCtx.moveTo(leftOuterTop, y);
        renderCtx.lineTo(leftInnerTop, y);
        renderCtx.lineTo(leftInnerBottom, prevY);
        renderCtx.lineTo(leftOuterBottom, prevY);
        renderCtx.closePath();
        renderCtx.fill();
        renderCtx.beginPath();
        renderCtx.moveTo(rightInnerTop, y);
        renderCtx.lineTo(rightOuterTop, y);
        renderCtx.lineTo(rightOuterBottom, prevY);
        renderCtx.lineTo(rightInnerBottom, prevY);
        renderCtx.closePath();
        renderCtx.fill();

        const segmentZones = getZonesAtDistance(worldDistance);
        for (const zone of segmentZones) {
          const laneMin = clamp(zone.laneMin, -1.1, 1.1);
          const laneMax = clamp(zone.laneMax, -1.1, 1.1);
          const leftTop = xCenter + laneToRoadOffset(laneMin, halfWidth);
          const rightTop = xCenter + laneToRoadOffset(laneMax, halfWidth);
          const leftBottom = prevCenter + laneToRoadOffset(laneMin, prevHalfWidth);
          const rightBottom = prevCenter + laneToRoadOffset(laneMax, prevHalfWidth);

          if (zone.type === 'boost_pad') {
            renderCtx.fillStyle = 'rgba(73, 214, 255, 0.34)';
            renderCtx.beginPath();
            renderCtx.moveTo(leftTop, y);
            renderCtx.lineTo(rightTop, y);
            renderCtx.lineTo(rightBottom, prevY);
            renderCtx.lineTo(leftBottom, prevY);
            renderCtx.closePath();
            renderCtx.fill();

            renderCtx.strokeStyle = 'rgba(155, 240, 255, 0.68)';
            renderCtx.lineWidth = Math.max(1, perspective * 2.4);
            renderCtx.beginPath();
            renderCtx.moveTo((leftTop + rightTop) * 0.5, y);
            renderCtx.lineTo((leftBottom + rightBottom) * 0.5, prevY);
            renderCtx.stroke();
            continue;
          }

          if (zone.type === 'mud') {
            renderCtx.fillStyle = 'rgba(102, 63, 34, 0.44)';
            renderCtx.beginPath();
            renderCtx.moveTo(leftTop, y);
            renderCtx.lineTo(rightTop, y);
            renderCtx.lineTo(rightBottom, prevY);
            renderCtx.lineTo(leftBottom, prevY);
            renderCtx.closePath();
            renderCtx.fill();
            continue;
          }

          if (zone.type === 'shortcut') {
            renderCtx.fillStyle = 'rgba(242, 172, 82, 0.34)';
            renderCtx.beginPath();
            renderCtx.moveTo(leftTop, y);
            renderCtx.lineTo(rightTop, y);
            renderCtx.lineTo(rightBottom, prevY);
            renderCtx.lineTo(leftBottom, prevY);
            renderCtx.closePath();
            renderCtx.fill();

            const centerTop = (leftTop + rightTop) * 0.5;
            const centerBottom = (leftBottom + rightBottom) * 0.5;
            const halfSpanTop = (rightTop - leftTop) * 0.16;
            const halfSpanBottom = (rightBottom - leftBottom) * 0.08;
            renderCtx.strokeStyle = 'rgba(255, 238, 182, 0.95)';
            renderCtx.lineWidth = Math.max(1, perspective * 2.2);
            renderCtx.beginPath();
            renderCtx.moveTo(centerTop - halfSpanTop, y + (prevY - y) * 0.22);
            renderCtx.lineTo(centerBottom - halfSpanBottom, prevY - (prevY - y) * 0.12);
            renderCtx.lineTo(centerBottom + halfSpanBottom, prevY - (prevY - y) * 0.12);
            renderCtx.lineTo(centerTop + halfSpanTop, y + (prevY - y) * 0.22);
            renderCtx.stroke();
            continue;
          }

          if (zone.type === 'obstacle') {
            renderCtx.fillStyle = 'rgba(188, 70, 34, 0.36)';
            renderCtx.beginPath();
            renderCtx.moveTo(leftTop, y);
            renderCtx.lineTo(rightTop, y);
            renderCtx.lineTo(rightBottom, prevY);
            renderCtx.lineTo(leftBottom, prevY);
            renderCtx.closePath();
            renderCtx.fill();

            renderCtx.strokeStyle = 'rgba(255, 220, 178, 0.9)';
            renderCtx.lineWidth = Math.max(1, perspective * 2.2);
            const stripeCount = 3;
            for (let s = 0; s < stripeCount; s += 1) {
              const t = (s + 0.5) / stripeCount;
              const topX = lerp(leftTop, rightTop, t);
              const bottomX = lerp(leftBottom, rightBottom, t);
              renderCtx.beginPath();
              renderCtx.moveTo(topX - (rightTop - leftTop) * 0.08, y + (prevY - y) * 0.2);
              renderCtx.lineTo(bottomX + (rightBottom - leftBottom) * 0.08, prevY - (prevY - y) * 0.1);
              renderCtx.stroke();
            }
            continue;
          }

          renderCtx.fillStyle = 'rgba(248, 191, 96, 0.42)';
          renderCtx.beginPath();
          renderCtx.moveTo(leftTop, y);
          renderCtx.lineTo(rightTop, y);
          renderCtx.lineTo(rightBottom, prevY);
          renderCtx.lineTo(leftBottom, prevY);
          renderCtx.closePath();
          renderCtx.fill();

          const centerTop = (leftTop + rightTop) * 0.5;
          const centerBottom = (leftBottom + rightBottom) * 0.5;
          renderCtx.strokeStyle = 'rgba(255, 230, 176, 0.86)';
          renderCtx.lineWidth = Math.max(1, perspective * 2.1);
          renderCtx.beginPath();
          renderCtx.moveTo(centerTop - (rightTop - leftTop) * 0.16, y + (prevY - y) * 0.2);
          renderCtx.lineTo(centerBottom, prevY - (prevY - y) * 0.18);
          renderCtx.lineTo(centerTop + (rightTop - leftTop) * 0.16, y + (prevY - y) * 0.2);
          renderCtx.stroke();
        }

        const edgeLine = tunnelScene ? 'rgba(188, 212, 232, 0.88)' : bridgeScene ? 'rgba(155, 223, 248, 0.82)' : 'rgba(255, 152, 126, 0.82)';
        renderCtx.strokeStyle = edgeLine;
        renderCtx.lineWidth = Math.max(1.1, perspective * 3.5);
        renderCtx.beginPath();
        renderCtx.moveTo(xCenter - halfWidth, y);
        renderCtx.lineTo(prevCenter - prevHalfWidth, prevY);
        renderCtx.moveTo(xCenter + halfWidth, y);
        renderCtx.lineTo(prevCenter + prevHalfWidth, prevY);
        renderCtx.stroke();

        const laneDashEnabled = mobileView ? segmentIndex % 2 === 0 : true;
        if (laneDashEnabled && perspective > 0.08) {
          const laneColor = tunnelScene
            ? mobileView
              ? 'rgba(232, 238, 246, 0.86)'
              : 'rgba(246, 250, 255, 0.94)'
            : mobileView
              ? 'rgba(255, 237, 184, 0.8)'
              : 'rgba(255, 242, 196, 0.9)';
          const centerTopHalf = Math.max(1, halfWidth * 0.018);
          const centerBottomHalf = Math.max(1, prevHalfWidth * 0.018);
          renderCtx.fillStyle = laneColor;
          renderCtx.beginPath();
          renderCtx.moveTo(xCenter - centerTopHalf, y);
          renderCtx.lineTo(xCenter + centerTopHalf, y);
          renderCtx.lineTo(prevCenter + centerBottomHalf, prevY);
          renderCtx.lineTo(prevCenter - centerBottomHalf, prevY);
          renderCtx.closePath();
          renderCtx.fill();

          const guideOffsets = [-0.34, 0.34];
          for (const laneOffset of guideOffsets) {
            const topX = xCenter + laneToRoadOffset(laneOffset, halfWidth);
            const bottomX = prevCenter + laneToRoadOffset(laneOffset, prevHalfWidth);
            const dashWTop = Math.max(0.8, halfWidth * 0.012);
            const dashWBottom = Math.max(0.8, prevHalfWidth * 0.012);
            renderCtx.fillStyle = mobileView ? 'rgba(232, 240, 250, 0.62)' : 'rgba(236, 246, 255, 0.78)';
            renderCtx.beginPath();
            renderCtx.moveTo(topX - dashWTop, y);
            renderCtx.lineTo(topX + dashWTop, y);
            renderCtx.lineTo(bottomX + dashWBottom, prevY);
            renderCtx.lineTo(bottomX - dashWBottom, prevY);
            renderCtx.closePath();
            renderCtx.fill();
          }
        }

        if (segmentIndex % 7 === 0 && perspective > 0.14 && perspective < 0.8) {
          const t = 0.58;
          const markerY = lerp(y, prevY, t);
          const markerH = Math.max(2, perspective * 16);
          const markerW = Math.max(1, perspective * 3.4);
          const leftMarkerX = lerp(xCenter - halfWidth * 0.82, prevCenter - prevHalfWidth * 0.82, t);
          const rightMarkerX = lerp(xCenter + halfWidth * 0.82, prevCenter + prevHalfWidth * 0.82, t);

          renderCtx.fillStyle = 'rgba(226, 242, 255, 0.9)';
          renderCtx.fillRect(leftMarkerX - markerW * 0.5, markerY - markerH, markerW, markerH);
          renderCtx.fillRect(rightMarkerX - markerW * 0.5, markerY - markerH, markerW, markerH);

          renderCtx.fillStyle = 'rgba(255, 188, 96, 0.86)';
          renderCtx.fillRect(leftMarkerX - markerW, markerY - markerH - markerW, markerW * 2, markerW);
          renderCtx.fillRect(rightMarkerX - markerW, markerY - markerH - markerW, markerW * 2, markerW);
        }
      }

      prevY = y;
      prevHalfWidth = halfWidth;
      prevCenter = xCenter;
    }

    renderRoadsidePosts(renderCtx, width, height, player, speedNorm, cameraLane, detailScale);
    renderTraps(renderCtx, width, height, player.distance, cameraLane);
    renderTrackObstacles(renderCtx, width, height, player.distance, cameraLane);
    renderNarrowChokeGuides(renderCtx, width, height, player.distance, cameraLane);
    renderDynamicObstacles(renderCtx, width, height, player.distance, cameraLane);
    renderCars(renderCtx, width, height, cameraLane);
    renderSpeedLines(
      renderCtx,
      width,
      height,
      player,
      speedNorm,
      draftNorm,
      overtakeBurstNorm,
      overtakeFxSide,
      overtakeLossNorm,
      overtakeLossSide,
      playerScreenLane,
      detailScale,
    );
    renderPlayer(renderCtx, width, height, player, speedNorm, playerScreenLane);
    renderSpeedVignette(renderCtx, width, height, speedNorm, clamp(player.boostMs / 850, 0, 1));
    renderSceneAtmosphere(renderCtx, width, height, baseDistance, speedNorm);
    renderWeatherEffects(renderCtx, width, height, speedNorm, currentWeather);
    const edgeDistortionIntensity = clamp(overtakeFx + rivalSurgeNorm * 0.42 + obstacleImpactNorm * 0.65, 0, 1.2);
    const edgeDistortionSide =
      obstacleImpactNorm > 0.16 ? obstacleImpactSide : overtakeFx > 0.12 ? overtakeFxSide : rivalSurgeSide;
    renderEdgeDistortion(renderCtx, width, height, edgeDistortionIntensity, edgeDistortionSide, speedNorm, boostNorm);
    renderOvertakeFlash(renderCtx, width, height, overtakeBurstNorm, overtakeFxSide);
    renderOvertakeLossShock(renderCtx, width, height, overtakeLossNorm, overtakeLossSide);
    renderRivalSurgePulse(renderCtx, width, height, rivalSurgeNorm, rivalSurgeSide);
    renderObstacleImpactShock(renderCtx, width, height, obstacleImpactNorm, obstacleImpactSide);

    if (countdownMs > 0) {
      const countdownText = countdownMs > 2200 ? '3' : countdownMs > 1400 ? '2' : countdownMs > 600 ? '1' : 'GO';
      renderCtx.fillStyle = 'rgba(255,255,255,0.88)';
      renderCtx.font = '700 72px system-ui';
      renderCtx.textAlign = 'center';
      renderCtx.fillText(countdownText, width * 0.5, height * 0.42);
    }
  }

  function renderSky(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    baseDistance: number,
    speedNorm: number,
    boostNorm: number,
    draftNorm: number,
  ): void {
    const grad = renderCtx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#05162a');
    grad.addColorStop(0.46, '#0b334e');
    grad.addColorStop(1, '#143928');
    renderCtx.fillStyle = grad;
    renderCtx.fillRect(0, 0, width, height);

    const horizonGlow = renderCtx.createRadialGradient(
      width * (0.46 + Math.sin(baseDistance * 0.00012) * 0.05),
      height * 0.26,
      width * 0.04,
      width * 0.5,
      height * 0.35,
      width * 0.56,
    );
    horizonGlow.addColorStop(0, `rgba(255, 206, 148, ${0.22 + boostNorm * 0.18})`);
    horizonGlow.addColorStop(1, 'rgba(255, 206, 148, 0)');
    renderCtx.fillStyle = horizonGlow;
    renderCtx.fillRect(0, 0, width, height * 0.62);

    const cloudCount = 14;
    for (let i = 0; i < cloudCount; i += 1) {
      const depth = 0.32 + (i % 5) * 0.13;
      const drift = raceTimeMs * (0.003 + depth * 0.002 + speedNorm * 0.0014);
      const x = ((baseDistance * (0.006 + i * 0.0008) + drift * 100 + i * 173) % (width + 320)) - 160;
      const y = height * (0.05 + (i % 6) * 0.045) + Math.sin((raceTimeMs + i * 97) * 0.0014) * 6;
      const w = (84 + (i % 4) * 54) * (1 + depth * 0.28);
      const h = 18 + (i % 3) * 10;
      renderCtx.fillStyle = `rgba(190, 228, 255, ${0.028 + depth * 0.03 + draftNorm * 0.04})`;
      renderCtx.beginPath();
      renderCtx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
      renderCtx.fill();
    }

    const speedBand = renderCtx.createLinearGradient(0, height * 0.18, 0, height * 0.64);
    speedBand.addColorStop(0, 'rgba(124, 224, 255, 0)');
    speedBand.addColorStop(0.5, `rgba(124, 224, 255, ${0.028 + speedNorm * 0.03})`);
    speedBand.addColorStop(1, `rgba(255, 134, 96, ${0.022 + boostNorm * 0.02})`);
    renderCtx.fillStyle = speedBand;
    renderCtx.fillRect(0, 0, width, height);
  }

  function renderSceneLayer(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    scenes: SceneZone[],
    worldDistance: number,
    segmentIndex: number,
    y: number,
    prevY: number,
    xCenter: number,
    prevCenter: number,
    halfWidth: number,
    prevHalfWidth: number,
    perspective: number,
  ): void {
    if (scenes.length === 0) {
      return;
    }

    const cliff = getSceneByType(scenes, 'cliff');
    const bridge = getSceneByType(scenes, 'bridge');
    const neon = getSceneByType(scenes, 'neon_city');
    const tunnel = getSceneByType(scenes, 'tunnel');

    if (cliff) {
      const side = cliff.side ?? 1;
      const roadTop = xCenter + side * halfWidth;
      const roadBottom = prevCenter + side * prevHalfWidth;
      const outerTop = roadTop + side * halfWidth * (0.64 + cliff.intensity * 0.28);
      const outerBottom = roadBottom + side * prevHalfWidth * (0.66 + cliff.intensity * 0.24);

      const cliffShade = renderCtx.createLinearGradient(0, y, 0, prevY);
      cliffShade.addColorStop(0, 'rgba(38, 54, 44, 0.8)');
      cliffShade.addColorStop(1, 'rgba(18, 26, 22, 0.9)');
      renderCtx.fillStyle = cliffShade;
      renderCtx.beginPath();
      renderCtx.moveTo(roadTop, y);
      renderCtx.lineTo(outerTop, y);
      renderCtx.lineTo(side > 0 ? width : 0, y);
      renderCtx.lineTo(side > 0 ? width : 0, prevY);
      renderCtx.lineTo(outerBottom, prevY);
      renderCtx.lineTo(roadBottom, prevY);
      renderCtx.closePath();
      renderCtx.fill();

      if (segmentIndex % 11 === 0 && perspective > 0.24) {
        const fogWisp = side > 0 ? outerTop + halfWidth * 0.2 : outerTop - halfWidth * 0.2;
        renderCtx.fillStyle = 'rgba(210, 236, 224, 0.16)';
        renderCtx.beginPath();
        renderCtx.ellipse(fogWisp, y + (prevY - y) * 0.38, halfWidth * 0.24, Math.max(4, (prevY - y) * 0.3), 0, 0, Math.PI * 2);
        renderCtx.fill();
      }

      if (segmentIndex % 9 === 0 && perspective > 0.18) {
        const postTop = xCenter + side * halfWidth * 1.03;
        const postBottom = prevCenter + side * prevHalfWidth * 1.03;
        renderCtx.strokeStyle = 'rgba(248, 214, 150, 0.72)';
        renderCtx.lineWidth = Math.max(1, perspective * 2.8);
        renderCtx.beginPath();
        renderCtx.moveTo(postTop, y + (prevY - y) * 0.2);
        renderCtx.lineTo(postBottom, prevY - (prevY - y) * 0.1);
        renderCtx.stroke();
      }
    }

    if (bridge) {
      for (const side of [-1, 1]) {
        const railTop = xCenter + side * halfWidth * 1.11;
        const railBottom = prevCenter + side * prevHalfWidth * 1.11;
        const beamTop = xCenter + side * halfWidth * 1.25;
        const beamBottom = prevCenter + side * prevHalfWidth * 1.25;

        renderCtx.strokeStyle = 'rgba(150, 214, 232, 0.68)';
        renderCtx.lineWidth = Math.max(1, perspective * 2.6);
        renderCtx.beginPath();
        renderCtx.moveTo(railTop, y);
        renderCtx.lineTo(railBottom, prevY);
        renderCtx.stroke();

        renderCtx.strokeStyle = 'rgba(88, 162, 188, 0.45)';
        renderCtx.lineWidth = Math.max(1, perspective * 2.1);
        renderCtx.beginPath();
        renderCtx.moveTo(beamTop, y);
        renderCtx.lineTo(beamBottom, prevY);
        renderCtx.stroke();
      }

      if (segmentIndex % 6 === 0 && perspective > 0.2) {
        const left = xCenter - halfWidth * 1.1;
        const right = xCenter + halfWidth * 1.1;
        renderCtx.strokeStyle = 'rgba(188, 236, 255, 0.34)';
        renderCtx.lineWidth = Math.max(1, perspective * 1.8);
        renderCtx.beginPath();
        renderCtx.moveTo(left, y + (prevY - y) * 0.4);
        renderCtx.lineTo(right, y + (prevY - y) * 0.4);
        renderCtx.stroke();
      }
    }

    if (neon && perspective > 0.15) {
      for (const side of [-1, 1]) {
        const glowTop = xCenter + side * halfWidth * 1.45;
        const glowBottom = prevCenter + side * prevHalfWidth * 1.45;
        renderCtx.strokeStyle = side < 0 ? 'rgba(110, 236, 255, 0.44)' : 'rgba(255, 126, 92, 0.44)';
        renderCtx.lineWidth = Math.max(1, perspective * 2.4);
        renderCtx.beginPath();
        renderCtx.moveTo(glowTop, y);
        renderCtx.lineTo(glowBottom, prevY);
        renderCtx.stroke();
      }
    }

    if (tunnel) {
      const tunnelBlend = sceneBlendAtDistance(tunnel, worldDistance);
      if (tunnelBlend <= 0) {
        return;
      }
      const leftRoadTop = xCenter - halfWidth;
      const rightRoadTop = xCenter + halfWidth;
      const leftRoadBottom = prevCenter - prevHalfWidth;
      const rightRoadBottom = prevCenter + prevHalfWidth;
      const outerScale = 1.5 + tunnel.intensity * 0.14;
      const leftOuterTop = xCenter - halfWidth * outerScale;
      const rightOuterTop = xCenter + halfWidth * outerScale;
      const leftOuterBottom = prevCenter - prevHalfWidth * (outerScale * 0.98);
      const rightOuterBottom = prevCenter + prevHalfWidth * (outerScale * 0.98);
      const roofLiftTop = clamp((prevY - y) * 1.15 + perspective * 24, 9, 58) * (0.84 + tunnelBlend * 0.18);
      const roofLiftBottom = clamp((prevY - y) * 0.9 + perspective * 14, 6, 42) * (0.84 + tunnelBlend * 0.16);
      const archTopY = y - roofLiftTop;
      const archBottomY = prevY - roofLiftBottom;
      const concreteAlpha = 0.74 + tunnelBlend * 0.16;

      renderCtx.fillStyle = `rgba(98, 102, 110, ${concreteAlpha})`;
      renderCtx.beginPath();
      renderCtx.moveTo(leftRoadTop, y);
      renderCtx.lineTo(leftOuterTop, y);
      renderCtx.lineTo(leftOuterBottom, prevY);
      renderCtx.lineTo(leftRoadBottom, prevY);
      renderCtx.closePath();
      renderCtx.fill();

      renderCtx.fillStyle = `rgba(105, 110, 118, ${concreteAlpha})`;
      renderCtx.beginPath();
      renderCtx.moveTo(rightRoadTop, y);
      renderCtx.lineTo(rightOuterTop, y);
      renderCtx.lineTo(rightOuterBottom, prevY);
      renderCtx.lineTo(rightRoadBottom, prevY);
      renderCtx.closePath();
      renderCtx.fill();

      renderCtx.fillStyle = `rgba(118, 124, 132, ${0.64 + tunnelBlend * 0.12})`;
      renderCtx.beginPath();
      renderCtx.moveTo(leftOuterTop, y);
      renderCtx.quadraticCurveTo(xCenter, archTopY, rightOuterTop, y);
      renderCtx.lineTo(rightOuterBottom, prevY);
      renderCtx.quadraticCurveTo(prevCenter, archBottomY, leftOuterBottom, prevY);
      renderCtx.closePath();
      renderCtx.fill();

      if (segmentIndex % 3 === 0 && perspective > 0.14) {
        const ringGlow = 0.32 + tunnelBlend * 0.38;
        renderCtx.strokeStyle = `rgba(202, 232, 255, ${ringGlow})`;
        renderCtx.lineWidth = Math.max(1, perspective * 2.9);
        renderCtx.beginPath();
        renderCtx.moveTo(leftOuterTop, y);
        renderCtx.quadraticCurveTo(xCenter, archTopY, rightOuterTop, y);
        renderCtx.lineTo(rightOuterBottom, prevY);
        renderCtx.quadraticCurveTo(prevCenter, archBottomY, leftOuterBottom, prevY);
        renderCtx.closePath();
        renderCtx.stroke();
      }

      if (tunnelBlend < 0.45 && perspective > 0.22) {
        const portalAlpha = (1 - tunnelBlend / 0.45) * 0.85;
        const frameDepthTop = halfWidth * 0.16;
        const frameDepthBottom = prevHalfWidth * 0.16;
        const leftInnerTop = leftRoadTop - frameDepthTop;
        const rightInnerTop = rightRoadTop + frameDepthTop;
        const leftInnerBottom = leftRoadBottom - frameDepthBottom;
        const rightInnerBottom = rightRoadBottom + frameDepthBottom;
        const innerArchTopY = y - roofLiftTop * 0.82;
        const innerArchBottomY = prevY - roofLiftBottom * 0.84;

        renderCtx.fillStyle = `rgba(136, 140, 148, ${portalAlpha * 0.72})`;
        renderCtx.beginPath();
        renderCtx.moveTo(leftOuterTop, y);
        renderCtx.quadraticCurveTo(xCenter, archTopY, rightOuterTop, y);
        renderCtx.lineTo(rightOuterBottom, prevY);
        renderCtx.quadraticCurveTo(prevCenter, archBottomY, leftOuterBottom, prevY);
        renderCtx.moveTo(leftInnerTop, y);
        renderCtx.quadraticCurveTo(xCenter, innerArchTopY, rightInnerTop, y);
        renderCtx.lineTo(rightInnerBottom, prevY);
        renderCtx.quadraticCurveTo(prevCenter, innerArchBottomY, leftInnerBottom, prevY);
        renderCtx.closePath();
        renderCtx.fill('evenodd');

        renderCtx.strokeStyle = `rgba(236, 240, 246, ${portalAlpha})`;
        renderCtx.lineWidth = Math.max(1.2, perspective * 4.2);
        renderCtx.beginPath();
        renderCtx.moveTo(leftOuterTop, y);
        renderCtx.quadraticCurveTo(xCenter, archTopY, rightOuterTop, y);
        renderCtx.lineTo(rightOuterBottom, prevY);
        renderCtx.quadraticCurveTo(prevCenter, archBottomY, leftOuterBottom, prevY);
        renderCtx.closePath();
        renderCtx.stroke();

        const chevronRows = 4;
        for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
          const side = sideIndex === 0 ? -1 : 1;
          for (let i = 0; i < chevronRows; i += 1) {
            const t = (i + 0.4) / chevronRows;
            const wallTop = side < 0 ? lerp(leftInnerTop, leftOuterTop, t) : lerp(rightInnerTop, rightOuterTop, t);
            const wallBottom = side < 0 ? lerp(leftInnerBottom, leftOuterBottom, t) : lerp(rightInnerBottom, rightOuterBottom, t);
            const stripeTopY = y + (prevY - y) * 0.08;
            const stripeBottomY = prevY - (prevY - y) * 0.08;
            const stripeShift = side * (rightOuterTop - leftOuterTop) * 0.018;
            renderCtx.strokeStyle = i % 2 === 0 ? `rgba(250, 208, 96, ${portalAlpha * 0.95})` : `rgba(42, 44, 50, ${portalAlpha * 0.95})`;
            renderCtx.lineWidth = Math.max(1, perspective * 2.7);
            renderCtx.beginPath();
            renderCtx.moveTo(wallTop, stripeTopY);
            renderCtx.lineTo(wallBottom + stripeShift, stripeBottomY);
            renderCtx.stroke();
          }
        }
      }

      if (segmentIndex % 6 === 0 && perspective > 0.18) {
        const leftSeamTop = leftOuterTop + (leftRoadTop - leftOuterTop) * 0.38;
        const rightSeamTop = rightOuterTop + (rightRoadTop - rightOuterTop) * 0.38;
        const leftSeamBottom = leftOuterBottom + (leftRoadBottom - leftOuterBottom) * 0.38;
        const rightSeamBottom = rightOuterBottom + (rightRoadBottom - rightOuterBottom) * 0.38;
        renderCtx.strokeStyle = `rgba(78, 83, 92, ${0.36 + tunnelBlend * 0.24})`;
        renderCtx.lineWidth = Math.max(1, perspective * 1.8);
        renderCtx.beginPath();
        renderCtx.moveTo(leftSeamTop, y + (prevY - y) * 0.16);
        renderCtx.lineTo(leftSeamBottom, prevY - (prevY - y) * 0.1);
        renderCtx.moveTo(rightSeamTop, y + (prevY - y) * 0.16);
        renderCtx.lineTo(rightSeamBottom, prevY - (prevY - y) * 0.1);
        renderCtx.stroke();
      }

      if (segmentIndex % 3 === 0 && perspective > 0.16) {
        const centerTop = xCenter;
        const centerBottom = prevCenter;
        const lampYTop = y - roofLiftTop * 0.52;
        const lampYBottom = prevY - roofLiftBottom * 0.56;
        const lampWTop = Math.max(1.6, perspective * 10 * tunnelBlend);
        const lampWBottom = Math.max(1.2, perspective * 6 * tunnelBlend);

        renderCtx.fillStyle = `rgba(255, 236, 174, ${0.66 + tunnelBlend * 0.2})`;
        renderCtx.beginPath();
        renderCtx.moveTo(centerTop - lampWTop, lampYTop);
        renderCtx.lineTo(centerTop + lampWTop, lampYTop);
        renderCtx.lineTo(centerBottom + lampWBottom, lampYBottom);
        renderCtx.lineTo(centerBottom - lampWBottom, lampYBottom);
        renderCtx.closePath();
        renderCtx.fill();

        const reflTopY = y + (prevY - y) * 0.22;
        const reflBottomY = prevY - (prevY - y) * 0.1;
        const reflWTop = halfWidth * 0.1;
        const reflWBottom = prevHalfWidth * 0.07;
        renderCtx.fillStyle = `rgba(236, 226, 182, ${0.1 + tunnelBlend * 0.1})`;
        renderCtx.beginPath();
        renderCtx.moveTo(centerTop - reflWTop, reflTopY);
        renderCtx.lineTo(centerTop + reflWTop, reflTopY);
        renderCtx.lineTo(centerBottom + reflWBottom, reflBottomY);
        renderCtx.lineTo(centerBottom - reflWBottom, reflBottomY);
        renderCtx.closePath();
        renderCtx.fill();
      }

      if (segmentIndex % 5 === 0 && perspective > 0.22) {
        const lampLaneTopY = y + (prevY - y) * 0.78;
        const lampLaneBottomY = prevY - (prevY - y) * 0.06;
        const leftLampX = lerp(leftRoadTop, leftOuterTop, 0.16);
        const rightLampX = lerp(rightRoadTop, rightOuterTop, 0.16);
        const lampSize = Math.max(1.2, perspective * 4.2);
        renderCtx.fillStyle = `rgba(126, 224, 255, ${0.36 + tunnelBlend * 0.26})`;
        renderCtx.fillRect(leftLampX - lampSize * 0.5, lampLaneTopY, lampSize, lampLaneBottomY - lampLaneTopY);
        renderCtx.fillRect(rightLampX - lampSize * 0.5, lampLaneTopY, lampSize, lampLaneBottomY - lampLaneTopY);
      }
    }
  }

  function renderSceneAtmosphere(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    baseDistance: number,
    speedNorm: number,
  ): void {
    let tunnelBlend = 0;
    let tunnelIntensity = 1;
    let neonBlend = 0;
    let neonIntensity = 1;
    let cliffBlend = 0;
    let cliffSide: -1 | 1 = 1;
    let bridgeBlend = 0;
    for (const scene of sceneZones) {
      const blend = sceneBlendAtDistance(scene, baseDistance);
      if (blend <= 0) {
        continue;
      }
      if (scene.type === 'tunnel' && blend > tunnelBlend) {
        tunnelBlend = blend;
        tunnelIntensity = scene.intensity;
      } else if (scene.type === 'neon_city' && blend > neonBlend) {
        neonBlend = blend;
        neonIntensity = scene.intensity;
      } else if (scene.type === 'cliff' && blend > cliffBlend) {
        cliffBlend = blend;
        cliffSide = scene.side ?? 1;
      } else if (scene.type === 'bridge' && blend > bridgeBlend) {
        bridgeBlend = blend;
      }
    }

    if (tunnelBlend > 0) {
      const shade = (0.04 + tunnelIntensity * 0.05 + speedNorm * 0.02) * tunnelBlend;
      renderCtx.fillStyle = `rgba(14, 16, 20, ${shade})`;
      renderCtx.fillRect(0, 0, width, height);

      const beam = renderCtx.createRadialGradient(
        width * 0.5,
        height * 0.78,
        width * 0.08,
        width * 0.5,
        height * 0.78,
        width * 0.66,
      );
      beam.addColorStop(0, 'rgba(0,0,0,0)');
      beam.addColorStop(1, `rgba(20, 24, 30, ${(0.09 + tunnelIntensity * 0.06) * tunnelBlend})`);
      renderCtx.fillStyle = beam;
      renderCtx.fillRect(0, 0, width, height);

      const sideVignette = renderCtx.createLinearGradient(0, 0, width, 0);
      sideVignette.addColorStop(0, `rgba(12, 14, 18, ${(0.16 + tunnelIntensity * 0.05) * tunnelBlend})`);
      sideVignette.addColorStop(0.22, 'rgba(12, 14, 18, 0)');
      sideVignette.addColorStop(0.78, 'rgba(12, 14, 18, 0)');
      sideVignette.addColorStop(1, `rgba(12, 14, 18, ${(0.16 + tunnelIntensity * 0.05) * tunnelBlend})`);
      renderCtx.fillStyle = sideVignette;
      renderCtx.fillRect(0, 0, width, height);

      if (tunnelBlend < 0.45) {
        const portalGlow = (1 - tunnelBlend / 0.45) * (0.14 + tunnelIntensity * 0.06);
        const glowGrad = renderCtx.createRadialGradient(
          width * 0.5,
          height * 0.24,
          width * 0.08,
          width * 0.5,
          height * 0.24,
          width * 0.62,
        );
        glowGrad.addColorStop(0, `rgba(255, 248, 226, ${portalGlow})`);
        glowGrad.addColorStop(1, 'rgba(255, 248, 226, 0)');
        renderCtx.fillStyle = glowGrad;
        renderCtx.fillRect(0, 0, width, height * 0.62);
      }
    }

    if (neonBlend > 0) {
      const glow = renderCtx.createLinearGradient(0, height * 0.18, 0, height * 0.55);
      glow.addColorStop(0, 'rgba(98, 235, 255, 0.0)');
      glow.addColorStop(0.5, `rgba(98, 235, 255, ${(0.028 + neonIntensity * 0.024) * neonBlend})`);
      glow.addColorStop(1, `rgba(255, 126, 92, ${(0.012 + neonIntensity * 0.014) * neonBlend})`);
      renderCtx.fillStyle = glow;
      renderCtx.fillRect(0, 0, width, height);
    }

    if (cliffBlend > 0) {
      const cliffMist = renderCtx.createLinearGradient(0, height * 0.16, 0, height * 0.82);
      cliffMist.addColorStop(0, 'rgba(190, 220, 210, 0)');
      cliffMist.addColorStop(1, `rgba(190, 220, 210, ${0.08 * cliffBlend})`);
      renderCtx.fillStyle = cliffMist;
      renderCtx.fillRect(0, 0, width, height);

      const sideFog = renderCtx.createLinearGradient(0, 0, width, 0);
      if (cliffSide > 0) {
        sideFog.addColorStop(0, 'rgba(0, 0, 0, 0)');
        sideFog.addColorStop(0.62, 'rgba(0, 0, 0, 0)');
        sideFog.addColorStop(1, `rgba(204, 228, 218, ${0.11 * cliffBlend})`);
      } else {
        sideFog.addColorStop(0, `rgba(204, 228, 218, ${0.11 * cliffBlend})`);
        sideFog.addColorStop(0.38, 'rgba(0, 0, 0, 0)');
        sideFog.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }
      renderCtx.fillStyle = sideFog;
      renderCtx.fillRect(0, 0, width, height);
    }

    if (bridgeBlend > 0) {
      const underGlow = renderCtx.createLinearGradient(0, height * 0.64, 0, height);
      underGlow.addColorStop(0, 'rgba(132, 212, 242, 0)');
      underGlow.addColorStop(1, `rgba(132, 212, 242, ${0.08 * bridgeBlend})`);
      renderCtx.fillStyle = underGlow;
      renderCtx.fillRect(0, 0, width, height);
    }
  }

  function renderCars(renderCtx: CanvasRenderingContext2D, width: number, height: number, cameraLane: number): void {
    const player = cars[0];
    const mobileView = options.mobile;
    if (countdownMs > 0) {
      const lineupY = height * (mobileView ? 0.8 : 0.82);
      const lineupSpread = mobileView ? 168 : 320;
      for (let i = 1; i < cars.length; i += 1) {
        const ai = cars[i];
        const laneDeltaRaw = ai.lane - cameraLane;
        const laneSign = laneDeltaRaw === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(laneDeltaRaw);
        // Expand spacing near center so countdown grid does not look crowded.
        const displayLane = laneSign * (0.24 + Math.abs(laneDeltaRaw) * 0.92);
        const x = width * 0.5 + displayLane * lineupSpread;
        const y = lineupY - Math.abs(displayLane) * (mobileView ? 8 : 14);
        const tilt = clamp(displayLane * 0.12, -0.1, 0.1);
        const lineupScale = mobileView ? 0.94 : 1.56;
        drawCarSprite(
          renderCtx,
          x,
          y,
          lineupScale,
          ai.shieldMs > 0 ? '#53d7ff' : '#f48a48',
          '#ffd08d',
          tilt,
          0,
          ai.shieldMs > 0,
        );
      }
      return;
    }

    const renderDistance = mobileView ? 3400 : 2800;
    const farMarkerDistance = mobileView ? 12_800 : 9_800;
    const farRenderLimit = mobileView ? 5 : 6;
    const laneSpreadBase = mobileView ? 246 : 290;
    const laneSpreadDepth = mobileView ? 92 : 120;
    const carYBase = mobileView ? 0.24 : 0.24;
    const carYSpan = mobileView ? 0.56 : 0.58;
    const visibleAi = cars
      .slice(1)
      .map((ai) => {
        const rawRel = normalizeDistance(ai.distance - player.distance);
        return { ai, rawRel, laneDelta: ai.lane - cameraLane };
      })
      .filter((entry) => entry.rawRel >= -8)
      .sort((a, b) => a.rawRel - b.rawRel);
    let farRendered = 0;

    for (const entry of visibleAi) {
      const { ai, rawRel, laneDelta } = entry;
      const rel = Math.min(rawRel, farMarkerDistance);

      if (rel > renderDistance) {
        if (farRendered >= farRenderLimit) {
          continue;
        }
        farRendered += 1;

        const farDepth = clamp(1 - rel / farMarkerDistance, 0.04, 0.22);
        const markerY = height * (mobileView ? 0.2 : 0.19) + farDepth * height * 0.4;
        const markerX = width * 0.5 + laneDelta * (mobileView ? 58 : 72) * (0.72 + farDepth * 2.5);
        const markerSize = clamp((mobileView ? 5.2 : 7.0) + farDepth * (mobileView ? 1.8 : 2.6), mobileView ? 5.4 : 7.2, mobileView ? 6.4 : 9.2);
        const markerColor = ai.finished ? '#63f0a8' : '#ff965f';

        renderCtx.fillStyle = 'rgba(8, 16, 26, 0.62)';
        renderCtx.beginPath();
        renderCtx.ellipse(markerX, markerY + markerSize * 1.22, markerSize * 0.88, markerSize * 0.42, 0, 0, Math.PI * 2);
        renderCtx.fill();

        renderCtx.fillStyle = markerColor;
        renderCtx.beginPath();
        renderCtx.moveTo(markerX, markerY - markerSize * 1.04);
        renderCtx.lineTo(markerX + markerSize * 0.66, markerY + markerSize * 0.44);
        renderCtx.lineTo(markerX - markerSize * 0.66, markerY + markerSize * 0.44);
        renderCtx.closePath();
        renderCtx.fill();

        renderCtx.strokeStyle = 'rgba(255, 245, 218, 0.94)';
        renderCtx.lineWidth = Math.max(1, markerSize * 0.16);
        renderCtx.stroke();

        renderCtx.fillStyle = ai.finished ? 'rgba(188, 255, 216, 0.95)' : 'rgba(255, 236, 174, 0.95)';
        renderCtx.fillRect(markerX - markerSize * 0.14, markerY - markerSize * 0.6, markerSize * 0.28, markerSize * 0.32);
        continue;
      }

      const depth = clamp(1 - rel / renderDistance, 0.04, 1);
      const y = height * carYBase + depth * depth * height * carYSpan;
      const x = width * 0.5 + laneDelta * depth * (laneSpreadBase + depth * laneSpreadDepth);
      const scale = mobileView ? clamp(0.44 + depth * 0.56, 0.44, 1.0) : clamp(0.64 + depth * 1.42, 0.64, 1.96);
      const tilt = clamp(laneDelta * 0.36, -0.22, 0.22);
      drawCarSprite(
        renderCtx,
        x,
        y + 3,
        scale,
        ai.shieldMs > 0 ? '#53d7ff' : '#f48a48',
        '#ffd08d',
        tilt,
        clamp(ai.boostMs / 1700, 0, 1),
        ai.shieldMs > 0,
      );

      if (depth > 0.42) {
        renderCtx.fillStyle = 'rgba(10, 20, 32, 0.72)';
        renderCtx.beginPath();
        appendRoundRectPath(renderCtx, x - 24, y - 30, 48, 14, 6);
        renderCtx.fill();
        renderCtx.fillStyle = 'rgba(233, 243, 255, 0.9)';
        renderCtx.font = '600 10px "Chakra Petch", sans-serif';
        renderCtx.textAlign = 'center';
        renderCtx.fillText(ai.name, x, y - 19);
      }
    }
  }

  function drawCarSprite(
    renderCtx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    bodyColor: string,
    accentColor: string,
    tilt: number,
    boostNorm: number,
    shielded: boolean,
  ): void {
    const w = 30 * scale;
    const h = 52 * scale;

    renderCtx.save();
    renderCtx.translate(x, y);
    renderCtx.rotate(tilt);

    renderCtx.fillStyle = `rgba(0, 0, 0, ${0.20 + scale * 0.08})`;
    renderCtx.beginPath();
    renderCtx.ellipse(0, h * 0.27, w * 0.68, h * 0.22, 0, 0, Math.PI * 2);
    renderCtx.fill();

    if (boostNorm > 0.03) {
      const flameLen = h * (0.34 + boostNorm * 0.9);
      renderCtx.strokeStyle = `rgba(255, 220, 130, ${0.24 + boostNorm * 0.46})`;
      renderCtx.lineWidth = Math.max(1, w * 0.12);
      renderCtx.beginPath();
      renderCtx.moveTo(-w * 0.18, h * 0.28);
      renderCtx.lineTo(-w * 0.18, h * 0.28 + flameLen);
      renderCtx.moveTo(w * 0.18, h * 0.28);
      renderCtx.lineTo(w * 0.18, h * 0.28 + flameLen);
      renderCtx.stroke();
    }

    renderCtx.fillStyle = '#131a23';
    renderCtx.beginPath();
    appendRoundRectPath(renderCtx, -w * 0.54, -h * 0.28, w * 0.18, h * 0.44, w * 0.05);
    appendRoundRectPath(renderCtx, w * 0.36, -h * 0.28, w * 0.18, h * 0.44, w * 0.05);
    renderCtx.fill();

    renderCtx.fillStyle = accentColor;
    renderCtx.beginPath();
    appendRoundRectPath(renderCtx, -w * 0.5, -h * 0.52, w, h * 0.09, w * 0.05);
    renderCtx.fill();

    renderCtx.fillStyle = bodyColor;
    renderCtx.beginPath();
    appendRoundRectPath(renderCtx, -w * 0.44, -h * 0.48, w * 0.88, h * 0.92, w * 0.16);
    renderCtx.fill();

    renderCtx.fillStyle = 'rgba(18, 34, 51, 0.92)';
    renderCtx.beginPath();
    appendRoundRectPath(renderCtx, -w * 0.26, -h * 0.21, w * 0.52, h * 0.34, w * 0.11);
    renderCtx.fill();

    renderCtx.fillStyle = 'rgba(168, 221, 255, 0.55)';
    renderCtx.beginPath();
    appendRoundRectPath(renderCtx, -w * 0.18, -h * 0.18, w * 0.36, h * 0.12, w * 0.08);
    renderCtx.fill();

    renderCtx.fillStyle = '#ffe083';
    renderCtx.fillRect(-w * 0.06, -h * 0.35, w * 0.12, h * 0.55);

    renderCtx.fillStyle = '#ff5864';
    renderCtx.fillRect(-w * 0.28, h * 0.18, w * 0.17, h * 0.06);
    renderCtx.fillRect(w * 0.11, h * 0.18, w * 0.17, h * 0.06);

    if (shielded) {
      const glow = 0.25 + Math.sin(raceTimeMs * 0.02) * 0.08;
      renderCtx.strokeStyle = `rgba(100, 226, 255, ${glow})`;
      renderCtx.lineWidth = Math.max(1.5, w * 0.07);
      renderCtx.beginPath();
      renderCtx.ellipse(0, -h * 0.02, w * 0.66, h * 0.58, 0, 0, Math.PI * 2);
      renderCtx.stroke();
    }

    renderCtx.restore();
  }

  function renderPlayer(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: CarState,
    speedNorm: number,
    playerScreenLane: number,
  ): void {
    const mobileView = options.mobile;
    const inCountdown = countdownMs > 0;
    const boostNorm = clamp(player.boostMs / 900, 0, 1);
    const draftNorm = clamp(draftingMs / 1200, 0, 1);
    const airNorm = clamp(playerAirMs / 720, 0, 1);
    const airArc = 1 - Math.abs(airNorm * 2 - 1);
    const jumpLift = airArc * (26 + speedNorm * 18);
    const x = width * 0.5 + playerScreenLane * (mobileView ? 88 : 132);
    const yBase = inCountdown ? (mobileView ? 0.79 : 0.81) : mobileView ? 0.8 : 0.82;
    const y = height * (yBase + Math.sin(raceTimeMs * 0.03) * speedNorm * 0.0035 - boostNorm * 0.006) - jumpLift;
    const tilt = currentInput.steer * 0.26 + driftDirection * (drifting ? 0.08 : 0);

    if (jumpLift > 1) {
      renderCtx.fillStyle = `rgba(0, 0, 0, ${0.2 - airNorm * 0.08})`;
      renderCtx.beginPath();
      renderCtx.ellipse(x, y + 28 + jumpLift * 0.8, 32, 11, 0, 0, Math.PI * 2);
      renderCtx.fill();
    }

    if (draftNorm > 0.1) {
      const aura = renderCtx.createRadialGradient(x, y - 8, 12, x, y + 6, 54 + draftNorm * 20);
      aura.addColorStop(0, 'rgba(0, 0, 0, 0)');
      aura.addColorStop(1, `rgba(98, 234, 255, ${0.1 + draftNorm * 0.2})`);
      renderCtx.fillStyle = aura;
      renderCtx.fillRect(x - 120, y - 92, 240, 170);
    }

    const playerScale = inCountdown ? (mobileView ? 0.98 : 1.72) : mobileView ? 1.08 : 2.05;
    drawCarSprite(
      renderCtx,
      x,
      y,
      playerScale,
      player.shieldMs > 0 ? '#4be7ff' : '#ff5f64',
      '#ffd166',
      tilt,
      boostNorm,
      player.shieldMs > 0,
    );
  }

  function renderRoadsidePosts(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: CarState,
    speedNorm: number,
    cameraLane: number,
    detailScale: number,
  ): void {
    const renderDistance = 2600;
    const postSpacing = options.mobile ? ROADSIDE_POST_SPACING : Math.round(130 + (1 - detailScale) * 52);
    const start = Math.floor(player.distance / postSpacing) * postSpacing;

    for (let world = start; world < player.distance + renderDistance; world += postSpacing) {
      const rel = world - player.distance;
      if (rel <= 25) {
        continue;
      }

      const depth = 1 - rel / renderDistance;
      if (depth < 0.22 + (1 - detailScale) * 0.06 || depth > 0.76) {
        continue;
      }
      const sceneList = getScenesAtDistance(world);
      if (getSceneByType(sceneList, 'tunnel')) {
        continue;
      }
      const cliffScene = getSceneByType(sceneList, 'cliff');
      const bridgeScene = getSceneByType(sceneList, 'bridge');
      const y = height * 0.28 + depth * depth * height * 0.66;
      const baseX = width * 0.5 + getSegmentAtDistance(world).curve * 920;
      const postHeight = 8 + depth * 32 + speedNorm;
      const postWidth = 2 + depth * 4.8;

      for (const side of [-1, 1]) {
        if (cliffScene && side === (cliffScene.side ?? 1)) {
          continue;
        }
        const x = baseX + (side * 1.42 - cameraLane) * depth * (300 + depth * 220);
        renderCtx.fillStyle = bridgeScene ? '#d6e9f8' : '#e8f2ff';
        renderCtx.fillRect(x - postWidth * 0.5, y - postHeight, postWidth, postHeight);
        renderCtx.fillStyle = bridgeScene ? '#8fd6ff' : '#f3be68';
        renderCtx.fillRect(x - postWidth * 1.2, y - postHeight - postWidth * 1.3, postWidth * 2.4, postWidth * 1.3);
      }
    }
  }

  function renderSpeedLines(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: CarState,
    speedNorm: number,
    draftNorm: number,
    overtakeBurstNorm: number,
    overtakeSide: -1 | 1,
    overtakeLossNorm: number,
    overtakeLossSide: -1 | 1,
    playerScreenLane: number,
    detailScale: number,
  ): void {
    const boostNorm = clamp(player.boostMs / 850, 0, 1);
    if (speedNorm < 0.06) {
      return;
    }

    const burstNorm = clamp(overtakeBurstNorm, 0, 1);
    const lossNorm = clamp(overtakeLossNorm, 0, 1);
    const lineBase = options.mobile ? 16 : 22;
    const lines = Math.round((lineBase + speedNorm * 20 + boostNorm * 16 + burstNorm * 12) * detailScale);
    const contraction = burstNorm * (0.34 + boostNorm * 0.26);
    for (let i = 0; i < lines; i += 1) {
      const phase = (player.distance * (1.02 + i * 0.045) + i * 87) % (height * 0.95);
      const y = phase;
      if (y < height * 0.28 || y > height * 0.97) {
        continue;
      }

      const side = i % 2 === 0 ? -1 : 1;
      const laneOffset = side * (68 + i * 12);
      const contractedOffset = laneOffset * (1 - contraction);
      const sideBias = side === overtakeSide ? 1 + burstNorm * 0.16 : 1 - burstNorm * 0.08;
      const steerOffset = options.mobile ? currentInput.steer * 30 : currentInput.steer * 12;
      const x = width * 0.5 + contractedOffset * sideBias + playerScreenLane * 36 + steerOffset;
      const len = 12 + speedNorm * 34 + boostNorm * 22 + burstNorm * 24;
      const alphaBoost = options.mobile ? 1 : 1.28;
      renderCtx.strokeStyle = `rgba(190, 230, 255, ${(0.11 + speedNorm * 0.19 + boostNorm * 0.08 + burstNorm * 0.13) * alphaBoost})`;
      renderCtx.lineWidth = (options.mobile ? 1 : 1.15) + speedNorm * 2.5 + burstNorm * 1.5;
      renderCtx.beginPath();
      renderCtx.moveTo(x, y);
      renderCtx.lineTo(x + side * (8 + boostNorm * 5), y + len);
      renderCtx.stroke();
    }

    if (draftNorm > 0.08) {
      renderCtx.strokeStyle = `rgba(108, 240, 255, ${0.14 + draftNorm * 0.22})`;
      renderCtx.lineWidth = 1.2 + draftNorm * 2.2;
      for (let i = 0; i < 8; i += 1) {
        const t = i / 8;
        const y = height * (0.34 + t * 0.5);
        const span = 16 + t * 130;
        renderCtx.beginPath();
        renderCtx.moveTo(width * 0.5 - span, y);
        renderCtx.lineTo(width * 0.5 - span * 0.2, y + 16 + t * 16);
        renderCtx.moveTo(width * 0.5 + span, y);
        renderCtx.lineTo(width * 0.5 + span * 0.2, y + 16 + t * 16);
        renderCtx.stroke();
      }
    }

    if (burstNorm > 0.08) {
      renderCtx.strokeStyle = `rgba(220, 246, 255, ${0.12 + burstNorm * 0.26})`;
      renderCtx.lineWidth = 1 + burstNorm * 2.4;
      const convergingLines = 10;
      for (let i = 0; i < convergingLines; i += 1) {
        const t = i / Math.max(1, convergingLines - 1);
        const yTop = height * (0.3 + t * 0.46);
        const yBottom = yTop + 26 + burstNorm * 40;
        const spread = width * (0.37 - t * 0.18) * (1 - burstNorm * 0.22);
        const fromX = width * 0.5 + (i % 2 === 0 ? -1 : 1) * spread;
        const toX = width * 0.5 + (i % 2 === 0 ? -1 : 1) * spread * (0.28 - burstNorm * 0.1);
        renderCtx.beginPath();
        renderCtx.moveTo(fromX, yTop);
        renderCtx.lineTo(toX, yBottom);
        renderCtx.stroke();
      }
    }

    if (lossNorm > 0.08) {
      renderCtx.strokeStyle = `rgba(166, 206, 255, ${0.06 + lossNorm * 0.16})`;
      renderCtx.lineWidth = 1 + lossNorm * 1.8;
      const retreatLines = 8;
      for (let i = 0; i < retreatLines; i += 1) {
        const t = i / Math.max(1, retreatLines - 1);
        const yTop = height * (0.36 + t * 0.42);
        const yBottom = yTop + 20 + lossNorm * 28;
        const spread = width * (0.22 + t * 0.2);
        const side = i % 2 === 0 ? -1 : 1;
        const sideBias = side === overtakeLossSide ? 1.08 : 0.94;
        const fromX = width * 0.5 + side * spread * sideBias;
        const toX = fromX + side * (10 + lossNorm * 28);
        renderCtx.beginPath();
        renderCtx.moveTo(fromX, yTop);
        renderCtx.lineTo(toX, yBottom);
        renderCtx.stroke();
      }
    }
  }

  function renderWeatherEffects(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    speedNorm: number,
    weather: WeatherMode,
  ): void {
    if (weather === 'clear') {
      return;
    }

    if (weather === 'fog') {
      const fog = renderCtx.createLinearGradient(0, height * 0.18, 0, height);
      fog.addColorStop(0, 'rgba(178, 202, 218, 0.04)');
      fog.addColorStop(0.58, 'rgba(186, 206, 220, 0.10)');
      fog.addColorStop(1, 'rgba(170, 193, 208, 0.22)');
      renderCtx.fillStyle = fog;
      renderCtx.fillRect(0, 0, width, height);

      renderCtx.fillStyle = `rgba(222, 236, 246, ${0.05 + speedNorm * 0.05})`;
      renderCtx.fillRect(0, height * 0.2, width, height * 0.16);
      return;
    }

    const rainAlphaScale = options.mobile ? 0.72 : 1;
    const quality = clamp(dynamicDrawDistance / drawDistance, 0.68, 1);
    const drops = Math.round((options.mobile ? 28 : 34) + speedNorm * (options.mobile ? 22 : 28) * quality);
    renderCtx.strokeStyle = `rgba(184, 224, 246, ${(0.16 + speedNorm * 0.12) * rainAlphaScale})`;
    renderCtx.lineWidth = 1 + speedNorm * 1.4;
    for (let i = 0; i < drops; i += 1) {
      const seed = i * 37;
      const x = ((raceTimeMs * (0.18 + speedNorm * 0.22) + seed * 13.4) % (width + 220)) - 110;
      const y = ((raceTimeMs * (0.46 + speedNorm * 0.44) + seed * 19.1) % (height + 180)) - 90;
      const len = 10 + speedNorm * 20;
      renderCtx.beginPath();
      renderCtx.moveTo(x, y);
      renderCtx.lineTo(x - 8, y + len);
      renderCtx.stroke();
    }

    renderCtx.fillStyle = `rgba(40, 64, 86, ${0.09 * rainAlphaScale})`;
    renderCtx.fillRect(0, 0, width, height);

    if (empJammedMs > 0) {
      const jamNorm = clamp(empJammedMs / 1200, 0, 1);
      renderCtx.strokeStyle = `rgba(114, 212, 255, ${0.12 + jamNorm * 0.24})`;
      renderCtx.lineWidth = 1.4;
      for (let i = 0; i < 10; i += 1) {
        const y = ((raceTimeMs * 0.44 + i * 66) % (height + 40)) - 20;
        renderCtx.beginPath();
        renderCtx.moveTo(0, y);
        renderCtx.lineTo(width, y + 7);
        renderCtx.stroke();
      }
      renderCtx.fillStyle = `rgba(124, 214, 255, ${0.05 + jamNorm * 0.08})`;
      renderCtx.fillRect(0, 0, width, height);
    }
  }

  function renderSpeedVignette(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    speedNorm: number,
    boostNorm: number,
  ): void {
    if (speedNorm < 0.45) {
      return;
    }

    const alpha = Math.min(0.3, 0.07 + speedNorm * 0.17 + boostNorm * 0.08);
    const grad = renderCtx.createRadialGradient(
      width * 0.5,
      height * 0.74,
      width * 0.26,
      width * 0.5,
      height * 0.74,
      width * 0.72,
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(8, 19, 32, ${alpha})`);
    renderCtx.fillStyle = grad;
    renderCtx.fillRect(0, 0, width, height);
  }

  function renderEdgeDistortion(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    intensity: number,
    side: -1 | 1,
    speedNorm: number,
    boostNorm: number,
  ): void {
    if (intensity < 0.06) {
      return;
    }

    const edgeWidth = width * (0.12 + intensity * 0.1);
    const leftBoost = side < 0 ? 1.25 : 0.88;
    const rightBoost = side > 0 ? 1.25 : 0.88;

    const leftEdge = renderCtx.createLinearGradient(0, 0, edgeWidth, 0);
    leftEdge.addColorStop(0, `rgba(112, 224, 255, ${(0.09 + intensity * 0.16) * leftBoost})`);
    leftEdge.addColorStop(1, 'rgba(112, 224, 255, 0)');
    renderCtx.fillStyle = leftEdge;
    renderCtx.fillRect(0, 0, edgeWidth, height);

    const rightEdge = renderCtx.createLinearGradient(width - edgeWidth, 0, width, 0);
    rightEdge.addColorStop(0, 'rgba(255, 138, 98, 0)');
    rightEdge.addColorStop(1, `rgba(255, 138, 98, ${(0.08 + intensity * 0.15) * rightBoost})`);
    renderCtx.fillStyle = rightEdge;
    renderCtx.fillRect(width - edgeWidth, 0, edgeWidth, height);

    const centerBand = renderCtx.createRadialGradient(
      width * 0.5,
      height * 0.72,
      width * 0.12,
      width * 0.5,
      height * 0.72,
      width * 0.62,
    );
    centerBand.addColorStop(0, 'rgba(0,0,0,0)');
    centerBand.addColorStop(1, `rgba(8, 20, 36, ${0.06 + intensity * 0.11 + boostNorm * 0.06})`);
    renderCtx.fillStyle = centerBand;
    renderCtx.fillRect(0, 0, width, height);

    renderCtx.save();
    renderCtx.globalCompositeOperation = 'screen';
    const streakCount = 14;
    for (let i = 0; i < streakCount; i += 1) {
      const y = ((raceTimeMs * (0.62 + speedNorm * 0.5 + intensity * 0.35) + i * 86) % (height + 140)) - 70;
      const nearEdge = i % 2 === 0 ? 1 : -1;
      const x = width * 0.5 + nearEdge * (width * (0.35 + intensity * 0.12));
      const x2 = x + nearEdge * (12 + intensity * 36);
      renderCtx.strokeStyle =
        nearEdge * side > 0
          ? `rgba(118, 233, 255, ${0.08 + intensity * 0.22})`
          : `rgba(255, 155, 118, ${0.06 + intensity * 0.18})`;
      renderCtx.lineWidth = 1 + intensity * 2.1;
      renderCtx.beginPath();
      renderCtx.moveTo(x, y);
      renderCtx.lineTo(x2, y + 34 + intensity * 54);
      renderCtx.stroke();
    }
    renderCtx.restore();
  }

  function renderOvertakeFlash(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    burstNorm: number,
    side: -1 | 1,
  ): void {
    if (burstNorm < 0.08) {
      return;
    }

    const centerX = width * (0.5 + side * 0.08 * burstNorm);
    const centerY = height * (0.44 - burstNorm * 0.04);
    const flare = renderCtx.createRadialGradient(
      centerX,
      centerY,
      width * 0.04,
      centerX,
      centerY,
      width * (0.22 + burstNorm * 0.38),
    );
    flare.addColorStop(0, `rgba(255, 250, 236, ${0.18 + burstNorm * 0.34})`);
    flare.addColorStop(0.55, `rgba(174, 236, 255, ${0.08 + burstNorm * 0.12})`);
    flare.addColorStop(1, 'rgba(255, 248, 236, 0)');
    renderCtx.fillStyle = flare;
    renderCtx.fillRect(0, 0, width, height);

    const stripe = renderCtx.createLinearGradient(0, 0, 0, height);
    stripe.addColorStop(0, 'rgba(255,255,255,0)');
    stripe.addColorStop(0.45, `rgba(255, 248, 232, ${0.06 + burstNorm * 0.12})`);
    stripe.addColorStop(0.62, 'rgba(255,255,255,0)');
    renderCtx.fillStyle = stripe;
    renderCtx.fillRect(0, 0, width, height);
  }

  function renderOvertakeLossShock(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    lossNorm: number,
    side: -1 | 1,
  ): void {
    if (lossNorm < 0.08) {
      return;
    }

    const edgeWidth = width * (0.14 + lossNorm * 0.1);
    const shade = renderCtx.createLinearGradient(0, 0, width, 0);
    if (side > 0) {
      shade.addColorStop(0, `rgba(124, 190, 255, ${0.1 + lossNorm * 0.16})`);
      shade.addColorStop(0.36, 'rgba(124, 190, 255, 0)');
      shade.addColorStop(0.64, 'rgba(0, 0, 0, 0)');
      shade.addColorStop(1, `rgba(16, 22, 34, ${0.08 + lossNorm * 0.14})`);
    } else {
      shade.addColorStop(0, `rgba(16, 22, 34, ${0.08 + lossNorm * 0.14})`);
      shade.addColorStop(0.36, 'rgba(0, 0, 0, 0)');
      shade.addColorStop(0.64, 'rgba(124, 190, 255, 0)');
      shade.addColorStop(1, `rgba(124, 190, 255, ${0.1 + lossNorm * 0.16})`);
    }
    renderCtx.fillStyle = shade;
    renderCtx.fillRect(0, 0, width, height);

    const sideX = side > 0 ? width - edgeWidth * 0.45 : edgeWidth * 0.45;
    const flash = renderCtx.createRadialGradient(
      sideX,
      height * 0.46,
      width * 0.03,
      sideX,
      height * 0.46,
      width * (0.2 + lossNorm * 0.26),
    );
    flash.addColorStop(0, `rgba(188, 228, 255, ${0.1 + lossNorm * 0.14})`);
    flash.addColorStop(1, 'rgba(188, 228, 255, 0)');
    renderCtx.fillStyle = flash;
    renderCtx.fillRect(0, 0, width, height);
  }

  function renderRivalSurgePulse(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    surgeNorm: number,
    side: -1 | 1,
  ): void {
    if (surgeNorm < 0.08) {
      return;
    }

    const edgeWidth = width * (0.12 + surgeNorm * 0.1);
    const sideEdge = side > 0 ? width - edgeWidth : 0;
    const sideGrad = renderCtx.createLinearGradient(sideEdge, 0, side > 0 ? width : edgeWidth, 0);
    if (side > 0) {
      sideGrad.addColorStop(0, 'rgba(255, 170, 120, 0)');
      sideGrad.addColorStop(1, `rgba(255, 170, 120, ${0.12 + surgeNorm * 0.22})`);
    } else {
      sideGrad.addColorStop(0, `rgba(255, 170, 120, ${0.12 + surgeNorm * 0.22})`);
      sideGrad.addColorStop(1, 'rgba(255, 170, 120, 0)');
    }
    renderCtx.fillStyle = sideGrad;
    renderCtx.fillRect(side > 0 ? width - edgeWidth : 0, 0, edgeWidth, height);

    const centerX = width * (0.5 + side * 0.07);
    const pulse = renderCtx.createRadialGradient(
      centerX,
      height * 0.42,
      width * 0.05,
      centerX,
      height * 0.42,
      width * (0.28 + surgeNorm * 0.22),
    );
    pulse.addColorStop(0, `rgba(255, 236, 196, ${0.08 + surgeNorm * 0.16})`);
    pulse.addColorStop(0.54, `rgba(255, 128, 98, ${0.06 + surgeNorm * 0.14})`);
    pulse.addColorStop(1, 'rgba(255, 128, 98, 0)');
    renderCtx.fillStyle = pulse;
    renderCtx.fillRect(0, 0, width, height);
  }

  function renderObstacleImpactShock(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    impactNorm: number,
    side: -1 | 1,
  ): void {
    if (impactNorm < 0.06) {
      return;
    }

    const edgeWidth = width * (0.15 + impactNorm * 0.1);
    const sideGrad = renderCtx.createLinearGradient(side > 0 ? width - edgeWidth : 0, 0, side > 0 ? width : edgeWidth, 0);
    if (side > 0) {
      sideGrad.addColorStop(0, 'rgba(255, 168, 136, 0)');
      sideGrad.addColorStop(1, `rgba(255, 168, 136, ${0.16 + impactNorm * 0.28})`);
    } else {
      sideGrad.addColorStop(0, `rgba(255, 168, 136, ${0.16 + impactNorm * 0.28})`);
      sideGrad.addColorStop(1, 'rgba(255, 168, 136, 0)');
    }
    renderCtx.fillStyle = sideGrad;
    renderCtx.fillRect(side > 0 ? width - edgeWidth : 0, 0, edgeWidth, height);

    const centerX = width * (0.5 + side * 0.09);
    const centerY = height * 0.68;
    const pulse = renderCtx.createRadialGradient(
      centerX,
      centerY,
      width * 0.02,
      centerX,
      centerY,
      width * (0.18 + impactNorm * 0.2),
    );
    pulse.addColorStop(0, `rgba(255, 238, 218, ${0.2 + impactNorm * 0.28})`);
    pulse.addColorStop(0.56, `rgba(255, 154, 112, ${0.14 + impactNorm * 0.22})`);
    pulse.addColorStop(1, 'rgba(255, 154, 112, 0)');
    renderCtx.fillStyle = pulse;
    renderCtx.fillRect(0, 0, width, height);

    renderCtx.save();
    renderCtx.globalCompositeOperation = 'screen';
    renderCtx.strokeStyle = `rgba(255, 216, 182, ${0.14 + impactNorm * 0.2})`;
    renderCtx.lineWidth = 1.2 + impactNorm * 2.2;
    for (let i = 0; i < 8; i += 1) {
      const y = height * (0.24 + i * 0.08);
      const x0 = centerX + side * (12 + i * (5 + impactNorm * 3));
      const x1 = x0 + side * (22 + impactNorm * 34);
      renderCtx.beginPath();
      renderCtx.moveTo(x0, y);
      renderCtx.lineTo(x1, y + 6 + impactNorm * 12);
      renderCtx.stroke();
    }
    renderCtx.restore();
  }

  function renderTraps(renderCtx: CanvasRenderingContext2D, width: number, height: number, baseDistance: number, baseLane: number): void {
    const renderDistance = 1900;

    for (const trap of traps) {
      const rel = normalizeDistance(trap.distance - baseDistance);
      if (rel <= 10 || rel >= renderDistance) {
        continue;
      }

      const depth = 1 - rel / renderDistance;
      const y = height * 0.30 + depth * depth * height * 0.62;
      const x = width * 0.5 + (trap.lane - baseLane) * depth * 260;
      const r = 3 + depth * 7;

      renderCtx.fillStyle = '#ffd24c';
      renderCtx.beginPath();
      renderCtx.arc(x, y, r, 0, Math.PI * 2);
      renderCtx.fill();
    }
  }

  function renderTrackObstacles(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    baseDistance: number,
    baseLane: number,
  ): void {
    const renderDistance = options.mobile ? 1880 : 2050;
    const obstacleScale = options.mobile ? MOBILE_OBSTACLE_RENDER_SCALE : DESKTOP_OBSTACLE_RENDER_SCALE;

    for (const zone of resolvedTrackZones) {
      if (zone.type !== 'obstacle') {
        continue;
      }
      const offsets = zone.obstacleOffsets ?? [0.5];
      const lanes = zone.obstacleLanes ?? [(zone.laneMin + zone.laneMax) * 0.5];
      const count = Math.min(offsets.length, lanes.length);
      for (let i = 0; i < count; i += 1) {
        const localDistance = zone.start + (zone.end - zone.start) * offsets[i];
        const obstacleDistance = toNearestWorldDistance(localDistance, baseDistance);
        const rel = obstacleDistance - baseDistance;
        if (rel <= 12 || rel >= renderDistance) {
          continue;
        }

        const depth = 1 - rel / renderDistance;
        const y = height * 0.295 + depth * depth * height * 0.64;
        const x = width * 0.5 + (lanes[i] - baseLane) * depth * 286;
        const size = (5.2 + depth * 16.2) * obstacleScale;
        const bodyH = size * 1.76;
        const bodyWBottom = size * 1.2;
        const bodyWTop = bodyWBottom * 0.64;
        const sideDir = x >= width * 0.5 ? 1 : -1;
        const sideDx = bodyWBottom * 0.3 * sideDir;
        const sideDy = bodyH * 0.12;

        renderCtx.fillStyle = `rgba(0, 0, 0, ${0.16 + depth * 0.1})`;
        renderCtx.beginPath();
        renderCtx.ellipse(x, y + bodyH * 0.72, bodyWBottom * 0.94, bodyH * 0.23, 0, 0, Math.PI * 2);
        renderCtx.fill();

        renderCtx.fillStyle = `rgba(152, 64, 50, ${0.62 + depth * 0.2})`;
        renderCtx.beginPath();
        if (sideDir > 0) {
          renderCtx.moveTo(x + bodyWTop, y - bodyH * 0.88);
          renderCtx.lineTo(x + bodyWBottom, y + bodyH * 0.72);
          renderCtx.lineTo(x + bodyWBottom + sideDx, y + bodyH * 0.72 - sideDy);
          renderCtx.lineTo(x + bodyWTop + sideDx * 0.86, y - bodyH * 0.88 - sideDy * 0.86);
        } else {
          renderCtx.moveTo(x - bodyWTop, y - bodyH * 0.88);
          renderCtx.lineTo(x - bodyWBottom, y + bodyH * 0.72);
          renderCtx.lineTo(x - bodyWBottom + sideDx, y + bodyH * 0.72 - sideDy);
          renderCtx.lineTo(x - bodyWTop + sideDx * 0.86, y - bodyH * 0.88 - sideDy * 0.86);
        }
        renderCtx.closePath();
        renderCtx.fill();

        renderCtx.fillStyle = `rgba(242, 108, 76, ${0.74 + depth * 0.18})`;
        renderCtx.beginPath();
        renderCtx.moveTo(x - bodyWTop, y - bodyH * 0.88);
        renderCtx.lineTo(x + bodyWTop, y - bodyH * 0.88);
        renderCtx.lineTo(x + bodyWBottom, y + bodyH * 0.72);
        renderCtx.lineTo(x - bodyWBottom, y + bodyH * 0.72);
        renderCtx.closePath();
        renderCtx.fill();

        renderCtx.fillStyle = `rgba(124, 44, 36, ${0.26 + depth * 0.22})`;
        renderCtx.beginPath();
        renderCtx.moveTo(x - bodyWTop * 0.74, y - bodyH * 0.64);
        renderCtx.lineTo(x + bodyWTop * 0.74, y - bodyH * 0.64);
        renderCtx.lineTo(x + bodyWBottom * 0.78, y + bodyH * 0.36);
        renderCtx.lineTo(x - bodyWBottom * 0.78, y + bodyH * 0.36);
        renderCtx.closePath();
        renderCtx.fill();

        renderCtx.fillStyle = `rgba(255, 198, 122, ${0.46 + depth * 0.22})`;
        renderCtx.beginPath();
        renderCtx.moveTo(x - bodyWTop * 0.88, y - bodyH * 0.88);
        renderCtx.lineTo(x + bodyWTop * 0.88, y - bodyH * 0.88);
        renderCtx.lineTo(x + bodyWTop * 0.64 + sideDx * 0.18, y - bodyH * 1.02 - sideDy * 0.16);
        renderCtx.lineTo(x - bodyWTop * 0.64 + sideDx * 0.18, y - bodyH * 1.02 - sideDy * 0.16);
        renderCtx.closePath();
        renderCtx.fill();

        renderCtx.strokeStyle = 'rgba(252, 224, 188, 0.88)';
        renderCtx.lineWidth = Math.max(1, depth * 1.8);
        renderCtx.stroke();

        const stripeColor = 'rgba(32, 34, 41, 0.78)';
        renderCtx.strokeStyle = stripeColor;
        renderCtx.lineWidth = Math.max(1, size * 0.16);
        for (let stripe = 0; stripe < 2; stripe += 1) {
          const stripeYTop = y - bodyH * (0.55 - stripe * 0.34);
          const stripeYBottom = stripeYTop + bodyH * 0.2;
          renderCtx.beginPath();
          renderCtx.moveTo(x - bodyWTop * 0.92, stripeYTop);
          renderCtx.lineTo(x + bodyWTop * 0.92, stripeYTop);
          renderCtx.moveTo(x - bodyWBottom * 0.95, stripeYBottom);
          renderCtx.lineTo(x + bodyWBottom * 0.95, stripeYBottom);
          renderCtx.stroke();
        }

        const lampPulse = 0.5 + Math.sin((raceTimeMs + zone.start + i * 240) * 0.012) * 0.5;
        renderCtx.fillStyle = `rgba(255, 236, 156, ${0.4 + lampPulse * 0.52})`;
        renderCtx.beginPath();
        renderCtx.arc(x + sideDx * 0.1, y - bodyH * 0.98, size * 0.21, 0, Math.PI * 2);
        renderCtx.fill();

        renderCtx.strokeStyle = `rgba(255, 182, 138, ${0.24 + depth * 0.22})`;
        renderCtx.lineWidth = Math.max(1, size * 0.07);
        renderCtx.beginPath();
        renderCtx.ellipse(x, y + bodyH * 0.72, bodyWBottom * 0.88, bodyH * 0.2, 0, 0, Math.PI * 2);
        renderCtx.stroke();
      }
    }
  }

  function renderNarrowChokeGuides(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    baseDistance: number,
    baseLane: number,
  ): void {
    const renderDistance = 2200;
    for (const zone of narrowChokeZones) {
      const startWorld = toNearestWorldDistance(zone.start, baseDistance);
      const endWorld = toNearestWorldDistance(zone.end, baseDistance);
      const localEnd = endWorld < startWorld ? endWorld + TRACK_LENGTH : endWorld;
      for (let sample = startWorld; sample <= localEnd; sample += 130) {
        const rel = sample - baseDistance;
        if (rel <= 40 || rel >= renderDistance) {
          continue;
        }
        const depth = 1 - rel / renderDistance;
        const y = height * 0.29 + depth * depth * height * 0.63;
        const leftX = width * 0.5 + (zone.laneMin - baseLane) * depth * 286;
        const rightX = width * 0.5 + (zone.laneMax - baseLane) * depth * 286;
        const barW = Math.max(1.2, depth * 4.2);
        const barH = Math.max(2.2, depth * 11);
        renderCtx.fillStyle = 'rgba(255, 206, 112, 0.54)';
        renderCtx.fillRect(leftX - barW * 0.5, y - barH, barW, barH);
        renderCtx.fillRect(rightX - barW * 0.5, y - barH, barW, barH);
      }
    }
  }

  function renderDynamicObstacles(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    baseDistance: number,
    baseLane: number,
  ): void {
    const renderDistance = options.mobile ? 1880 : 2050;
    const obstacleScale = options.mobile ? MOBILE_OBSTACLE_RENDER_SCALE : DESKTOP_OBSTACLE_RENDER_SCALE;
    const near = getDynamicObstaclesNearDistance(baseDistance, renderDistance);
    for (const { obstacle, worldDistance } of near) {
      const rel = worldDistance - baseDistance;
      if (rel <= 18 || rel >= renderDistance) {
        continue;
      }
      const depth = 1 - rel / renderDistance;
      const lane = dynamicObstacleLane(obstacle, raceTimeMs) * difficultyPreset.movingObstacleFactor;
      const y = height * 0.295 + depth * depth * height * 0.64;
      const x = width * 0.5 + (lane - baseLane) * depth * 286;
      const size = (4.8 + depth * 15.6) * obstacle.size * obstacleScale;
      const bodyW = size * 1.28;
      const bodyH = size * 1.1;
      const pulse = 0.5 + Math.sin((raceTimeMs + obstacle.phaseMs) * 0.01) * 0.5;
      const stripeShift = ((raceTimeMs + obstacle.phaseMs) / 280) % 1;
      const sideDir = x >= width * 0.5 ? 1 : -1;
      const sideDx = bodyW * 0.24 * sideDir;
      const sideDy = bodyH * 0.14;

      renderCtx.fillStyle = `rgba(0, 0, 0, ${0.15 + depth * 0.1})`;
      renderCtx.beginPath();
      renderCtx.ellipse(x, y + bodyH * 0.9, bodyW * 0.94, bodyH * 0.26, 0, 0, Math.PI * 2);
      renderCtx.fill();

      renderCtx.fillStyle = `rgba(146, 60, 70, ${0.62 + depth * 0.2})`;
      renderCtx.beginPath();
      if (sideDir > 0) {
        renderCtx.moveTo(x + bodyW * 0.5, y - bodyH * 0.84);
        renderCtx.lineTo(x + bodyW * 0.5, y + bodyH * 0.66);
        renderCtx.lineTo(x + bodyW * 0.5 + sideDx, y + bodyH * 0.66 - sideDy);
        renderCtx.lineTo(x + bodyW * 0.5 + sideDx, y - bodyH * 0.84 - sideDy);
      } else {
        renderCtx.moveTo(x - bodyW * 0.5, y - bodyH * 0.84);
        renderCtx.lineTo(x - bodyW * 0.5, y + bodyH * 0.66);
        renderCtx.lineTo(x - bodyW * 0.5 + sideDx, y + bodyH * 0.66 - sideDy);
        renderCtx.lineTo(x - bodyW * 0.5 + sideDx, y - bodyH * 0.84 - sideDy);
      }
      renderCtx.closePath();
      renderCtx.fill();

      renderCtx.fillStyle = `rgba(238, 98, 84, ${0.74 + depth * 0.18})`;
      renderCtx.beginPath();
      appendRoundRectPath(renderCtx, x - bodyW * 0.5, y - bodyH * 0.84, bodyW, bodyH * 1.5, bodyH * 0.22);
      renderCtx.fill();

      renderCtx.fillStyle = `rgba(120, 42, 56, ${0.24 + depth * 0.22})`;
      renderCtx.beginPath();
      appendRoundRectPath(renderCtx, x - bodyW * 0.36, y - bodyH * 0.56, bodyW * 0.72, bodyH * 1.02, bodyH * 0.18);
      renderCtx.fill();

      renderCtx.fillStyle = `rgba(255, 204, 122, ${0.34 + depth * 0.22})`;
      renderCtx.fillRect(x - bodyW * 0.44, y - bodyH * 0.92, bodyW * 0.88, bodyH * 0.14);

      renderCtx.strokeStyle = 'rgba(255, 226, 190, 0.82)';
      renderCtx.lineWidth = Math.max(1, size * 0.14);
      renderCtx.stroke();

      renderCtx.fillStyle = 'rgba(255, 225, 148, 0.88)';
      for (let s = 0; s < 3; s += 1) {
        const t = (s + stripeShift) % 1;
        const stripeY = y - bodyH * 0.56 + t * bodyH * 1.1;
        renderCtx.fillRect(x - bodyW * 0.44, stripeY, bodyW * 0.88, bodyH * 0.12);
      }

      const beaconX = x + Math.sin((raceTimeMs + obstacle.phaseMs) * 0.006) * bodyW * 0.18;
      renderCtx.fillStyle = `rgba(122, 235, 255, ${0.3 + pulse * 0.5})`;
      renderCtx.beginPath();
      renderCtx.arc(beaconX, y - bodyH * 0.92, size * 0.16, 0, Math.PI * 2);
      renderCtx.fill();

      renderCtx.strokeStyle = `rgba(255, 174, 146, ${0.22 + depth * 0.2})`;
      renderCtx.lineWidth = Math.max(1, size * 0.06);
      renderCtx.beginPath();
      renderCtx.ellipse(x, y + bodyH * 0.92, bodyW * 0.9, bodyH * 0.24, 0, 0, Math.PI * 2);
      renderCtx.stroke();
    }
  }

  function getSegmentAtDistance(distance: number): Segment {
    const idx = Math.floor(((distance % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH / SEGMENT_LENGTH);
    return segments[idx];
  }

  function getAndClearEvents(): EngineEvent[] {
    if (events.length === 0) {
      return [];
    }
    const snapshot = [...events];
    events.length = 0;
    return snapshot;
  }

  function dispose(): void {
    disposed = true;
    events.length = 0;
    cars = [];
    traps = [];
  }

  function pushRuntimeError(message: string): void {
    events.push({ type: 'runtime_error', payload: { message } });
  }

  function pushMessage(text: string): void {
    events.push({ type: 'message', payload: { text } });
  }

  return {
    startRace,
    setInput,
    tick,
    getAndClearEvents,
    dispose,
  };
}

function simulatePlayerStepFallback(
  speed: number,
  lane: number,
  steer: number,
  curve: number,
  throttle: boolean,
  brake: boolean,
  stunned: boolean,
  boostActive: boolean,
  drifting: boolean,
  driftDirection: number,
  dtMs: number,
): { speed: number; lane: number } {
  const speedRatio = clamp(speed / MAX_SPEED, 0, 1.25);
  let acc = -210;

  if (throttle) {
    acc += 760;
  }
  if (brake) {
    acc -= 720;
  }
  if (stunned) {
    acc -= 380;
  }
  if (drifting) {
    acc -= 80;
  }
  if (boostActive) {
    acc += 340;
  }

  const dtSec = Math.max(0, dtMs) / 1000;
  let nextSpeed = clamp(speed + acc * dtSec, 0, MAX_SPEED * 1.2);
  if (!brake && throttle && nextSpeed < 42) {
    nextSpeed = 42;
  }

  const steerPower = (steer + driftDirection * (drifting ? 0.18 : 0)) * (0.78 + speedRatio * 0.52);
  let nextLane = lane + steerPower * dtSec * 1.6;
  nextLane -= curve * speedRatio * dtSec * 2.6;

  if (nextLane < MIN_ROAD_X || nextLane > MAX_ROAD_X) {
    nextSpeed *= 0.982;
  }

  return {
    speed: nextSpeed,
    lane: clamp(nextLane, -1.6, 1.6),
  };
}

function simulateAiStepFallback(
  speed: number,
  lane: number,
  targetLane: number,
  targetSpeed: number,
  aiRisk: number,
  laneProfileMul: number,
  dtMs: number,
  blocked: boolean,
  stunned: boolean,
  chokeMin: number,
  chokeMax: number,
  hasChoke: boolean,
  cliffGust: number,
): { speed: number; lane: number } {
  const dtRatio = Math.max(0, dtMs) / FIXED_STEP_MS;
  const laneStep = (0.015 + aiRisk * 0.015) * laneProfileMul;
  let nextLane = lane + clamp(targetLane - lane, -laneStep, laneStep) * dtRatio;
  if (hasChoke) {
    nextLane = clamp(nextLane, chokeMin - 0.02, chokeMax + 0.02);
  }

  const speedRate = 0.013 + aiRisk * 0.005 + (blocked ? 0.002 : 0);
  let nextSpeed = speed + clamp((targetSpeed - speed) * speedRate, -20, 20) * dtRatio;
  if (stunned) {
    nextSpeed *= 0.95;
  }
  nextSpeed = clamp(nextSpeed, 66, MAX_SPEED * 1.08);

  nextLane += cliffGust * 0.00042 * dtMs;
  return {
    speed: nextSpeed,
    lane: nextLane,
  };
}

function buildTrack(): Segment[] {
  const segments: Segment[] = [];

  pushSection(segments, 20, 0.0, 0.0, 0.0, 0.22);          // 起步直道
  pushSection(segments, 24, -0.014, -0.048, 0.22, 1.32);  // 长左弯抬升
  pushSection(segments, 16, -0.048, -0.010, 1.32, -0.58); // 左弯回落
  pushSection(segments, 22, 0.012, 0.056, -0.58, 1.68);   // 右弯大起伏
  pushSection(segments, 18, 0.056, 0.006, 1.68, 0.12);    // 右弯收束
  pushSection(segments, 30, -0.014, -0.046, 0.12, -1.34); // S 第一段
  pushSection(segments, 20, -0.046, 0.052, -1.34, 1.04);  // S 第二段
  pushSection(segments, 16, 0.052, 0.008, 1.04, 0.08);    // 出弯拉直
  pushSection(segments, 34, 0.008, 0.042, 0.08, -1.22);   // 长右弯下切
  pushSection(segments, 20, 0.042, -0.046, -1.22, 0.78);  // 反打切弯
  pushSection(segments, 40, -0.032, 0.0, 0.78, 0.0);      // 冲线区

  if (segments.length < TRACK_SEGMENTS) {
    pushSection(segments, TRACK_SEGMENTS - segments.length, 0, 0, 0, 0);
  } else if (segments.length > TRACK_SEGMENTS) {
    segments.length = TRACK_SEGMENTS;
  }

  return segments;
}

function buildTrackZones(): TrackZone[] {
  const zones: TrackZone[] = [];
  const addZone = (
    id: string,
    type: TrackZone['type'],
    startSegment: number,
    segmentCount: number,
    laneMin: number,
    laneMax: number,
    obstacleLanes?: number[],
    obstacleOffsets?: number[],
  ) => {
    zones.push({
      id,
      type,
      start: clamp(startSegment * SEGMENT_LENGTH, 0, TRACK_LENGTH - SEGMENT_LENGTH),
      end: clamp((startSegment + segmentCount) * SEGMENT_LENGTH, SEGMENT_LENGTH, TRACK_LENGTH),
      laneMin,
      laneMax,
      obstacleLanes,
      obstacleOffsets,
    });
  };

  addZone('boost-1', 'boost_pad', 20, 4, -0.82, -0.15);
  addZone('obs-0', 'obstacle', 16, 3, -0.78, 0.78, [-0.44, 0.34], [0.36, 0.72]);
  addZone('mud-1', 'mud', 42, 5, 0.12, 0.92);
  addZone('obs-1', 'obstacle', 52, 4, -0.88, 0.86, [-0.62, 0.12, 0.58], [0.18, 0.46, 0.78]);
  addZone('jump-1', 'jump', 58, 3, -0.36, 0.36);
  addZone('boost-2', 'boost_pad', 88, 5, 0.2, 0.94);
  addZone('short-1', 'shortcut', 96, 4, 0.92, 1.16);
  addZone('mud-2', 'mud', 116, 6, -0.92, -0.2);
  addZone('obs-2', 'obstacle', 134, 5, -0.9, 0.92, [-0.55, 0.05, 0.63], [0.22, 0.52, 0.82]);
  addZone('jump-2', 'jump', 142, 3, -0.42, 0.42);
  addZone('boost-3', 'boost_pad', 171, 5, -0.88, -0.1);
  addZone('obs-5', 'obstacle', 176, 4, -0.84, 0.86, [-0.66, -0.06, 0.52], [0.24, 0.54, 0.84]);
  addZone('short-2', 'shortcut', 186, 4, -1.16, -0.92);
  addZone('mud-3', 'mud', 205, 6, 0.16, 0.9);
  addZone('obs-3', 'obstacle', 214, 5, -0.86, 0.88, [-0.48, 0.28, 0.74], [0.16, 0.48, 0.8]);
  addZone('short-3', 'shortcut', 220, 4, 0.92, 1.16);
  addZone('jump-3', 'jump', 232, 3, -0.34, 0.34);
  addZone('obs-4', 'obstacle', 238, 5, -0.86, 0.9, [-0.62, -0.1, 0.54], [0.2, 0.5, 0.8]);
  addZone('mud-4', 'mud', 247, 4, -0.72, 0.72);
  addZone('boost-4', 'boost_pad', 252, 4, -0.82, 0.82);

  return zones;
}

function buildTrackScenes(): SceneZone[] {
  const scenes: SceneZone[] = [];
  const addScene = (
    id: string,
    type: SceneType,
    startSegment: number,
    segmentCount: number,
    intensity: number,
    side?: -1 | 1,
  ) => {
    scenes.push({
      id,
      type,
      start: clamp(startSegment * SEGMENT_LENGTH, 0, TRACK_LENGTH - SEGMENT_LENGTH),
      end: clamp((startSegment + segmentCount) * SEGMENT_LENGTH, SEGMENT_LENGTH, TRACK_LENGTH),
      intensity: clamp(intensity, 0.5, 1.6),
      side,
    });
  };

  addScene('tunnel-a', 'tunnel', 28, 18, 1.0);
  addScene('cliff-a', 'cliff', 72, 24, 1.0, 1);
  addScene('bridge-a', 'bridge', 116, 22, 0.92);
  addScene('neon-a', 'neon_city', 152, 26, 1.0);
  addScene('bridge-b', 'bridge', 182, 16, 0.86);
  addScene('tunnel-b', 'tunnel', 204, 16, 1.08);
  addScene('cliff-b', 'cliff', 228, 20, 1.1, -1);
  addScene('neon-b', 'neon_city', 246, 12, 0.9);

  return scenes;
}

function buildNarrowChokeZones(): NarrowChokeZone[] {
  const zones: NarrowChokeZone[] = [];
  const addZone = (id: string, startSegment: number, segmentCount: number, laneMin: number, laneMax: number) => {
    zones.push({
      id,
      start: clamp(startSegment * SEGMENT_LENGTH, 0, TRACK_LENGTH - SEGMENT_LENGTH),
      end: clamp((startSegment + segmentCount) * SEGMENT_LENGTH, SEGMENT_LENGTH, TRACK_LENGTH),
      laneMin,
      laneMax,
    });
  };

  addZone('choke-a', 34, 9, -0.56, 0.52);
  addZone('choke-b', 64, 6, -0.48, 0.44);
  addZone('choke-c', 96, 8, -0.5, 0.46);
  addZone('choke-d', 142, 9, -0.54, 0.5);
  addZone('choke-e', 188, 8, -0.46, 0.44);
  addZone('choke-f', 216, 6, -0.5, 0.48);
  addZone('choke-g', 232, 10, -0.52, 0.5);

  return zones;
}

function buildDynamicObstacles(): DynamicObstacle[] {
  const obstacles: DynamicObstacle[] = [];
  const addObstacle = (
    id: string,
    segment: number,
    baseLane: number,
    amplitude: number,
    periodMs: number,
    phaseMs: number,
    size: number,
  ) => {
    const start = clamp(segment * SEGMENT_LENGTH, 0, TRACK_LENGTH - SEGMENT_LENGTH);
    obstacles.push({
      id,
      start,
      end: clamp(start + SEGMENT_LENGTH * 2, SEGMENT_LENGTH, TRACK_LENGTH),
      baseLane,
      amplitude,
      periodMs,
      phaseMs,
      size,
    });
  };

  addObstacle('dyn-1', 44, -0.28, 0.24, 3200, 180, 1);
  addObstacle('dyn-2', 58, -0.02, 0.34, 2600, 420, 1.08);
  addObstacle('dyn-3', 84, 0.3, 0.22, 2900, 960, 1.04);
  addObstacle('dyn-4', 126, -0.22, 0.3, 3400, 540, 1.08);
  addObstacle('dyn-5', 146, 0.06, 0.32, 2800, 1180, 1.12);
  addObstacle('dyn-6', 168, 0.2, 0.24, 3000, 1260, 0.96);
  addObstacle('dyn-7', 208, -0.16, 0.28, 3300, 760, 1.02);
  addObstacle('dyn-8', 222, -0.3, 0.26, 2500, 300, 1.06);
  addObstacle('dyn-9', 236, 0.34, 0.22, 2700, 980, 1);
  addObstacle('dyn-10', 246, 0.24, 0.24, 3100, 1380, 1.1);
  addObstacle('dyn-11', 30, 0.22, 0.18, 2200, 520, 0.92);
  addObstacle('dyn-12', 102, -0.26, 0.2, 2400, 740, 0.96);
  addObstacle('dyn-13', 178, 0.12, 0.28, 2600, 360, 1.08);
  addObstacle('dyn-14', 196, -0.08, 0.24, 2300, 1020, 1.02);
  addObstacle('dyn-15', 70, 0.18, 0.26, 2500, 640, 1.04);
  addObstacle('dyn-16', 112, 0.24, 0.2, 2100, 300, 0.94);
  addObstacle('dyn-17', 154, -0.3, 0.24, 2700, 1240, 1.08);
  addObstacle('dyn-18', 186, 0.16, 0.3, 2900, 820, 1.12);
  addObstacle('dyn-19', 216, -0.24, 0.22, 2400, 540, 0.98);
  addObstacle('dyn-20', 252, 0.08, 0.26, 2600, 1180, 1.06);

  return obstacles;
}

function pushSection(
  segments: Segment[],
  count: number,
  curveStart: number,
  curveEnd: number,
  hillStart: number,
  hillEnd: number,
): void {
  for (let i = 0; i < count; i += 1) {
    const t = i / Math.max(1, count - 1);
    const ease = t * t * (3 - 2 * t);
    const curve = curveStart + (curveEnd - curveStart) * ease;
    const hill = hillStart + (hillEnd - hillStart) * ease;
    segments.push({ curve, hill });
  }
}

function weatherLabel(weather: WeatherMode): string {
  if (weather === 'rain') {
    return '雨';
  }
  if (weather === 'fog') {
    return '雾';
  }
  return '晴';
}

function chooseOpeningWeather(): WeatherMode {
  const roll = Math.random();
  if (roll < 0.5) {
    return 'rain';
  }
  if (roll < 0.76) {
    return 'fog';
  }
  return 'clear';
}

function rotateWeatherForLap(previous: WeatherMode): WeatherMode {
  const roll = Math.random();
  if (previous === 'clear') {
    return roll < 0.54 ? 'rain' : roll < 0.88 ? 'fog' : 'clear';
  }
  if (previous === 'rain') {
    return roll < 0.46 ? 'fog' : roll < 0.82 ? 'clear' : 'rain';
  }
  return roll < 0.52 ? 'clear' : roll < 0.84 ? 'rain' : 'fog';
}

function randomPlayerItem(position: number, totalRacers: number): RacerItem {
  const total = Math.max(2, totalRacers);
  const normalized = clamp((position - 1) / (total - 1), 0, 1);
  const behindBias = clamp((normalized - 0.4) / 0.6, 0, 1);
  const leadBias = clamp((0.38 - normalized) / 0.38, 0, 1);
  const roll = Math.random();

  const rocketCut = 0.26 + behindBias * 0.14;
  const bananaCut = rocketCut + 0.18 + leadBias * 0.18;
  const shieldCut = bananaCut + 0.24 + leadBias * 0.1;

  if (roll < rocketCut) {
    return 'rocket';
  }
  if (roll < bananaCut) {
    return 'banana';
  }
  if (roll < shieldCut) {
    return 'shield';
  }
  return 'boost';
}

function randomItem(): RacerItem {
  const roll = Math.random();
  if (roll < 0.30) {
    return 'rocket';
  }
  if (roll < 0.54) {
    return 'banana';
  }
  if (roll < 0.78) {
    return 'shield';
  }
  return 'boost';
}

function normalizeDistance(distance: number): number {
  if (distance > TRACK_LENGTH * 0.5) {
    return distance - TRACK_LENGTH;
  }
  if (distance < -TRACK_LENGTH * 0.5) {
    return distance + TRACK_LENGTH;
  }
  return distance;
}

function normalizeTrackDistance(distance: number): number {
  return ((distance % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
}

function appendRoundRectPath(
  renderCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const maybeRoundRect = (renderCtx as CanvasRenderingContext2D & { roundRect?: (...args: unknown[]) => void }).roundRect;
  if (typeof maybeRoundRect === 'function') {
    maybeRoundRect.call(renderCtx, x, y, width, height, radius);
    return;
  }

  const r = Math.max(0, Math.min(radius, Math.abs(width) * 0.5, Math.abs(height) * 0.5));
  const right = x + width;
  const bottom = y + height;

  renderCtx.moveTo(x + r, y);
  renderCtx.lineTo(right - r, y);
  renderCtx.quadraticCurveTo(right, y, right, y + r);
  renderCtx.lineTo(right, bottom - r);
  renderCtx.quadraticCurveTo(right, bottom, right - r, bottom);
  renderCtx.lineTo(x + r, bottom);
  renderCtx.quadraticCurveTo(x, bottom, x, bottom - r);
  renderCtx.lineTo(x, y + r);
  renderCtx.quadraticCurveTo(x, y, x + r, y);
}

function sceneContainsDistance(scene: { start: number; end: number }, normalizedDistance: number): boolean {
  if (scene.start <= scene.end) {
    return normalizedDistance >= scene.start && normalizedDistance <= scene.end;
  }
  return normalizedDistance >= scene.start || normalizedDistance <= scene.end;
}

function sceneSpan(scene: { start: number; end: number }): number {
  if (scene.start <= scene.end) {
    return scene.end - scene.start;
  }
  return TRACK_LENGTH - scene.start + scene.end;
}

function sceneOffsetFromStart(scene: { start: number; end: number }, normalizedDistance: number): number {
  if (scene.start <= scene.end) {
    return normalizedDistance - scene.start;
  }
  if (normalizedDistance >= scene.start) {
    return normalizedDistance - scene.start;
  }
  return TRACK_LENGTH - scene.start + normalizedDistance;
}

function sceneBlendAtDistance(scene: SceneZone, distance: number): number {
  const normalizedDistance = normalizeTrackDistance(distance);
  const span = Math.max(SEGMENT_LENGTH * 2.2, sceneSpan(scene));
  const fade = clamp(span * 0.24, SEGMENT_LENGTH * 1.4, SEGMENT_LENGTH * 4);
  const startToDistance = sceneOffsetFromStart(scene, normalizedDistance);
  const inside = sceneContainsDistance(scene, normalizedDistance);

  if (inside) {
    const inBlend = clamp(startToDistance / fade, 0, 1);
    const outBlend = clamp((span - startToDistance) / fade, 0, 1);
    return Math.min(inBlend, outBlend, 1);
  }

  const toStart = (scene.start - normalizedDistance + TRACK_LENGTH) % TRACK_LENGTH;
  const toEnd = (normalizedDistance - scene.end + TRACK_LENGTH) % TRACK_LENGTH;
  const distToBoundary = Math.min(toStart, toEnd);
  if (distToBoundary > fade) {
    return 0;
  }
  return clamp(1 - distToBoundary / fade, 0, 1);
}

function toNearestWorldDistance(localDistance: number, referenceDistance: number): number {
  const baseLap = Math.floor(referenceDistance / TRACK_LENGTH) * TRACK_LENGTH;
  const a = baseLap + localDistance;
  const b = a + TRACK_LENGTH;
  const c = a - TRACK_LENGTH;
  const da = Math.abs(a - referenceDistance);
  const db = Math.abs(b - referenceDistance);
  const dc = Math.abs(c - referenceDistance);
  if (da <= db && da <= dc) {
    return a;
  }
  if (db <= da && db <= dc) {
    return b;
  }
  return c;
}

function laneToRoadOffset(lane: number, halfWidth: number): number {
  return lane * halfWidth * LANE_VISUAL_SCALE;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
