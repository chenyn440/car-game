import type { RunResult } from '../types';

export type RacerItem = 'rocket' | 'banana' | 'shield' | 'boost';

export interface EngineInitOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  mobile: boolean;
}

export interface RaceConfig {
  laps: number;
  aiCount: number;
  difficultyTier?: 'normal' | 'hard_mid' | 'hard_pro';
}

export interface InputState {
  steer: number;
  throttle: boolean;
  brake: boolean;
  drift: boolean;
  nitro: boolean;
  useItem: boolean;
  cameraToggle: boolean;
}

export interface HudState {
  speed: number;
  lap: number;
  totalLaps: number;
  position: number;
  totalRacers: number;
  progressPct: number;
  nitroPct: number;
  weather: string;
  heatPct: number;
  jammed: boolean;
  objectiveText: string;
  objectiveProgress: string;
  combo: number;
  styleScore: number;
  currentItem: RacerItem | null;
  raceTimeMs: number;
  countdownMs: number;
  racers: Array<{
    id: string;
    name: string;
    isPlayer: boolean;
    position: number;
    progressPct: number;
    lap: number;
    finished: boolean;
  }>;
}

export interface RaceResult {
  playerName: string;
  finishPosition: number;
  totalRacers: number;
  totalTimeMs: number;
  bestLapMs: number;
  styleScore: number;
  bestCombo: number;
  score: number;
  runId: string;
}

export type EngineEvent =
  | { type: 'hud_update'; payload: HudState }
  | { type: 'item_changed'; payload: { item: RacerItem | null } }
  | { type: 'message'; payload: { text: string } }
  | { type: 'runtime_error'; payload: { message: string } }
  | { type: 'race_finished'; payload: { result: RaceResult; leaderboard: RunResult } };

export interface RacingEngine {
  startRace(playerName: string, runId: string, config: RaceConfig): void;
  setInput(input: InputState): void;
  tick(nowMs: number): void;
  getAndClearEvents(): EngineEvent[];
  dispose(): void;
}
