import * as THREE from 'three';
import { Renderer } from '@/core/renderer/Renderer';
import { PostProcessing } from '@/core/renderer/PostProcessing';
import {
  detectQualityTier,
  getQualitySettings,
  nextQualityTier,
  type QualitySettings,
  type QualityTier,
} from '@/core/renderer/QualitySettings';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { InputManager } from '@/core/input/InputManager';
import { EventBus } from '@/core/events/EventBus';
import { DebugOverlay } from '@/core/debug/DebugOverlay';
import { Sky } from '@/art/Sky';
import { Materials } from '@/art/Materials';
import { updateFogColor } from '@/art/Fog';
import { WorldManager } from '@/world/WorldManager';
import { Machine } from '@/machine/Machine';
import { Player } from '@/player/Player';
import { PlayerCamera } from '@/player/PlayerCamera';
import { PlayerCombat } from '@/player/PlayerCombat';
import { EnemyManager } from '@/enemies/EnemyManager';
import { SandFX } from '@/fx/SandFX';
import { ImpactFX } from '@/fx/ImpactFX';
import { HUD } from '@/ui/HUD';
import { SaveManager } from '@/save/SaveManager';
import { CURRENT_SAVE_VERSION, type SaveGameV1 } from '@/save/SaveSchema';
import { GameLoop, type LoopCallbacks } from './GameLoop';
import { createGameState, type GameState } from './GameState';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  hudRoot: HTMLElement;
  seed?: string;
  qualityTier?: QualityTier;
  bypassPointerLock?: boolean;
  /** Free-fly camera for screenshots, disables the player rig. */
  freeCamera?: THREE.Vector3 | null;
  freeCameraTarget?: THREE.Vector3 | null;
}

/**
 * Owns every system and wires them together (handoff section 63).
 *
 * Update order in fixedUpdate is deliberate:
 *   player -> combat -> enemies -> machine -> world -> physics -> (FX at render)
 *
 * Physics steps last so it resolves the kinematic translations everything
 * upstream just requested.
 */
export class Game implements LoopCallbacks {
  readonly bus = new EventBus();
  readonly state: GameState;

  readonly renderer: Renderer;
  readonly physics: PhysicsWorld;
  readonly input: InputManager;
  readonly sky: Sky;
  readonly materials: Materials;
  readonly world: WorldManager;
  readonly machine: Machine;
  readonly player: Player;
  readonly playerCamera: PlayerCamera;
  readonly combat: PlayerCombat;
  readonly enemies: EnemyManager;
  readonly sandFX: SandFX;
  readonly impactFX: ImpactFX;
  readonly hud: HUD;
  readonly post: PostProcessing;
  readonly debug: DebugOverlay;
  readonly saves = new SaveManager();

  private readonly loop: GameLoop;
  private readonly clock = new THREE.Clock();
  private quality: QualitySettings;
  private readonly freeCamera: THREE.PerspectiveCamera | null = null;

  private frameCount = 0;
  private fpsWindowStart = 0;
  private fps = 0;
  private frameMs = 0;

  /** Rapier's wasm must be resolved before any physics object exists. */
  static async create(options: GameOptions): Promise<Game> {
    await initRapier();
    return new Game(options);
  }

  private constructor(private readonly options: GameOptions) {
    const seed = options.seed ?? 'mmf-default-seed';
    this.state = createGameState(seed);

    // Probe on a throwaway context so tier detection does not disturb the
    // real renderer's configuration.
    const probe = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
    this.quality = getQualitySettings(options.qualityTier ?? detectQualityTier(probe));
    probe.dispose();

    this.renderer = new Renderer(options.canvas, this.quality);
    this.physics = new PhysicsWorld();
    this.input = new InputManager(options.canvas, {
      bypassPointerLock: options.bypassPointerLock,
    });

    this.sky = new Sky(this.renderer.three);
    this.renderer.scene.add(this.sky.mesh);
    this.applySky();

    this.materials = new Materials();
    this.world = new WorldManager(
      this.renderer.scene,
      this.quality,
      this.bus,
      this.materials,
      seed,
    );
    this.world.setSunDirection(this.sky.direction);

    this.machine = new Machine(this.renderer.scene, this.physics, this.materials);
    this.player = new Player(
      this.renderer.scene,
      this.physics,
      this.bus,
      this.materials,
      this.machine.deckSpawn,
    );
    this.playerCamera = new PlayerCamera(window.innerWidth / window.innerHeight);
    this.renderer.extraCameras.push(this.playerCamera.camera);

    this.combat = new PlayerCombat(this.bus, this.physics);
    this.combat.setShooterCollider(this.player.collider);
    this.enemies = new EnemyManager(this.renderer.scene, this.physics, this.bus, this.materials);

    this.sandFX = new SandFX(this.renderer.scene, this.quality);
    this.impactFX = new ImpactFX(this.renderer.scene, this.bus, this.quality);

    if (options.freeCamera) {
      this.freeCamera = this.renderer.camera;
      this.freeCamera.position.copy(options.freeCamera);
      this.freeCamera.lookAt(options.freeCameraTarget ?? new THREE.Vector3(0, 2, -10));
    }

    this.post = new PostProcessing(
      this.renderer,
      this.renderer.scene,
      this.activeCamera,
      this.quality,
    );

    this.hud = new HUD(options.hudRoot, this.bus);
    this.debug = new DebugOverlay(options.hudRoot);

    this.bus.on('player:died', () => {
      this.state.playerDead = true;
    });
    this.bus.on('player:respawned', () => {
      this.state.playerDead = false;
    });

    window.addEventListener('resize', this.onResize);
    this.loop = new GameLoop(this);
  }

