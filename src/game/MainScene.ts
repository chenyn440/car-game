import Phaser from 'phaser';
import { gameBus } from './events';
import { GAME_EVENTS, type HudPayload, type PlayerState, type RuntimeState, type RunResult, type UpgradeOption } from '../types';

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 540;
const STAGE_DURATION_MS = 90_000;
const UPGRADE_MOMENTS = [30_000, 60_000];
const BASE_FIRE_COOLDOWN_MS = 320;
const INVULNERABLE_WINDOW_MS = 380;
const CONTACT_DAMAGE_FACTOR = 0.45;
const STAGE_CLEAR_HEAL = 18;
const STAGE_CLEAR_SHIELD = 10;
const ENEMY_CAP_BY_STAGE = [0, 16, 22, 28];
const AI_UPDATE_INTERVAL_MS = 75;
const UPGRADE_TIMEOUT_MS = 12_000;
const MAX_ENEMIES = 96;
const MAX_PLAYER_BULLETS = 72;
const MAX_ENEMY_BULLETS = 84;

type EnemyKind = 'charger' | 'shooter' | 'tank' | 'boss';

interface EnemySpec {
  hp: number;
  speed: number;
  damage: number;
  score: number;
  shotIntervalMs?: number;
  texture: string;
}

interface SceneInitData {
  playerName?: string;
  runId?: string;
}

