import { createFallbackEngine } from '../ts/fallbackEngine';
import type { EngineInitOptions, RacingEngine } from '../types';

type WasmExports = {
  default: (input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module) => Promise<unknown>;
  engine_version: () => string;
  score_race: (finishPosition: number, totalRacers: number, totalTimeMs: number, nitroPct: number) => number;
  simulate_player_step: (
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
  ) => Float32Array | number[];
  simulate_ai_step: (
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
  ) => Float32Array | number[];
  simulate_ai_step_batch: (inputs: Float32Array | number[]) => Float32Array | number[];
  simulate_ai_hazard_batch: (
    aiInputs: Float32Array | number[],
    staticInputs: Float32Array | number[],
    dynamicInputs: Float32Array | number[],
    trackLength: number,
  ) => Float32Array | number[];
  detect_player_static_hazards_batch: (
    playerDistance: number,
    playerLane: number,
    playerSpeed: number,
    playerAirMs: number,
    staticInputs: Float32Array | number[],
    trackLength: number,
  ) => Float32Array | number[];
  detect_player_dynamic_hazards_batch: (
    playerDistance: number,
    playerLane: number,
    playerSpeed: number,
    playerAirMs: number,
    dynamicInputs: Float32Array | number[],
    trackLength: number,
  ) => Float32Array | number[];
  detect_player_interactions_batch: (
    playerDistance: number,
    playerLane: number,
    aiInputs: Float32Array | number[],
    trapInputs: Float32Array | number[],
    trackLength: number,
  ) => Float32Array | number[];
  compute_player_relations_batch: (
    playerDistance: number,
    playerLane: number,
    playerSpeed: number,
    currentSteer: number,
    previousOvertakeSide: number,
    aiInputs: Float32Array | number[],
    trackLength: number,
  ) => Float32Array | number[];
  select_nearest_ahead_target_index: (
    userDistance: number,
    candidateDistances: Float32Array | number[],
    maxDistance: number,
    trackLength: number,
  ) => number;
};

