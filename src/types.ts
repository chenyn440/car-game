export interface PlayerState {
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  critRate: number;
  lifesteal: number;
  shield: number;
}

export interface RuntimeState {
  fireCooldownMs: number;
  bulletPierce: number;
}

export interface UpgradeOption {
  id: string;
  label: string;
  description: string;
  apply: (state: PlayerState) => PlayerState;
}

export interface HudPayload {
  hp: number;
  shield: number;
  stage: number;
  score: number;
  stageTimeLeftSec: number;
}

export interface UpgradePayload {
  stage: number;
  options: Array<Pick<UpgradeOption, 'id' | 'label' | 'description'>>;
}

export interface RunResult {
  playerName: string;
  score: number;
  stage: number;
  durationSec: number;
  runId: string;
}

export interface RunEndPayload {
  won: boolean;
  result: RunResult;
}

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  score: number;
  stage: number;
  durationSec: number;
  createdAt: string;
}

export const GAME_EVENTS = {
  HUD_UPDATE: 'hud-update',
  STAGE_MESSAGE: 'stage-message',
  UPGRADE_OFFERED: 'upgrade-offered',
  UPGRADE_PICKED: 'upgrade-picked',
  RUN_ENDED: 'run-ended',
  RUNTIME_ERROR: 'runtime-error',
} as const;