export class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private enemies!: Phaser.Physics.Arcade.Group;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  private playerState: PlayerState = {
    hp: 100,
    maxHp: 100,
    speed: 230,
    damage: 12,
    critRate: 0.06,
    lifesteal: 0,
    shield: 0,
  };

  private runtimeState: RuntimeState = {
    fireCooldownMs: BASE_FIRE_COOLDOWN_MS,
    bulletPierce: 0,
  };

  private readonly upgradePool: UpgradeOption[] = [
    {
      id: 'fire-rate',
      label: '涡轮扳机',
      description: '射速 +20%',
      apply: (state) => ({ ...state }),
    },
    {
      id: 'pierce',
      label: '穿甲弹',
      description: '子弹穿透 +1',
      apply: (state) => ({ ...state }),
    },
    {
      id: 'crit-rate',
      label: '精准模块',
      description: '暴击率 +10%',
      apply: (state) => ({ ...state, critRate: Math.min(0.95, state.critRate + 0.1) }),
    },
    {
      id: 'lifesteal',
      label: '吸能核心',
      description: '吸血 +3%',
      apply: (state) => ({ ...state, lifesteal: state.lifesteal + 0.03 }),
    },
    {
      id: 'move-speed',
      label: '机动推进',
      description: '移速 +15%',
      apply: (state) => ({ ...state, speed: state.speed * 1.15 }),
    },
    {
      id: 'shield',
      label: '应急护盾',
      description: '护盾 +20',
      apply: (state) => ({ ...state, shield: state.shield + 20 }),
    },
  ];

  private currentUpgradeOptions: UpgradeOption[] = [];
  private score = 0;
  private stage = 1;
  private stageElapsedMs = 0;
  private runElapsedMs = 0;
  private shootElapsedMs = 0;
  private aiElapsedMs = 0;
  private hudElapsedMs = 0;
  private upgradePendingMs = 0;
  private invulnerableMs = 0;
  private isRunEnded = false;
  private isUpgradePending = false;
  private bossActive = false;
  private playerName = 'Player';
  private runId = '';
  private spawnTimer?: Phaser.Time.TimerEvent;
  private triggeredUpgradeMarks = new Set<number>();
  private lastRuntimeErrorMs = 0;

  constructor() {
    super('main-scene');
  }

  public init(data: SceneInitData): void {
    this.playerName = data.playerName?.trim() || 'Player';
    this.runId = data.runId || `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

    this.playerState = {
      hp: 100,
      maxHp: 100,
      speed: 230,
      damage: 12,
      critRate: 0.06,
      lifesteal: 0,
      shield: 0,
    };

    this.runtimeState = {
      fireCooldownMs: BASE_FIRE_COOLDOWN_MS,
      bulletPierce: 0,
    };

    this.currentUpgradeOptions = [];
    this.score = 0;
    this.stage = 1;
    this.stageElapsedMs = 0;
    this.runElapsedMs = 0;
    this.shootElapsedMs = 0;
    this.aiElapsedMs = 0;
    this.hudElapsedMs = 0;
    this.upgradePendingMs = 0;
    this.invulnerableMs = 0;
    this.isRunEnded = false;
    this.isUpgradePending = false;
    this.bossActive = false;
    this.triggeredUpgradeMarks = new Set();
    this.lastRuntimeErrorMs = 0;
  }

  public create(): void {
    this.createTextures();

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor('#03111b');

    this.player = this.physics.add.sprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 'player');
    this.player.setCollideWorldBounds(true);

    this.enemies = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Sprite,
      maxSize: MAX_ENEMIES,
      runChildUpdate: false,
    });
    this.playerBullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: MAX_PLAYER_BULLETS,
      runChildUpdate: false,
    });
    this.enemyBullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: MAX_ENEMY_BULLETS,
      runChildUpdate: false,
    });

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input unavailable');
    }

    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as {
      up: Phaser.Input.Keyboard.Key;
      down: Phaser.Input.Keyboard.Key;
      left: Phaser.Input.Keyboard.Key;
      right: Phaser.Input.Keyboard.Key;
    };

    this.physics.add.overlap(this.playerBullets, this.enemies, this.onPlayerBulletHitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.enemyBullets, this.player, this.onEnemyBulletHitPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.enemies, this.player, this.onEnemyTouchPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);

    this.spawnTimer = this.time.addEvent({
      delay: 780,
      loop: true,
      callback: () => {
        try {
          if (!this.isRunEnded && !this.isUpgradePending && !this.bossActive) {
            this.spawnWave();
          }
        } catch (error) {
          this.handleRuntimeError(error);
        }
      },
    });

    gameBus.on(GAME_EVENTS.UPGRADE_PICKED, this.onUpgradePicked, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.pushHud();
    gameBus.emit(GAME_EVENTS.STAGE_MESSAGE, `第 ${this.stage} 关开始`);
  }

  public update(_time: number, delta: number): void {
    try {
      if (this.isRunEnded) {
        return;
      }

      if (this.physics.world.isPaused && !this.isUpgradePending) {
        this.physics.world.resume();
      }

      this.runElapsedMs += delta;
      this.hudElapsedMs += delta;

      if (this.invulnerableMs > 0) {
        this.invulnerableMs = Math.max(0, this.invulnerableMs - delta);
        if (this.invulnerableMs === 0) {
          this.player.clearTint();
        }
      }

      if (!this.isUpgradePending) {
        this.stageElapsedMs += delta;
        this.upgradePendingMs = 0;

        this.handleMovement();
        this.handlePlayerShoot(delta);
        this.aiElapsedMs += delta;
        if (this.aiElapsedMs >= AI_UPDATE_INTERVAL_MS) {
          this.updateEnemyAI(this.aiElapsedMs);
          this.aiElapsedMs = 0;
        }
        this.cleanupBullets();

        if (!this.bossActive) {
          this.checkUpgradeMoments();
          if (this.stageElapsedMs >= STAGE_DURATION_MS) {
            this.startBossFight();
          }
        }
      } else {
        this.upgradePendingMs += delta;
        if (this.upgradePendingMs >= UPGRADE_TIMEOUT_MS) {
          this.autoPickUpgrade();
        }
      }

      if (this.hudElapsedMs >= 120) {
        this.pushHud();
        this.hudElapsedMs = 0;
      }
    } catch (error) {
      this.handleRuntimeError(error);
    }
  }

  private onShutdown(): void {
    gameBus.off(GAME_EVENTS.UPGRADE_PICKED, this.onUpgradePicked, this);
    this.spawnTimer?.remove(false);
  }

  private createTextures(): void {
    if (this.textures.exists('player')) {
      return;
    }

    const g = this.add.graphics();

    g.fillStyle(0x14f0b5, 1);
    g.fillCircle(12, 12, 12);
    g.generateTexture('player', 24, 24);
    g.clear();

    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('bullet', 8, 8);
    g.clear();

    g.fillStyle(0xffa657, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('enemy-bullet', 8, 8);
    g.clear();

    g.fillStyle(0xff6361, 1);
    g.fillCircle(11, 11, 11);
    g.generateTexture('enemy-charger', 22, 22);
    g.clear();

    g.fillStyle(0xffad5a, 1);
    g.fillRect(0, 0, 22, 22);
    g.generateTexture('enemy-shooter', 22, 22);
    g.clear();

    g.fillStyle(0xa56bff, 1);
    g.fillCircle(14, 14, 14);
    g.generateTexture('enemy-tank', 28, 28);
    g.clear();

    g.fillStyle(0xf94144, 1);
    g.fillCircle(28, 28, 28);
    g.lineStyle(4, 0xfff1a8, 1);
    g.strokeCircle(28, 28, 24);
    g.generateTexture('enemy-boss', 56, 56);

    g.destroy();
  }

  private handleMovement(): void {
    if (!this.player.active) {
      return;
    }

    const left = this.keys.left.isDown || this.cursors.left.isDown;
    const right = this.keys.right.isDown || this.cursors.right.isDown;
    const up = this.keys.up.isDown || this.cursors.up.isDown;
    const down = this.keys.down.isDown || this.cursors.down.isDown;

    let vx = 0;
    let vy = 0;

    if (left) vx -= 1;
    if (right) vx += 1;
    if (up) vy -= 1;
    if (down) vy += 1;

    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    if (!body) {
      return;
    }
    if (vx === 0 && vy === 0) {
      body.setVelocity(0, 0);
    } else {
      const vector = new Phaser.Math.Vector2(vx, vy).normalize().scale(this.playerState.speed);
      body.setVelocity(vector.x, vector.y);
    }

    const pointer = this.input.activePointer;
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
    this.player.setRotation(angle + Math.PI / 2);
  }

  private handlePlayerShoot(delta: number): void {
    if (!this.player.active) {
      return;
    }

    this.shootElapsedMs += delta;
    if (this.shootElapsedMs < this.runtimeState.fireCooldownMs) {
      return;
    }

    this.shootElapsedMs = 0;
    this.firePlayerBullet();
  }

  private firePlayerBullet(): void {
    const pointer = this.input.activePointer;
    const bullet = this.playerBullets.get(this.player.x, this.player.y, 'bullet') as Phaser.Physics.Arcade.Image | null;
    if (!bullet) {
      return;
    }

    bullet.enableBody(true, this.player.x, this.player.y, true, true);
    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.setTexture('bullet');

    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
    const speed = 600;

    bullet.setRotation(angle);
    bullet.setDepth(2);
    bullet.setData('damage', this.playerState.damage);
    bullet.setData('remainingHits', 1 + this.runtimeState.bulletPierce);
    bullet.setData('expireAt', this.time.now + 1800);

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

    this.playerBullets.add(bullet, true);
  }

  private fireEnemyBullet(from: Phaser.Physics.Arcade.Sprite, speed = 260): void {
    if (!from.active) {
      return;
    }

    if (this.enemyBullets.countActive(true) >= MAX_ENEMY_BULLETS) {
      return;
    }

    const bullet = this.enemyBullets.get(from.x, from.y, 'enemy-bullet') as Phaser.Physics.Arcade.Image | null;
    if (!bullet) {
      return;
    }

    bullet.enableBody(true, from.x, from.y, true, true);
    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.setTexture('enemy-bullet');
    const angle = Phaser.Math.Angle.Between(from.x, from.y, this.player.x, this.player.y);

    bullet.setData('damage', from.getData('isBoss') ? 14 : 8);
    bullet.setData('expireAt', this.time.now + 2600);

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

    this.enemyBullets.add(bullet, true);
  }

  private cleanupBullets(): void {
    this.playerBullets.getChildren().forEach((obj) => {
      const bullet = obj as Phaser.Physics.Arcade.Image;
      if (!bullet.active) {
        return;
      }
      const expireAt = Number(bullet.getData('expireAt') ?? 0);
      if (this.time.now >= expireAt) {
        this.recycleBullet(bullet);
      }
    });

    this.enemyBullets.getChildren().forEach((obj) => {
      const bullet = obj as Phaser.Physics.Arcade.Image;
      if (!bullet.active) {
        return;
      }
      const expireAt = Number(bullet.getData('expireAt') ?? 0);
      if (this.time.now >= expireAt) {
        this.recycleBullet(bullet);
      }
    });
  }

  private spawnWave(): void {
    const tier = this.getCurrentTier();
    const enemyCap = this.getEnemyCap(tier);
    const activeEnemies = this.enemies.countActive(true);

    if (activeEnemies >= enemyCap) {
      return;
    }

    const capacityLeft = enemyCap - activeEnemies;
    const baseCount = this.stage === 1 ? 1 : 2;
    const spread = tier >= 3 ? 2 : 1;
    const spawnCount = Math.min(capacityLeft, Phaser.Math.Between(baseCount, baseCount + spread));
    const eliteChance = tier >= 3 ? 0.14 + (this.stage - 1) * 0.04 : 0;

    for (let i = 0; i < spawnCount; i += 1) {
      const kind = this.pickEnemyKind(tier);
      const elite = Math.random() < eliteChance;
      this.spawnEnemy(kind, tier, elite);
    }
  }

  private pickEnemyKind(tier: number): EnemyKind {
    const roll = Math.random();
    const chargerWeight = tier >= 4 ? 0.4 : 0.52;
    const shooterWeight = tier >= 4 ? 0.78 : 0.84;

    if (roll < chargerWeight) {
      return 'charger';
    }
    if (roll < shooterWeight) {
      return 'shooter';
    }
    return 'tank';
  }

  private getCurrentTier(): number {
    return 1 + Math.floor(this.stageElapsedMs / 20_000);
  }

  private getEnemyCap(tier: number): number {
    const stageCap = ENEMY_CAP_BY_STAGE[this.stage] ?? ENEMY_CAP_BY_STAGE[ENEMY_CAP_BY_STAGE.length - 1];
    return stageCap + (tier - 1) * 2;
  }

  private spawnEnemy(kind: EnemyKind, tier: number, elite: boolean): void {
    const position = this.randomSpawnPosition();
    const spec = this.getEnemySpec(kind, tier, elite);

    const enemy = this.enemies.get(position.x, position.y, spec.texture) as Phaser.Physics.Arcade.Sprite | null;
    if (!enemy) {
      return;
    }

    enemy.enableBody(true, position.x, position.y, true, true);
    enemy.setActive(true);
    enemy.setVisible(true);
    enemy.setTexture(spec.texture);
    enemy.setDepth(1);
    enemy.setData('kind', kind);
    enemy.setData('hp', spec.hp);
    enemy.setData('speed', spec.speed);
    enemy.setData('damage', spec.damage);
    enemy.setData('score', spec.score);
    enemy.setData('isBoss', kind === 'boss');
    enemy.setData('isElite', elite);
    enemy.setData('shotIntervalMs', spec.shotIntervalMs ?? 0);
    enemy.setData('shotTimerMs', Phaser.Math.Between(100, 800));
    enemy.setData('flashExpireAt', 0);
    enemy.setCollideWorldBounds(true);

    if (elite) {
      enemy.setScale(1.16);
      enemy.setTint(0xffe066);
    } else {
      enemy.setScale(1);
      enemy.clearTint();
    }

    this.enemies.add(enemy, true);
  }

  private randomSpawnPosition(): Phaser.Math.Vector2 {
    const side = Phaser.Math.Between(0, 3);

    if (side === 0) {
      return new Phaser.Math.Vector2(Phaser.Math.Between(0, WORLD_WIDTH), -20);
    }
    if (side === 1) {
      return new Phaser.Math.Vector2(WORLD_WIDTH + 20, Phaser.Math.Between(0, WORLD_HEIGHT));
    }
    if (side === 2) {
      return new Phaser.Math.Vector2(Phaser.Math.Between(0, WORLD_WIDTH), WORLD_HEIGHT + 20);
    }

    return new Phaser.Math.Vector2(-20, Phaser.Math.Between(0, WORLD_HEIGHT));
  }

  private getEnemySpec(kind: EnemyKind, tier: number, elite: boolean): EnemySpec {
    const stageScale = 1 + (this.stage - 1) * 0.22;
    const tierScale = 1 + (tier - 1) * 0.12;
    const hpMultiplier = stageScale * tierScale * (elite ? 1.5 : 1);
    const speedMultiplier = 1 + (this.stage - 1) * 0.08 + (tier - 1) * 0.04;
    const damageMultiplier = 1 + (this.stage - 1) * 0.15 + (tier - 1) * 0.1;

    const baseMap: Record<EnemyKind, EnemySpec> = {
      charger: {
        hp: 22,
        speed: 150,
        damage: 9,
        score: elite ? 50 : 10,
        texture: 'enemy-charger',
      },
      shooter: {
        hp: 18,
        speed: 92,
        damage: 7,
        score: elite ? 50 : 10,
        shotIntervalMs: 1250,
        texture: 'enemy-shooter',
      },
      tank: {
        hp: 56,
        speed: 64,
        damage: 13,
        score: elite ? 50 : 10,
        texture: 'enemy-tank',
      },
      boss: {
        hp: 420,
        speed: 84,
        damage: 18,
        score: 300,
        shotIntervalMs: 900,
        texture: 'enemy-boss',
      },
    };

    const base = baseMap[kind];
    return {
      hp: Math.round(base.hp * hpMultiplier),
      speed: Math.round(base.speed * speedMultiplier),
      damage: Math.max(1, Math.round(base.damage * damageMultiplier * (elite ? 1.1 : 1))),
      score: base.score,
      shotIntervalMs: base.shotIntervalMs ? Math.max(480, Math.round(base.shotIntervalMs * (elite ? 0.88 : 1))) : undefined,
      texture: base.texture,
    };
  }

  private updateEnemyAI(delta: number): void {
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) {
        return;
      }

      const kind = enemy.getData('kind') as EnemyKind;
      const speed = Number(enemy.getData('speed') ?? 80);
      const body = enemy.body as Phaser.Physics.Arcade.Body | null;
      if (!body) {
        return;
      }
      const flashExpireAt = Number(enemy.getData('flashExpireAt') ?? 0);
      if (flashExpireAt > 0 && this.time.now >= flashExpireAt) {
        enemy.setData('flashExpireAt', 0);
        if (enemy.getData('isElite')) {
          enemy.setTint(0xffe066);
        } else {
          enemy.clearTint();
        }
      }

      if (kind === 'shooter') {
        const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        if (distance > 250) {
          this.physics.moveToObject(enemy, this.player, speed);
        } else if (distance < 170) {
          const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
          body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        } else {
          body.setVelocity(0, 0);
        }
      } else {
        this.physics.moveToObject(enemy, this.player, speed);
      }

      const shotInterval = Number(enemy.getData('shotIntervalMs') ?? 0);
      if (shotInterval > 0) {
        const shotTimer = Number(enemy.getData('shotTimerMs') ?? 0) + delta;
        if (shotTimer >= shotInterval) {
          this.fireEnemyBullet(enemy, kind === 'boss' ? 300 : 240);
          enemy.setData('shotTimerMs', 0);
        } else {
          enemy.setData('shotTimerMs', shotTimer);
        }
      }
    });
  }

  private onPlayerBulletHitEnemy(bulletObj: Phaser.GameObjects.GameObject, enemyObj: Phaser.GameObjects.GameObject): void {
    const bullet = bulletObj as Phaser.Physics.Arcade.Image;
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;

    if (!bullet.active || !enemy.active || this.isRunEnded) {
      return;
    }

    const baseDamage = Number(bullet.getData('damage') ?? this.playerState.damage);
    const crit = Math.random() < this.playerState.critRate;
    const damage = crit ? baseDamage * 2 : baseDamage;

    this.applyDamageToEnemy(enemy, damage);
    if (crit) {
      this.blast(enemy.x, enemy.y, 0xfff1a8, 8);
    }

    if (this.playerState.lifesteal > 0) {
      const healed = damage * this.playerState.lifesteal;
      this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + healed);
    }

    const remainingHits = Number(bullet.getData('remainingHits') ?? 1) - 1;
    if (remainingHits <= 0) {
      this.recycleBullet(bullet);
    } else {
      bullet.setData('remainingHits', remainingHits);
    }
  }

  private applyDamageToEnemy(enemy: Phaser.Physics.Arcade.Sprite, damage: number): void {
    const hp = Number(enemy.getData('hp') ?? 1) - damage;

    if (hp > 0) {
      enemy.setData('hp', hp);
      enemy.setTintFill(0xffffff);
      enemy.setData('flashExpireAt', this.time.now + 60);
      return;
    }

    const isBoss = Boolean(enemy.getData('isBoss'));
    const addScore = Number(enemy.getData('score') ?? 10);
    this.score += addScore;

    if (isBoss || Math.random() < 0.45) {
      this.blast(enemy.x, enemy.y, isBoss ? 0xf9a03f : 0xffffff, isBoss ? 26 : 12);
    }
    this.recycleEnemy(enemy);

    if (isBoss) {
      this.onBossDefeated();
    }
  }

  private onEnemyBulletHitPlayer(bulletObj: Phaser.GameObjects.GameObject, playerObj: Phaser.GameObjects.GameObject): void {
    const bullet = bulletObj as Phaser.Physics.Arcade.Image;
    const player = playerObj as Phaser.Physics.Arcade.Sprite;
    if (!player.active) {
      return;
    }
    if (!bullet.active || this.isRunEnded) {
      return;
    }

    const damage = Number(bullet.getData('damage') ?? 8);
    this.takePlayerDamage(damage);
    this.recycleBullet(bullet);
  }

  private onEnemyTouchPlayer(enemyObj: Phaser.GameObjects.GameObject, playerObj: Phaser.GameObjects.GameObject): void {
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    const player = playerObj as Phaser.Physics.Arcade.Sprite;
    if (!player.active) {
      return;
    }
    if (!enemy.active || this.isRunEnded) {
      return;
    }

    const touchDamage = Number(enemy.getData('damage') ?? 10) * CONTACT_DAMAGE_FACTOR;
    this.takePlayerDamage(touchDamage);
  }

  private takePlayerDamage(amount: number): void {
    if (this.invulnerableMs > 0 || this.isUpgradePending) {
      return;
    }

    let remaining = amount;

    if (this.playerState.shield > 0) {
      const shieldAbsorb = Math.min(this.playerState.shield, remaining);
      this.playerState.shield -= shieldAbsorb;
      remaining -= shieldAbsorb;
    }

    if (remaining > 0) {
      this.playerState.hp -= remaining;
    }

    this.invulnerableMs = INVULNERABLE_WINDOW_MS;
    this.player.setTint(0xff6361);
    this.cameras.main.shake(90, 0.0035);

    if (this.playerState.hp <= 0) {
      this.playerState.hp = 0;
      this.endRun(false);
    }
  }

  private checkUpgradeMoments(): void {
    for (const mark of UPGRADE_MOMENTS) {
      if (this.stageElapsedMs >= mark && !this.triggeredUpgradeMarks.has(mark)) {
        this.triggeredUpgradeMarks.add(mark);
        this.offerUpgrade();
        return;
      }
    }
  }

  private offerUpgrade(): void {
    this.isUpgradePending = true;
    this.upgradePendingMs = 0;
    this.physics.world.pause();

    this.currentUpgradeOptions = Phaser.Utils.Array.Shuffle([...this.upgradePool]).slice(0, 3);
    gameBus.emit(GAME_EVENTS.UPGRADE_OFFERED, {
      stage: this.stage,
      options: this.currentUpgradeOptions.map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description,
      })),
    });
  }

  private onUpgradePicked = (upgradeId: string): void => {
    if (!this.isUpgradePending) {
      return;
    }

    const picked = this.currentUpgradeOptions.find((item) => item.id === upgradeId);
    if (!picked) {
      return;
    }

    this.playerState = picked.apply(this.playerState);

    if (upgradeId === 'fire-rate') {
      this.runtimeState.fireCooldownMs = Math.max(120, this.runtimeState.fireCooldownMs * 0.78);
    }

    if (upgradeId === 'pierce') {
      this.runtimeState.bulletPierce += 1;
    }

    this.isUpgradePending = false;
    this.upgradePendingMs = 0;
    this.currentUpgradeOptions = [];
    this.physics.world.resume();

    gameBus.emit(GAME_EVENTS.STAGE_MESSAGE, `已强化: ${picked.label}`);
    this.pushHud();
  };

  private autoPickUpgrade(): void {
    if (!this.isUpgradePending || this.currentUpgradeOptions.length === 0) {
      this.isUpgradePending = false;
      this.physics.world.resume();
      return;
    }

    this.onUpgradePicked(this.currentUpgradeOptions[0].id);
    gameBus.emit(GAME_EVENTS.STAGE_MESSAGE, '已自动选择强化并恢复战斗');
  }

  private handleRuntimeError(error: unknown): void {
    const now = this.time.now;
    if (now - this.lastRuntimeErrorMs < 500) {
      return;
    }
    this.lastRuntimeErrorMs = now;

    this.isUpgradePending = false;
    this.upgradePendingMs = 0;
    if (this.physics.world.isPaused) {
      this.physics.world.resume();
    }

    const message = error instanceof Error ? error.message : String(error);
    gameBus.emit(GAME_EVENTS.RUNTIME_ERROR, message);
  }

  private startBossFight(): void {
    this.bossActive = true;
    this.clearEnemies();
    this.clearEnemyBullets();
    this.spawnEnemy('boss', 2 + this.stage, false);
    gameBus.emit(GAME_EVENTS.STAGE_MESSAGE, 'Boss 来了，顶住！');
  }

  private onBossDefeated(): void {
    this.bossActive = false;
    this.cameras.main.shake(140, 0.006);
    this.cameras.main.flash(120, 255, 214, 160, false);

    if (this.stage >= 3) {
      this.endRun(true);
      return;
    }

    const previousHp = this.playerState.hp;
    this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + STAGE_CLEAR_HEAL);
    this.playerState.shield += STAGE_CLEAR_SHIELD;

    this.stage += 1;
    this.stageElapsedMs = 0;
    this.triggeredUpgradeMarks.clear();
    this.clearEnemies();
    this.clearEnemyBullets();
    const healed = Math.round(this.playerState.hp - previousHp);
    gameBus.emit(GAME_EVENTS.STAGE_MESSAGE, `进入第 ${this.stage} 关 (+${healed}HP / +${STAGE_CLEAR_SHIELD}盾)`);
  }

  private clearEnemies(): void {
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Phaser.Physics.Arcade.Sprite;
      if (enemy.active) {
        this.recycleEnemy(enemy);
      }
    });
  }

  private clearEnemyBullets(): void {
    this.enemyBullets.getChildren().forEach((obj) => {
      const bullet = obj as Phaser.Physics.Arcade.Image;
      if (bullet.active) {
        this.recycleBullet(bullet);
      }
    });
  }

  private recycleBullet(bullet: Phaser.Physics.Arcade.Image): void {
    const body = bullet.body as Phaser.Physics.Arcade.Body | null;
    body?.stop();
    bullet.disableBody(true, true);
  }

  private recycleEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    const body = enemy.body as Phaser.Physics.Arcade.Body | null;
    body?.stop();
    enemy.clearTint();
    enemy.disableBody(true, true);
  }

  private pushHud(): void {
    const payload: HudPayload = {
      hp: Math.max(0, this.playerState.hp),
      shield: Math.max(0, this.playerState.shield),
      stage: this.stage,
      score: this.score,
      stageTimeLeftSec: Math.max(0, Math.ceil((STAGE_DURATION_MS - this.stageElapsedMs) / 1000)),
    };

    gameBus.emit(GAME_EVENTS.HUD_UPDATE, payload);
  }

  private blast(x: number, y: number, color: number, radius: number): void {
    const circle = this.add.circle(x, y, radius, color, 0.85);
    this.tweens.add({
      targets: circle,
      alpha: 0,
      scale: 0.2,
      duration: 220,
      ease: 'Cubic.easeOut',
      onComplete: () => circle.destroy(),
    });
  }

  private endRun(won: boolean): void {
    if (this.isRunEnded) {
      return;
    }

    this.isRunEnded = true;
    this.physics.pause();
    this.spawnTimer?.remove(false);

    const hpBonus = Math.round((Math.max(0, this.playerState.hp) / this.playerState.maxHp) * 120);
    const clearBonus = won ? 200 : 0;
    const finalScore = this.score + hpBonus + clearBonus;

    const result: RunResult = {
      playerName: this.playerName,
      score: finalScore,
      stage: won ? 3 : this.stage,
      durationSec: Math.floor(this.runElapsedMs / 1000),
      runId: this.runId,
    };

    gameBus.emit(GAME_EVENTS.RUN_ENDED, { won, result });
  }
}
