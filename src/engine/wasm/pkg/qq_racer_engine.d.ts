/* tslint:disable */
/* eslint-disable */
export function detect_player_dynamic_hazards_batch(player_distance: number, player_lane: number, player_speed: number, player_air_ms: number, dynamic_inputs: Float32Array, track_length: number): Float32Array;
export function detect_player_static_hazards_batch(player_distance: number, player_lane: number, player_speed: number, player_air_ms: number, static_inputs: Float32Array, track_length: number): Float32Array;
export function simulate_ai_step(speed: number, lane: number, target_lane: number, target_speed: number, ai_risk: number, lane_profile_mul: number, dt_ms: number, blocked: boolean, stunned: boolean, choke_min: number, choke_max: number, has_choke: boolean, cliff_gust: number): Float32Array;
export function select_nearest_ahead_target_index(user_distance: number, candidate_distances: Float32Array, max_distance: number, track_length: number): number;
export function detect_player_interactions_batch(player_distance: number, player_lane: number, ai_inputs: Float32Array, trap_inputs: Float32Array, track_length: number): Float32Array;
export function engine_version(): string;
export function simulate_player_step(speed: number, lane: number, steer: number, curve: number, throttle: boolean, brake: boolean, stunned: boolean, boost_active: boolean, drifting: boolean, drift_direction: number, dt_ms: number): Float32Array;
export function simulate_ai_hazard_batch(ai_inputs: Float32Array, static_inputs: Float32Array, dynamic_inputs: Float32Array, track_length: number): Float32Array;
export function score_race(finish_position: number, total_racers: number, total_time_ms: number, nitro_pct: number): number;
export function compute_player_relations_batch(player_distance: number, player_lane: number, player_speed: number, current_steer: number, previous_overtake_side: number, ai_inputs: Float32Array, track_length: number): Float32Array;
export function simulate_ai_step_batch(inputs: Float32Array): Float32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly compute_player_relations_batch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
  readonly detect_player_dynamic_hazards_batch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
  readonly detect_player_interactions_batch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
  readonly detect_player_static_hazards_batch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
  readonly engine_version: () => [number, number];
  readonly score_race: (a: number, b: number, c: number, d: number) => number;
  readonly select_nearest_ahead_target_index: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly simulate_ai_hazard_batch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
  readonly simulate_ai_step: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => [number, number];
  readonly simulate_ai_step_batch: (a: number, b: number) => [number, number];
  readonly simulate_player_step: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number];
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
