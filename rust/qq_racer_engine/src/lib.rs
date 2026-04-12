#![deny(clippy::all)]

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

const VERSION: &str = "0.3.0";
const MAX_SPEED: f32 = 520.0;
const CRUISE_SPEED: f32 = 132.0;
const MIN_ROAD_X: f32 = -1.28;
const MAX_ROAD_X: f32 = 1.28;

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
    if !throttle && !brake && speed < CRUISE_SPEED {
        acc += 190.0;
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
    if !brake && next_speed < 30.0 {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_version() {
        assert_eq!(engine_version(), "0.3.0");
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
}
