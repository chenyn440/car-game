/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const compute_player_relations_batch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
export const detect_player_dynamic_hazards_batch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
export const detect_player_interactions_batch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
export const detect_player_static_hazards_batch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
export const engine_version: () => [number, number];
export const score_race: (a: number, b: number, c: number, d: number) => number;
export const select_nearest_ahead_target_index: (a: number, b: number, c: number, d: number, e: number) => number;
export const simulate_ai_hazard_batch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
export const simulate_ai_step: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => [number, number];
export const simulate_ai_step_batch: (a: number, b: number) => [number, number];
export const simulate_player_step: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number];
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_start: () => void;
