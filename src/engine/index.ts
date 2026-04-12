import type { EngineInitOptions, RacingEngine } from './types';
import { createFallbackEngine } from './ts/fallbackEngine';

export async function createRacingEngine(options: EngineInitOptions): Promise<RacingEngine> {
  try {
    const wasmModule = await import('./wasm/bridge');
    if (typeof wasmModule.createWasmEngine === 'function') {
      return await wasmModule.createWasmEngine(options);
    }
  } catch {
    // Fallback while Rust/WASM package is unavailable.
  }

  return createFallbackEngine(options);
}
