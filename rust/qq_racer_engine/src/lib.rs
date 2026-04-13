#![deny(clippy::all)]

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

const VERSION: &str = "0.7.0";
const FIXED_STEP_MS: f32 = 1000.0 / 60.0;
const MAX_SPEED: f32 = 520.0;
const MIN_ROAD_X: f32 = -1.28;
const MAX_ROAD_X: f32 = 1.28;
const STATIC_OBSTACLE_HIT_LANE_THRESHOLD: f32 = 0.31;
const STATIC_OBSTACLE_NEAR_MISS_MIN: f32 = 0.27;
const STATIC_OBSTACLE_NEAR_MISS_MAX: f32 = 0.46;
const DYNAMIC_OBSTACLE_HIT_LANE_BASE: f32 = 0.27;

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn engine_version() -> String {
    VERSION.to_string()
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn score_race(
    finish_position: u32,
    total_racers: u32,
    total_time_ms: u32,
    nitro_pct: u32,
) -> u32 {
    let total = total_racers.max(2);
    let position = finish_position.clamp(1, total);

    let position_score = match position {
        1 => 6800,
        2 => 5100,
        3 => 3600,
        4 => 2600,
        5 => 1800,
        6 => 1000,
        7 => 600,
        _ => 350,
    };

    let time_score = 8200_i32.saturating_sub((total_time_ms / 13) as i32).max(0) as u32;
    let nitro_score = nitro_pct.min(100) * 12;

    position_score + time_score + nitro_score
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn simulate_player_step(
    speed: f32,
    lane: f32,
    steer: f32,
    curve: f32,
    throttle: bool,
    brake: bool,
    stunned: bool,
    boost_active: bool,
    drifting: bool,
    drift_direction: f32,
    dt_ms: f32,
) -> Box<[f32]> {
    let mut acc = -210.0_f32;
    let speed_ratio = if MAX_SPEED > 0.0 {
        (speed / MAX_SPEED).clamp(0.0, 1.25)
    } else {
        0.0
    };

    if throttle {
        acc += 760.0;
    }
    if brake {
        acc -= 720.0;
    }
    if stunned {
        acc -= 380.0;
    }
    if drifting {
        acc -= 80.0;
    }
    if boost_active {
        acc += 340.0;
    }

    let dt_sec = (dt_ms.max(0.0)) / 1000.0;
    let mut next_speed = (speed + acc * dt_sec).clamp(0.0, MAX_SPEED * 1.2);
    if !brake && throttle && next_speed < 30.0 {
        next_speed = 30.0;
    }

    let steer_power =
        (steer + drift_direction * if drifting { 0.18 } else { 0.0 }) * (0.78 + speed_ratio * 0.52);
    let mut next_lane = lane + steer_power * dt_sec * 1.6;
    next_lane -= curve * speed_ratio * dt_sec * 2.6;

    if next_lane < MIN_ROAD_X || next_lane > MAX_ROAD_X {
        next_speed *= 0.982;
    }
    next_lane = next_lane.clamp(-1.6, 1.6);

    vec![next_speed, next_lane].into_boxed_slice()
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn simulate_ai_step(
    speed: f32,
    lane: f32,
    target_lane: f32,
    target_speed: f32,
    ai_risk: f32,
    lane_profile_mul: f32,
    dt_ms: f32,
    blocked: bool,
    stunned: bool,
    choke_min: f32,
    choke_max: f32,
    has_choke: bool,
    cliff_gust: f32,
) -> Box<[f32]> {
    let (next_speed, next_lane) = simulate_ai_step_core(
        speed,
        lane,
        target_lane,
        target_speed,
        ai_risk,
        lane_profile_mul,
        dt_ms,
        blocked,
        stunned,
        choke_min,
        choke_max,
        has_choke,
        cliff_gust,
    );

    vec![next_speed, next_lane].into_boxed_slice()
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn simulate_ai_step_batch(inputs: Box<[f32]>) -> Box<[f32]> {
    const STRIDE: usize = 13;
    if inputs.is_empty() || inputs.len() % STRIDE != 0 {
        return Vec::<f32>::new().into_boxed_slice();
    }

    let count = inputs.len() / STRIDE;
    let mut out = Vec::with_capacity(count * 2);

    for idx in 0..count {
        let base = idx * STRIDE;
        let (next_speed, next_lane) = simulate_ai_step_core(
            inputs[base + 0],
            inputs[base + 1],
            inputs[base + 2],
            inputs[base + 3],
            inputs[base + 4],
            inputs[base + 5],
            inputs[base + 6],
            inputs[base + 7] > 0.5,
            inputs[base + 8] > 0.5,
            inputs[base + 9],
            inputs[base + 10],
            inputs[base + 11] > 0.5,
            inputs[base + 12],
        );
        out.push(next_speed);
        out.push(next_lane);
    }

    out.into_boxed_slice()
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn simulate_ai_hazard_batch(
    ai_inputs: Box<[f32]>,
    static_inputs: Box<[f32]>,
    dynamic_inputs: Box<[f32]>,
    track_length: f32,
) -> Box<[f32]> {
    const AI_STRIDE: usize = 4;
    const STATIC_STRIDE: usize = 2;
    const DYNAMIC_STRIDE: usize = 3;
    if ai_inputs.is_empty()
        || ai_inputs.len() % AI_STRIDE != 0
        || (!static_inputs.is_empty() && static_inputs.len() % STATIC_STRIDE != 0)
        || (!dynamic_inputs.is_empty() && dynamic_inputs.len() % DYNAMIC_STRIDE != 0)
        || track_length <= 0.0
    {
        return Vec::<f32>::new().into_boxed_slice();
    }

    let ai_count = ai_inputs.len() / AI_STRIDE;
    let static_count = static_inputs.len() / STATIC_STRIDE;
    let dynamic_count = dynamic_inputs.len() / DYNAMIC_STRIDE;

    let mut out = Vec::with_capacity(ai_count * 3);
    for ai_idx in 0..ai_count {
        let base = ai_idx * AI_STRIDE;
        let ai_distance = ai_inputs[base];
        let ai_lane = ai_inputs[base + 1];
        let ai_risk = ai_inputs[base + 2];
        let packed_flags = ai_inputs[base + 3].round() as i32;
        let is_rival = (packed_flags & 1) != 0;
        let is_aggressive = (packed_flags & 2) != 0;

        let mut lane_delta = 0.0_f32;
        let mut static_hit_idx = -1_i32;
        let mut static_hit_rel_abs = f32::MAX;

        for idx in 0..static_count {
            let si = idx * STATIC_STRIDE;
            let local_distance = static_inputs[si];
            let obstacle_lane = static_inputs[si + 1];
            let obstacle_world = to_nearest_world_distance(local_distance, ai_distance, track_length);
            let rel = obstacle_world - ai_distance;
            let lane_diff = ai_lane - obstacle_lane;
            let abs_lane_diff = lane_diff.abs();

            if rel > 18.0 && rel < 180.0 && abs_lane_diff < 0.34 {
                let dir = if lane_diff >= 0.0 { 1.0 } else { -1.0 };
                let mag = if is_aggressive { 0.011 } else { 0.013 } * if is_rival { 1.12 } else { 1.0 };
                lane_delta += dir * mag;
            }

            let abs_rel = rel.abs();
            if abs_rel < 64.0 && abs_lane_diff < 0.2 && abs_rel < static_hit_rel_abs {
                static_hit_rel_abs = abs_rel;
                static_hit_idx = idx as i32;
            }
        }

        let mut dynamic_hit_idx = -1_i32;
        let mut dynamic_hit_rel_abs = f32::MAX;
        for idx in 0..dynamic_count {
            let di = idx * DYNAMIC_STRIDE;
            let local_distance = dynamic_inputs[di];
            let obstacle_lane = dynamic_inputs[di + 1];
            let obstacle_size = dynamic_inputs[di + 2];
            let obstacle_world = to_nearest_world_distance(local_distance, ai_distance, track_length);
            let rel = obstacle_world - ai_distance;
            let lane_diff = ai_lane - obstacle_lane;
            let abs_lane_diff = lane_diff.abs();
            let avoid_range = 0.3 + obstacle_size * 0.04;
            let hit_range = 0.16 + obstacle_size * 0.03;

            if rel > 18.0 && rel < 165.0 && abs_lane_diff < avoid_range {
                let dir = if lane_diff >= 0.0 { 1.0 } else { -1.0 };
                let mag = (0.006 + ai_risk * 0.008) * if is_rival { 1.14 } else { 1.0 };
                lane_delta += dir * mag;
            }

            let abs_rel = rel.abs();
            if abs_rel < 56.0 && abs_lane_diff < hit_range && abs_rel < dynamic_hit_rel_abs {
                dynamic_hit_rel_abs = abs_rel;
                dynamic_hit_idx = idx as i32;
            }
        }

        out.push(lane_delta);
        out.push(static_hit_idx as f32);
        out.push(dynamic_hit_idx as f32);
    }

    out.into_boxed_slice()
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn detect_player_static_hazards_batch(
    player_distance: f32,
    player_lane: f32,
    player_speed: f32,
    player_air_ms: f32,
    static_inputs: Box<[f32]>,
    track_length: f32,
) -> Box<[f32]> {
    const STATIC_STRIDE: usize = 2;
    if static_inputs.is_empty() || static_inputs.len() % STATIC_STRIDE != 0 || track_length <= 0.0 {
        return Vec::<f32>::new().into_boxed_slice();
    }

    let count = static_inputs.len() / STATIC_STRIDE;
    let mut out = Vec::with_capacity(count);
    for idx in 0..count {
        let base = idx * STATIC_STRIDE;
        let local_distance = static_inputs[base];
        let obstacle_lane = static_inputs[base + 1];
        let obstacle_world = to_nearest_world_distance(local_distance, player_distance, track_length);
        let rel = obstacle_world - player_distance;
        let lane_diff = (player_lane - obstacle_lane).abs();
        let mut state = 0.0_f32;

        if rel >= -70.0 && rel <= 120.0 {
            if rel.abs() < 72.0 && lane_diff < STATIC_OBSTACLE_HIT_LANE_THRESHOLD && player_air_ms <= 0.0 {
                state = 1.0;
            } else if lane_diff >= STATIC_OBSTACLE_NEAR_MISS_MIN
                && lane_diff < STATIC_OBSTACLE_NEAR_MISS_MAX
                && rel > -22.0
                && rel < 90.0
                && player_speed > 145.0
            {
                state = 2.0;
            }
        }
        out.push(state);
    }
    out.into_boxed_slice()
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn detect_player_dynamic_hazards_batch(
    player_distance: f32,
    player_lane: f32,
    player_speed: f32,
    player_air_ms: f32,
    dynamic_inputs: Box<[f32]>,
    track_length: f32,
) -> Box<[f32]> {
    const DYNAMIC_STRIDE: usize = 3;
    if dynamic_inputs.is_empty() || dynamic_inputs.len() % DYNAMIC_STRIDE != 0 || track_length <= 0.0 {
        return Vec::<f32>::new().into_boxed_slice();
    }

    let count = dynamic_inputs.len() / DYNAMIC_STRIDE;
    let mut out = Vec::with_capacity(count);
    for idx in 0..count {
        let base = idx * DYNAMIC_STRIDE;
        let local_distance = dynamic_inputs[base];
        let obstacle_lane = dynamic_inputs[base + 1];
        let obstacle_size = dynamic_inputs[base + 2];
        let obstacle_world = to_nearest_world_distance(local_distance, player_distance, track_length);
        let rel = obstacle_world - player_distance;
        let lane_diff = (player_lane - obstacle_lane).abs();
        let hit_lane_threshold = DYNAMIC_OBSTACLE_HIT_LANE_BASE + obstacle_size * 0.02;
        let mut state = 0.0_f32;

        if rel >= -50.0 && rel <= 120.0 {
            if rel.abs() < 64.0 && lane_diff < hit_lane_threshold && player_air_ms <= 0.0 {
                state = 1.0;
            } else if rel > -12.0 && rel < 84.0 && lane_diff < hit_lane_threshold + 0.1 && player_speed > 165.0 {
                state = 2.0;
            }
        }
        out.push(state);
    }
    out.into_boxed_slice()
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn detect_player_interactions_batch(
    player_distance: f32,
    player_lane: f32,
    ai_inputs: Box<[f32]>,
    trap_inputs: Box<[f32]>,
    track_length: f32,
) -> Box<[f32]> {
    const AI_STRIDE: usize = 2;
    const TRAP_STRIDE: usize = 3;
    if track_length <= 0.0
        || (!ai_inputs.is_empty() && ai_inputs.len() % AI_STRIDE != 0)
        || (!trap_inputs.is_empty() && trap_inputs.len() % TRAP_STRIDE != 0)
    {
        return Vec::<f32>::new().into_boxed_slice();
    }

    let mut car_hit_idx = -1_i32;
    let mut car_hit_dist = 0.0_f32;
    let ai_count = ai_inputs.len() / AI_STRIDE;
    for idx in 0..ai_count {
        let base = idx * AI_STRIDE;
        let ai_distance = ai_inputs[base];
        let ai_lane = ai_inputs[base + 1];
        let dist = normalize_distance_with_track(ai_distance - player_distance, track_length);
        if dist.abs() < 64.0 && (ai_lane - player_lane).abs() < 0.18 {
            car_hit_idx = idx as i32;
            car_hit_dist = dist;
            break;
        }
    }

    let mut trap_hit_idx = -1_i32;
    let mut trap_hit_dist = 0.0_f32;
    let trap_count = trap_inputs.len() / TRAP_STRIDE;
    for idx in 0..trap_count {
        let base = idx * TRAP_STRIDE;
        let trap_distance = trap_inputs[base];
        let trap_lane = trap_inputs[base + 1];
        let is_enemy = trap_inputs[base + 2] > 0.5;
        if !is_enemy {
            continue;
        }
        let dist = normalize_distance_with_track(player_distance - trap_distance, track_length);
        if dist.abs() < 54.0 && (player_lane - trap_lane).abs() < 0.2 {
            trap_hit_idx = idx as i32;
            trap_hit_dist = dist;
            break;
        }
    }

    vec![
        car_hit_idx as f32,
        car_hit_dist,
        trap_hit_idx as f32,
        trap_hit_dist,
    ]
    .into_boxed_slice()
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn compute_player_relations_batch(
    player_distance: f32,
    player_lane: f32,
    player_speed: f32,
    current_steer: f32,
    previous_overtake_side: f32,
    ai_inputs: Box<[f32]>,
    track_length: f32,
) -> Box<[f32]> {
    const AI_STRIDE: usize = 3;
    if track_length <= 0.0 || ai_inputs.is_empty() || ai_inputs.len() % AI_STRIDE != 0 {
        return vec![0.0, -1.0, 0.0, if previous_overtake_side >= 0.0 { 1.0 } else { -1.0 }].into_boxed_slice();
    }

    let ai_count = ai_inputs.len() / AI_STRIDE;

    let mut draft_best_idx = -1_i32;
    let mut draft_best_dist = f32::MAX;
    let mut draft_best_lane_diff = 0.0_f32;
    for idx in 0..ai_count {
        let base = idx * AI_STRIDE;
        let ai_distance = ai_inputs[base];
        let ai_lane = ai_inputs[base + 1];
        let dist = normalize_distance_with_track(ai_distance - player_distance, track_length);
        if dist < 42.0 || dist > 380.0 {
            continue;
        }
        let lane_diff = (ai_lane - player_lane).abs();
        if lane_diff > 0.24 {
            continue;
        }
        if dist < draft_best_dist {
            draft_best_dist = dist;
            draft_best_lane_diff = lane_diff;
            draft_best_idx = idx as i32;
        }
    }

    let mut draft_intensity = 0.0_f32;
    if draft_best_idx >= 0 && player_speed >= 120.0 {
        let dist_score = 1.0 - ((draft_best_dist - 42.0) / (380.0 - 42.0)).clamp(0.0, 1.0);
        let lane_score = 1.0 - (draft_best_lane_diff / 0.24).clamp(0.0, 1.0);
        draft_intensity = (0.45 + dist_score * 0.38 + lane_score * 0.35).clamp(0.0, 1.2);
    }

    let mut overtake_best_intensity = 0.0_f32;
    let mut overtake_best_distance = f32::MAX;
    let mut overtake_best_side = if previous_overtake_side >= 0.0 { 1.0 } else { -1.0 };
    for idx in 0..ai_count {
        let base = idx * AI_STRIDE;
        let ai_distance = ai_inputs[base];
        let ai_lane = ai_inputs[base + 1];
        let ai_speed = ai_inputs[base + 2];

        let rel = normalize_distance_with_track(ai_distance - player_distance, track_length);
        if rel <= 10.0 || rel > 260.0 {
            continue;
        }

        let lane_delta = ai_lane - player_lane;
        let lane_gap = lane_delta.abs();
        if lane_gap > 0.66 {
            continue;
        }

        let dist_factor = 1.0 - ((rel - 10.0) / 250.0).clamp(0.0, 1.0);
        let lane_factor = 1.0 - (lane_gap / 0.66).clamp(0.0, 1.0);
        let closing_factor = ((player_speed - ai_speed + 50.0) / 210.0).clamp(0.0, 1.0);
        let intensity = (dist_factor * 0.62 + lane_factor * 0.28 + closing_factor * 0.24).clamp(0.0, 1.0);

        if intensity > overtake_best_intensity
            || ((intensity - overtake_best_intensity).abs() < 0.02 && rel < overtake_best_distance)
        {
            overtake_best_intensity = intensity;
            overtake_best_distance = rel;
            if lane_delta > 0.01 {
                overtake_best_side = 1.0;
            } else if lane_delta < -0.01 {
                overtake_best_side = -1.0;
            } else {
                overtake_best_side = if current_steer >= 0.0 { 1.0 } else { -1.0 };
            }
        }
    }

    vec![
        draft_intensity,
        draft_best_idx as f32,
        overtake_best_intensity,
        overtake_best_side,
    ]
    .into_boxed_slice()
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn select_nearest_ahead_target_index(
    user_distance: f32,
    candidate_distances: Box<[f32]>,
    max_distance: f32,
    track_length: f32,
) -> i32 {
    if track_length <= 0.0 || max_distance <= 0.0 || candidate_distances.is_empty() {
        return -1;
    }

    let mut best_idx = -1_i32;
    let mut best_dist = f32::MAX;
    for (idx, candidate_distance) in candidate_distances.iter().enumerate() {
        let dist = normalize_distance_with_track(*candidate_distance - user_distance, track_length);
        if dist > 0.0 && dist < max_distance && dist < best_dist {
            best_dist = dist;
            best_idx = idx as i32;
        }
    }
    best_idx
}

fn to_nearest_world_distance(local_distance: f32, reference_distance: f32, track_length: f32) -> f32 {
    let base_lap = (reference_distance / track_length).floor() * track_length;
    let a = base_lap + local_distance;
    let b = a + track_length;
    let c = a - track_length;
    let da = (a - reference_distance).abs();
    let db = (b - reference_distance).abs();
    let dc = (c - reference_distance).abs();
    if da <= db && da <= dc {
        a
    } else if db <= da && db <= dc {
        b
    } else {
        c
    }
}

fn normalize_distance_with_track(distance: f32, track_length: f32) -> f32 {
    let half = track_length * 0.5;
    if distance > half {
        distance - track_length
    } else if distance < -half {
        distance + track_length
    } else {
        distance
    }
}

fn simulate_ai_step_core(
    speed: f32,
    lane: f32,
    target_lane: f32,
    target_speed: f32,
    ai_risk: f32,
    lane_profile_mul: f32,
    dt_ms: f32,
    blocked: bool,
    stunned: bool,
    choke_min: f32,
    choke_max: f32,
    has_choke: bool,
    cliff_gust: f32,
) -> (f32, f32) {
    let dt_ratio = (dt_ms.max(0.0)) / FIXED_STEP_MS;

    let lane_step = (0.015 + ai_risk * 0.015) * lane_profile_mul;
    let lane_delta = target_lane - lane;
    let mut next_lane = lane + lane_delta.clamp(-lane_step, lane_step) * dt_ratio;

    if has_choke {
        next_lane = next_lane.clamp(choke_min - 0.02, choke_max + 0.02);
    }

    let speed_rate = 0.013 + ai_risk * 0.005 + if blocked { 0.002 } else { 0.0 };
    let speed_diff = target_speed - speed;
    let mut next_speed = speed + (speed_diff * speed_rate).clamp(-20.0, 20.0) * dt_ratio;

    if stunned {
        next_speed *= 0.95;
    }
    next_speed = next_speed.clamp(66.0, MAX_SPEED * 1.08);

    next_lane += cliff_gust * 0.00042 * dt_ms;

    (next_speed, next_lane)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_version() {
        assert_eq!(engine_version(), "0.7.0");
    }

    #[test]
    fn score_is_positive() {
        assert!(score_race(1, 4, 60_000, 50) > 0);
    }

    #[test]
    fn step_returns_pair() {
        let result = simulate_player_step(120.0, 0.0, 0.2, 0.01, true, false, false, false, false, 0.0, 16.67);
        assert_eq!(result.len(), 2);
        assert!(result[0] > 120.0);
    }

    #[test]
    fn ai_step_returns_pair() {
        let result = simulate_ai_step(180.0, 0.1, 0.2, 220.0, 0.7, 1.0, 16.67, false, false, -0.6, 0.6, true, 0.0);
        assert_eq!(result.len(), 2);
        assert!(result[0] >= 66.0);
    }

    #[test]
    fn ai_step_batch_returns_pairs() {
        let input = vec![
            180.0, 0.1, 0.2, 220.0, 0.7, 1.0, 16.67, 0.0, 0.0, -0.6, 0.6, 1.0, 0.0,
            190.0, -0.2, -0.1, 210.0, 0.5, 0.9, 16.67, 1.0, 0.0, -0.4, 0.5, 1.0, 0.02,
        ];
        let result = simulate_ai_step_batch(input.into_boxed_slice());
        assert_eq!(result.len(), 4);
        assert!(result[0] >= 66.0);
        assert!(result[2] >= 66.0);
    }

    #[test]
    fn ai_hazard_batch_returns_triples() {
        let ai_inputs = vec![120.0, 0.2, 0.7, 3.0, 140.0, -0.1, 0.5, 0.0];
        let static_inputs = vec![130.0, 0.18, 240.0, -0.7];
        let dynamic_inputs = vec![150.0, 0.22, 1.0];
        let result = simulate_ai_hazard_batch(
            ai_inputs.into_boxed_slice(),
            static_inputs.into_boxed_slice(),
            dynamic_inputs.into_boxed_slice(),
            36_400.0,
        );
        assert_eq!(result.len(), 6);
    }

    #[test]
    fn player_static_hazard_batch_detects() {
        let static_inputs = vec![130.0, 0.18, 240.0, -0.7];
        let result = detect_player_static_hazards_batch(
            120.0,
            0.2,
            180.0,
            0.0,
            static_inputs.into_boxed_slice(),
            36_400.0,
        );
        assert_eq!(result.len(), 2);
        assert!(result[0] >= 1.0);
    }

    #[test]
    fn player_dynamic_hazard_batch_detects() {
        let dynamic_inputs = vec![130.0, 0.22, 1.0, 260.0, -0.8, 1.1];
        let result = detect_player_dynamic_hazards_batch(
            120.0,
            0.2,
            200.0,
            0.0,
            dynamic_inputs.into_boxed_slice(),
            36_400.0,
        );
        assert_eq!(result.len(), 2);
        assert!(result[0] >= 1.0);
    }

    #[test]
    fn player_interactions_batch_detects() {
        let ai_inputs = vec![132.0, 0.22, 260.0, -0.7];
        let trap_inputs = vec![110.0, 0.2, 1.0, 240.0, -0.8, 0.0];
        let result = detect_player_interactions_batch(
            120.0,
            0.2,
            ai_inputs.into_boxed_slice(),
            trap_inputs.into_boxed_slice(),
            36_400.0,
        );
        assert_eq!(result.len(), 4);
        assert!(result[0] >= 0.0);
        assert!(result[2] >= 0.0);
    }

    #[test]
    fn player_relations_batch_returns_metrics() {
        let ai_inputs = vec![
            180.0, 0.18, 160.0,
            240.0, -0.2, 170.0,
        ];
        let result = compute_player_relations_batch(
            120.0,
            0.2,
            190.0,
            0.0,
            1.0,
            ai_inputs.into_boxed_slice(),
            36_400.0,
        );
        assert_eq!(result.len(), 4);
    }

    #[test]
    fn select_nearest_target_index_works() {
        let candidate_distances = vec![300.0, 180.0, 900.0];
        let idx = select_nearest_ahead_target_index(120.0, candidate_distances.into_boxed_slice(), 820.0, 36_400.0);
        assert_eq!(idx, 1);
    }
}