  get activeCamera(): THREE.PerspectiveCamera {
    return this.freeCamera ?? this.playerCamera.camera;
  }

  get isFreeCamera(): boolean {
    return this.freeCamera !== null;
  }

  start(): void {
    this.fpsWindowStart = performance.now();
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  fixedUpdate(dt: number): void {
    if (this.state.paused) return;
    this.state.simTime += dt;

    if (!this.freeCamera) {
      this.player.fixedUpdate(dt, this.input, this.playerCamera.yawAngle);
      this.playerCamera.fixedUpdate(
        dt,
        this.input,
        this.player.worldPosition,
        this.physics,
        this.player.collider,
      );
      this.combat.fixedUpdate(dt, this.input, this.playerCamera);
      this.enemies.fixedUpdate(dt, this.player.worldPosition, this.player.stats);
    }

    this.machine.fixedUpdate(dt);
    this.world.fixedUpdate(dt, this.machine.speed);

    // Last: resolve everything the kinematic bodies above just requested.
    this.physics.step();

    this.handleDebugKeys();
  }

  render(alpha: number): void {
    this.renderer.beginFrame();

    const frameDt = Math.min(this.clock.getDelta(), 0.1);
    const now = performance.now();

    this.player.update(alpha);
    this.enemies.update(alpha);

    const camera = this.activeCamera;
    this.sandFX.update(frameDt, this.machine.speed, camera.position);
    this.impactFX.update(frameDt, camera.position);
    this.world.update(this.clock.elapsedTime);

    if (this.sky.update(now)) this.applySky();

    this.hud.update({
      health: this.player.stats.health,
      maxHealth: this.player.stats.maxHealth,
      ammoInMag: this.combat.current.ammoInMag,
      reserveAmmo: this.combat.current.reserveAmmo,
      weaponName: this.combat.current.def.name,
      machineSpeed: this.machine.speed,
      distanceTraveled: this.world.distanceTraveled,
      spread: this.combat.currentSpread(this.playerCamera.isAiming),
      moving: this.player.speed > 0.1,
      pointerLocked: this.input.pointerLocked,
    });

    this.post.setCamera(camera);
    this.post.render(frameDt, this.renderer.scene, camera);

    this.tickFpsMeter(now);
    this.updateDebugOverlay(now);
    this.input.endFrame();
  }

  private applySky(): void {
    this.renderer.setEnvironment(this.sky.environment);
    this.renderer.setSunDirection(this.sky.direction);
    this.renderer.sun.color.copy(this.sky.sampleSunColor());
    updateFogColor(this.sky.sampleHorizonColor());
    this.world?.setSunDirection(this.sky.direction);
  }

  private tickFpsMeter(now: number): void {
    this.frameCount++;
    const elapsed = now - this.fpsWindowStart;
    if (elapsed >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameMs = elapsed / this.frameCount;
      this.frameCount = 0;
      this.fpsWindowStart = now;
    }
  }

  private updateDebugOverlay(now: number): void {
    const info = this.renderer.three.info;
    this.debug.update(now, {
      fps: this.fps,
      frameMs: this.frameMs,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length ?? 0,
      physicsBodies: this.physics.bodyCount,
      activeEnemies: this.enemies.activeCount,
      activeChunks: this.world.activeChunkCount,
      distance: this.world.distanceTraveled,
      machineSpeed: this.machine.speed,
      machineWeight: this.machine.movement.totalWeight,
      particles: this.sandFX.liveCount + this.impactFX.liveCount,
      quality: this.quality.tier,
      simTime: this.state.simTime,
      postBypassed: this.post.bypassed,
      godMode: this.state.godMode,
    });
  }

  // -------------------------------------------------------------------------
  // Debug actions (handoff section 57)
  // -------------------------------------------------------------------------

  private handleDebugKeys(): void {
    const d = this.pendingDebug;
    if (!d) return;
    this.pendingDebug = null;

    switch (d) {
      case 'overlay':
        this.debug.toggle();
        break;
      case 'spawn':
        this.spawnEnemyAhead();
        break;
      case 'ammo':
        this.combat.giveAmmo(120);
        break;
      case 'god':
        this.state.godMode = !this.state.godMode;
        this.player.stats.invulnerable = this.state.godMode;
        break;
      case 'skip':
        this.world.reset(this.world.distanceTraveled + 500);
        break;
      case 'quality':
        this.setQuality(nextQualityTier(this.quality.tier));
        break;
      case 'post':
        this.post.setBypassed(!this.post.bypassed);
        break;
      case 'time':
        this.timeOfDay = (this.timeOfDay + 0.12) % 1;
        this.sky.setTimeOfDay(this.timeOfDay);
        break;
      case 'save':
        void this.saveTo('quicksave');
        break;
      case 'load':
        void this.loadFrom('quicksave');
        break;
    }
  }

  private pendingDebug:
    | 'overlay'
    | 'spawn'
    | 'ammo'
    | 'god'
    | 'skip'
    | 'quality'
    | 'post'
    | 'time'
    | 'save'
    | 'load'
    | null = null;

  private timeOfDay = 0.5;

  /** Called from the keydown listener installed by main. */
  queueDebugAction(action: NonNullable<Game['pendingDebug']>): void {
    this.pendingDebug = action;
  }

  spawnEnemyAhead(distance = 9): void {
    const camera = this.activeCamera;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    this.enemies.spawn('scavenger', {
      x: camera.position.x + forward.x * distance,
      y: this.player.worldPosition.y,
      z: camera.position.z + forward.z * distance,
    } as THREE.Vector3);
  }

  setQuality(tier: QualityTier): void {
    this.quality = getQualitySettings(tier);
    this.renderer.applyQuality(this.quality);
    this.post.applyQuality(this.quality);
  }

  // -------------------------------------------------------------------------
  // Save / load
  // -------------------------------------------------------------------------

  buildSave(): SaveGameV1 {
    const p = this.player.worldPosition;
    return {
      version: CURRENT_SAVE_VERSION as 1,
      savedAt: Date.now(),
      seed: this.state.seed,
      distanceTraveled: this.world.distanceTraveled,
      player: {
        position: { x: p.x, y: p.y, z: p.z },
        health: this.player.stats.health,
        inventory: [],
        equipment: {
          currentWeapon: this.combat.current.def.id,
          weapons: [
            {
              id: this.combat.current.def.id,
              ammoInMag: this.combat.current.ammoInMag,
              reserveAmmo: this.combat.current.reserveAmmo,
            },
          ],
        },
      },
      machine: {
        structures: [],
        devices: [],
        fuel: 100,
        coreHealth: 100,
        navigationTier: 0,
      },
      progression: { unlocks: [] },
      world: {
        chunkIndex: Math.floor(this.world.distanceTraveled / 64),
        threatDirector: null,
      },
    };
  }

  async saveTo(slot: string): Promise<void> {
    await this.saves.save(slot, this.buildSave());
    this.bus.emit('game:save-written', { slot });
  }

  async loadFrom(slot: string): Promise<boolean> {
    const save = await this.saves.load(slot);
    if (!save) return false;

    // Distance drives everything about the world, so restoring it regenerates
    // the identical chunks — nothing about the world itself is stored.
    this.world.reset(save.distanceTraveled);

    this.player.teleport(
      new THREE.Vector3(save.player.position.x, save.player.position.y, save.player.position.z),
    );
    this.player.stats.reset();
    this.enemies.despawnAll();

    this.combat.equip(save.player.equipment.currentWeapon);
    const weaponSave = save.player.equipment.weapons[0];
    if (weaponSave) {
      this.combat.current.ammoInMag = weaponSave.ammoInMag;
      this.combat.current.reserveAmmo = weaponSave.reserveAmmo;
    }

    this.bus.emit('game:save-loaded', { slot });
    return true;
  }

  private readonly onResize = (): void => {
    this.post.resize(window.innerWidth, window.innerHeight);
    this.sandFX.onResize();
    this.impactFX.onResize();
  };

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.loop.stop();
    this.input.dispose();
    this.hud.dispose();
    this.post.dispose();
    this.enemies.despawnAll();
    this.world.dispose();
    this.sandFX.dispose();
    this.impactFX.dispose();
    this.materials.dispose();
    this.sky.dispose();
    this.physics.dispose();
    this.renderer.dispose();
    void this.options;
  }
}
