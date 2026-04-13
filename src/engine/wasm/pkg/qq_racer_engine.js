let wasm;

let cachedFloat32ArrayMemory0 = null;

function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let WASM_VECTOR_LEN = 0;

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}
/**
 * @param {number} player_distance
 * @param {number} player_lane
 * @param {number} player_speed
 * @param {number} player_air_ms
 * @param {Float32Array} dynamic_inputs
 * @param {number} track_length
 * @returns {Float32Array}
 */
export function detect_player_dynamic_hazards_batch(player_distance, player_lane, player_speed, player_air_ms, dynamic_inputs, track_length) {
    const ptr0 = passArrayF32ToWasm0(dynamic_inputs, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.detect_player_dynamic_hazards_batch(player_distance, player_lane, player_speed, player_air_ms, ptr0, len0, track_length);
    var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}

/**
 * @param {number} player_distance
 * @param {number} player_lane
 * @param {number} player_speed
 * @param {number} player_air_ms
 * @param {Float32Array} static_inputs
 * @param {number} track_length
 * @returns {Float32Array}
 */
export function detect_player_static_hazards_batch(player_distance, player_lane, player_speed, player_air_ms, static_inputs, track_length) {
    const ptr0 = passArrayF32ToWasm0(static_inputs, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.detect_player_static_hazards_batch(player_distance, player_lane, player_speed, player_air_ms, ptr0, len0, track_length);
    var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}

/**
 * @param {number} speed
 * @param {number} lane
 * @param {number} target_lane
 * @param {number} target_speed
 * @param {number} ai_risk
 * @param {number} lane_profile_mul
 * @param {number} dt_ms
 * @param {boolean} blocked
 * @param {boolean} stunned
 * @param {number} choke_min
 * @param {number} choke_max
 * @param {boolean} has_choke
 * @param {number} cliff_gust
 * @returns {Float32Array}
 */
export function simulate_ai_step(speed, lane, target_lane, target_speed, ai_risk, lane_profile_mul, dt_ms, blocked, stunned, choke_min, choke_max, has_choke, cliff_gust) {
    const ret = wasm.simulate_ai_step(speed, lane, target_lane, target_speed, ai_risk, lane_profile_mul, dt_ms, blocked, stunned, choke_min, choke_max, has_choke, cliff_gust);
    var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
}

/**
 * @param {number} user_distance
 * @param {Float32Array} candidate_distances
 * @param {number} max_distance
 * @param {number} track_length
 * @returns {number}
 */
export function select_nearest_ahead_target_index(user_distance, candidate_distances, max_distance, track_length) {
    const ptr0 = passArrayF32ToWasm0(candidate_distances, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.select_nearest_ahead_target_index(user_distance, ptr0, len0, max_distance, track_length);
    return ret;
}

/**
 * @param {number} player_distance
 * @param {number} player_lane
 * @param {Float32Array} ai_inputs
 * @param {Float32Array} trap_inputs
 * @param {number} track_length
 * @returns {Float32Array}
 */
export function detect_player_interactions_batch(player_distance, player_lane, ai_inputs, trap_inputs, track_length) {
    const ptr0 = passArrayF32ToWasm0(ai_inputs, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF32ToWasm0(trap_inputs, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.detect_player_interactions_batch(player_distance, player_lane, ptr0, len0, ptr1, len1, track_length);
    var v3 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
}

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}
/**
 * @returns {string}
 */
export function engine_version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.engine_version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {number} speed
 * @param {number} lane
 * @param {number} steer
 * @param {number} curve
 * @param {boolean} throttle
 * @param {boolean} brake
 * @param {boolean} stunned
 * @param {boolean} boost_active
 * @param {boolean} drifting
 * @param {number} drift_direction
 * @param {number} dt_ms
 * @returns {Float32Array}
 */
export function simulate_player_step(speed, lane, steer, curve, throttle, brake, stunned, boost_active, drifting, drift_direction, dt_ms) {
    const ret = wasm.simulate_player_step(speed, lane, steer, curve, throttle, brake, stunned, boost_active, drifting, drift_direction, dt_ms);
    var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
}

/**
 * @param {Float32Array} ai_inputs
 * @param {Float32Array} static_inputs
 * @param {Float32Array} dynamic_inputs
 * @param {number} track_length
 * @returns {Float32Array}
 */
export function simulate_ai_hazard_batch(ai_inputs, static_inputs, dynamic_inputs, track_length) {
    const ptr0 = passArrayF32ToWasm0(ai_inputs, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF32ToWasm0(static_inputs, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF32ToWasm0(dynamic_inputs, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.simulate_ai_hazard_batch(ptr0, len0, ptr1, len1, ptr2, len2, track_length);
    var v4 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v4;
}

/**
 * @param {number} finish_position
 * @param {number} total_racers
 * @param {number} total_time_ms
 * @param {number} nitro_pct
 * @returns {number}
 */
export function score_race(finish_position, total_racers, total_time_ms, nitro_pct) {
    const ret = wasm.score_race(finish_position, total_racers, total_time_ms, nitro_pct);
    return ret >>> 0;
}

/**
 * @param {number} player_distance
 * @param {number} player_lane
 * @param {number} player_speed
 * @param {number} current_steer
 * @param {number} previous_overtake_side
 * @param {Float32Array} ai_inputs
 * @param {number} track_length
 * @returns {Float32Array}
 */
export function compute_player_relations_batch(player_distance, player_lane, player_speed, current_steer, previous_overtake_side, ai_inputs, track_length) {
    const ptr0 = passArrayF32ToWasm0(ai_inputs, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compute_player_relations_batch(player_distance, player_lane, player_speed, current_steer, previous_overtake_side, ptr0, len0, track_length);
    var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}

/**
 * @param {Float32Array} inputs
 * @returns {Float32Array}
 */
export function simulate_ai_step_batch(inputs) {
    const ptr0 = passArrayF32ToWasm0(inputs, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.simulate_ai_step_batch(ptr0, len0);
    var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedFloat32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('qq_racer_engine_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
