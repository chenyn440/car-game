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
};

export async function createWasmEngine(options: EngineInitOptions): Promise<RacingEngine> {
  const wasmModule = (await import('./pkg/qq_racer_engine.js')) as unknown as WasmExports;

  await wasmModule.default();

  const version = safeCall(() => wasmModule.engine_version(), 'unknown');

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