export async function createWasmEngine(options: EngineInitOptions): Promise<RacingEngine> {
  const wasmModule = (await import('./pkg/qq_racer_engine.js')) as unknown as WasmExports;

  await wasmModule.default();

  const version = safeCall(() => wasmModule.engine_version(), 'unknown');
  const hasAiStep = typeof wasmModule.simulate_ai_step === 'function';
  const hasAiStepBatch = typeof wasmModule.simulate_ai_step_batch === 'function';
  const hasAiHazardBatch = typeof wasmModule.simulate_ai_hazard_batch === 'function';
  const hasPlayerStaticHazardBatch = typeof wasmModule.detect_player_static_hazards_batch === 'function';
  const hasPlayerDynamicHazardBatch = typeof wasmModule.detect_player_dynamic_hazards_batch === 'function';
  const hasPlayerInteractionsBatch = typeof wasmModule.detect_player_interactions_batch === 'function';
  const hasPlayerRelationsBatch = typeof wasmModule.compute_player_relations_batch === 'function';
  const hasSelectNearestTarget = typeof wasmModule.select_nearest_ahead_target_index === 'function';
  const simulateAiStep = hasAiStep
    ? (
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
      ) =>
        safeCall(() => {
          const pair = wasmModule.simulate_ai_step(
            speed,
            lane,
            targetLane,
            targetSpeed,
            aiRisk,
            laneProfileMul,
            dtMs,
            blocked,
            stunned,
            chokeMin,
            chokeMax,
            hasChoke,
            cliffGust,
          );
          const nextSpeed = Number(pair?.[0]);
          const nextLane = Number(pair?.[1]);
          return {
            speed: Number.isFinite(nextSpeed) ? nextSpeed : speed,
            lane: Number.isFinite(nextLane) ? nextLane : lane,
          };
        }, { speed, lane })
    : undefined;
  const simulateAiStepBatch = hasAiStepBatch
    ? (inputs: Float32Array): Float32Array =>
        safeCall(() => {
          const out = wasmModule.simulate_ai_step_batch(inputs);
          if (out instanceof Float32Array) {
            return out;
          }
          return Float32Array.from(out ?? []);
        }, new Float32Array())
    : undefined;
  const simulateAiHazardBatch = hasAiHazardBatch
    ? (
        aiInputs: Float32Array,
        staticInputs: Float32Array,
        dynamicInputs: Float32Array,
        trackLength: number,
      ): Float32Array =>
        safeCall(() => {
          const out = wasmModule.simulate_ai_hazard_batch(aiInputs, staticInputs, dynamicInputs, trackLength);
          if (out instanceof Float32Array) {
            return out;
          }
          return Float32Array.from(out ?? []);
        }, new Float32Array())
    : undefined;
  const detectPlayerStaticHazardsBatch = hasPlayerStaticHazardBatch
    ? (
        playerDistance: number,
        playerLane: number,
        playerSpeed: number,
        playerAirMs: number,
        staticInputs: Float32Array,
        trackLength: number,
      ): Float32Array =>
        safeCall(() => {
          const out = wasmModule.detect_player_static_hazards_batch(
            playerDistance,
            playerLane,
            playerSpeed,
            playerAirMs,
            staticInputs,
            trackLength,
          );
          if (out instanceof Float32Array) {
            return out;
          }
          return Float32Array.from(out ?? []);
        }, new Float32Array())
    : undefined;
  const detectPlayerDynamicHazardsBatch = hasPlayerDynamicHazardBatch
    ? (
        playerDistance: number,
        playerLane: number,
        playerSpeed: number,
        playerAirMs: number,
        dynamicInputs: Float32Array,
        trackLength: number,
      ): Float32Array =>
        safeCall(() => {
          const out = wasmModule.detect_player_dynamic_hazards_batch(
            playerDistance,
            playerLane,
            playerSpeed,
            playerAirMs,
            dynamicInputs,
            trackLength,
          );
          if (out instanceof Float32Array) {
            return out;
          }
          return Float32Array.from(out ?? []);
        }, new Float32Array())
    : undefined;
  const detectPlayerInteractionsBatch = hasPlayerInteractionsBatch
    ? (
        playerDistance: number,
        playerLane: number,
        aiInputs: Float32Array,
        trapInputs: Float32Array,
        trackLength: number,
      ): Float32Array =>
        safeCall(() => {
          const out = wasmModule.detect_player_interactions_batch(
            playerDistance,
            playerLane,
            aiInputs,
            trapInputs,
            trackLength,
          );
          if (out instanceof Float32Array) {
            return out;
          }
          return Float32Array.from(out ?? []);
        }, new Float32Array())
    : undefined;
  const computePlayerRelationsBatch = hasPlayerRelationsBatch
    ? (
        playerDistance: number,
        playerLane: number,
        playerSpeed: number,
        currentSteer: number,
        previousOvertakeSide: number,
        aiInputs: Float32Array,
        trackLength: number,
      ): Float32Array =>
        safeCall(() => {
          const out = wasmModule.compute_player_relations_batch(
            playerDistance,
            playerLane,
            playerSpeed,
            currentSteer,
            previousOvertakeSide,
            aiInputs,
            trackLength,
          );
          if (out instanceof Float32Array) {
            return out;
          }
          return Float32Array.from(out ?? []);
        }, new Float32Array())
    : undefined;
  const selectNearestAheadTargetIndex = hasSelectNearestTarget
    ? (userDistance: number, candidateDistances: Float32Array, maxDistance: number, trackLength: number): number =>
        safeCall(
          () => wasmModule.select_nearest_ahead_target_index(userDistance, candidateDistances, maxDistance, trackLength),
          -1,
        )
    : undefined;

  return createFallbackEngine(options, {
    scoreRace: (finishPosition, totalRacers, totalTimeMs, nitroPct) =>
      safeCall(() => wasmModule.score_race(finishPosition, totalRacers, totalTimeMs, nitroPct), 0),
    simulatePlayerStep: (
      speed,
      lane,
      steer,
      curve,
      throttle,
      brake,
      stunned,
      boostActive,
      drifting,
      driftDirection,
      dtMs,
    ) =>
      safeCall(() => {
        const pair = wasmModule.simulate_player_step(
          speed,
          lane,
          steer,
          curve,
          throttle,
          brake,
          stunned,
          boostActive,
          drifting,
          driftDirection,
          dtMs,
        );
        const nextSpeed = Number(pair?.[0]);
        const nextLane = Number(pair?.[1]);
        return {
          speed: Number.isFinite(nextSpeed) ? nextSpeed : speed,
          lane: Number.isFinite(nextLane) ? nextLane : lane,
        };
      }, { speed, lane }),
    simulateAiStep,
    simulateAiStepBatch,
    simulateAiHazardBatch,
    detectPlayerStaticHazardsBatch,
    detectPlayerDynamicHazardsBatch,
    detectPlayerInteractionsBatch,
    computePlayerRelationsBatch,
    selectNearestAheadTargetIndex,
    onReadyMessage: `WASM 接入成功 v${version}`,
  });
}

function safeCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
