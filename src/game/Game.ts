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
import { EnemySpawner, type Bounds, type Vec3Like } from '@/enemies/EnemySpawner';
import { SandFX } from '@/fx/SandFX';
import { ImpactFX } from '@/fx/ImpactFX';
import { HUD } from '@/ui/HUD';
import { SaveManager } from '@/save/SaveManager';
import { Container } from '@/items/Container';
import { ResourceAccess } from '@/items/ResourceAccess';
import {
  ITEMS,
  PLAYER_INVENTORY_SLOTS,
  STARTING_INVENTORY,
  type ItemId,
} from '@/data/items';
import { CraftingSystem } from '@/crafting/CraftingSystem';
import { recipeById, type Recipe, type StationId } from '@/data/recipes';
import { InteractionSystem, INTERACT_REACH, type Interactable } from '@/interaction/InteractionSystem';
import { InventoryUI } from '@/ui/InventoryUI';
import { BuildSystem } from '@/building/BuildSystem';
import { BuildPreview } from '@/building/BuildPreview';
import { BuildUI } from '@/ui/BuildUI';
import { BUILD_PIECES, BUILD_PIECE_ORDER, type PieceId } from '@/data/build-pieces';
import { countEnclosed } from '@/building/RoomDetector';
import { cellKey, worldToCell } from '@/building/BuildGrid';
import { GRID_LEVELS, DECK_HEIGHT, LEVEL_HEIGHT } from '@/game/constants';
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
  /** Distance-driven arrivals. Off for harnesses that must travel undisturbed. */
  enemySpawns?: boolean;
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
  readonly spawner: EnemySpawner;
  /** Mutable so a harness can arm it for the one section that tests it. */
  enemySpawnsEnabled: boolean;
  /**
   * Level-0 grid keys `machine.equipmentCells` occupies, precomputed once —
   * equipment never moves after construction, so re-deriving this per spawn
   * would be pure waste. Arrivals must never land in one of these cells (the
   * prow, the engine block): a kinematic enemy spawned inside a fixed
   * collider gets no depenetration and embeds permanently.
   */
  private readonly blockedSpawnCellKeys: Set<string>;
  readonly sandFX: SandFX;
  readonly impactFX: ImpactFX;
  readonly hud: HUD;
  readonly post: PostProcessing;
  readonly debug: DebugOverlay;
  readonly saves = new SaveManager();
  /** What the player carries. Crates hold their own. */
  readonly inventory = new Container(PLAYER_INVENTORY_SLOTS);
  readonly resources: ResourceAccess;
  readonly build: BuildSystem;
  readonly buildPreview: BuildPreview;
  readonly buildUI: BuildUI;
  readonly crafting: CraftingSystem;
  readonly interaction = new InteractionSystem(INTERACT_REACH);
  readonly inventoryUI: InventoryUI;

  buildMode = false;
  selectedPiece: PieceId = 'floor';
  buildRotation = 0;
  private buildLevel = 0;
  /** True once the wheel has been used, so the level stops auto-following. */
  private buildLevelPinned = false;

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
    this.spawner = new EnemySpawner(seed);
    this.enemySpawnsEnabled = options.enemySpawns ?? true;
    this.blockedSpawnCellKeys = new Set(this.machine.equipmentCells.map(cellKey));

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

    // The crate lookup is a thunk because the build system does not exist yet
    // and will itself need `resources` — the cycle is only a problem if either
    // side reads the other during construction.
    this.resources = new ResourceAccess(
      this.inventory,
      () => this.build.crates(),
      () => this.player.worldPosition,
      this.bus,
    );
    this.resetInventory();

    this.build = new BuildSystem(
      this.renderer.scene,
      this.physics,
      this.bus,
      this.materials,
      this.machine,
      this.resources,
    );
    this.buildPreview = new BuildPreview(this.renderer.scene);
    this.crafting = new CraftingSystem(this.resources, this.bus);

    // HUD first: it owns the root's innerHTML, so anything appended before it
    // would be wiped.
    this.hud = new HUD(options.hudRoot, this.bus);
    this.buildUI = new BuildUI(options.hudRoot);
    this.inventoryUI = new InventoryUI(options.hudRoot, this.inventory, {
      moveToCrate: (slot, all) => this.transfer('player', slot, all),
      moveToPlayer: (slot, all) => this.transfer('crate', slot, all),
      useSlot: (slot) => this.useSlot(slot),
      craft: (recipeId) => this.crafting.craft(recipeId),
      close: () => this.closePanels(),
    });
    this.debug = new DebugOverlay(options.hudRoot);

    // Crafted rounds go straight to the gun that fires them, so the HUD
    // reserve rises on the same click that spent the materials.
    this.bus.on('craft:completed', ({ recipeId }) => this.autoLoadAmmo(recipeId));

    this.bus.on('player:died', () => {
      this.state.playerDead = true;
    });
    this.bus.on('player:respawned', () => {
      this.state.playerDead = false;
    });

    window.addEventListener('resize', this.onResize);
    this.loop = new GameLoop(this);
  }

  /** Refill the inventory with a new game's starting materials. */
  resetInventory(): void {
    this.inventory.clear();
    for (const [itemId, count] of Object.entries(STARTING_INVENTORY) as [ItemId, number][]) {
      this.inventory.add(itemId, count);
    }
    this.bus.emit('inventory:changed', { scrap: this.inventory.count('scrap') });
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

    this.updatePanels();
    // Build mode and the panels are mutually exclusive: both want LMB.
    if (!this.panelsOpen && this.input.consumePressed('build')) this.toggleBuildMode();

    if (!this.freeCamera) {
      this.player.fixedUpdate(dt, this.input, this.playerCamera.yawAngle);
      this.playerCamera.fixedUpdate(
        dt,
        this.input,
        this.player.worldPosition,
        this.physics,
        this.player.collider,
      );
      // Build mode suppresses weapon fire entirely: LMB places, and firing
      // while placing would be both surprising and expensive. An open panel
      // suppresses both — its clicks belong to the panel.
      if (this.panelsOpen) this.combat.fixedUpdate(dt, this.idleInput, this.playerCamera);
      else if (this.buildMode) this.updateBuildMode();
      else this.combat.fixedUpdate(dt, this.input, this.playerCamera);

      this.enemies.fixedUpdate(dt, this.player.worldPosition, this.player.stats);
    }

    this.machine.fixedUpdate(dt);
    this.world.fixedUpdate(dt, this.machine.speed);
    // After the world moves, so the distance the spawner reads is this tick's.
    if (!this.freeCamera) this.updateSpawns();

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

    this.inventoryUI.update({
      countOf: this.countOf,
      canCraft: this.canCraft,
    });

    if (this.buildMode) {
      this.buildUI.update({
        piece: this.selectedPiece,
        level: this.buildLevel,
        rotation: this.buildRotation,
        scrap: this.resources.count('scrap'),
        components: this.resources.count('components'),
        canAfford: this.canAffordCost,
        validation: this.buildPreview.validation,
        roomCount: this.build.rooms.rooms.length,
        enclosedCount: countEnclosed(this.build.rooms),
      });
    }

    this.post.setCamera(camera);
    this.post.render(frameDt, this.renderer.scene, camera);

    this.tickFpsMeter(now);
    this.updateDebugOverlay(now);
    this.input.endFrame();
  }

  /**
   * Distance-driven arrivals.
   *
   * Deliberately NOT suppressed while a panel is open: Milestone 4 decided the
   * simulation keeps running behind panels, and making the crafting screen a
   * safe room by accident would contradict that quietly.
   */
  private updateSpawns(): void {
    if (!this.enemySpawnsEnabled) return;
    if (this.state.playerDead) return;

    const request = this.spawner.update(
      this.world.distanceTraveled,
      this.enemies.activeCount,
    );
    if (!request) return;

    const bounds: Bounds = {
      halfWidth: this.machine.deckBounds.max.x,
      halfLength: this.machine.deckBounds.max.z,
      // A metre above the deck plane, so they settle onto it rather than
      // through it — the same trick `deckSpawn` uses for the player.
      deckY: this.machine.deckBounds.min.y + 1.0,
    };
    // The perimeter ring can dip into the prow or the engine block depending
    // on which edge wins (see blockedSpawnCellKeys above), so every candidate
    // is checked against the machine's own equipment footprint. If every
    // candidate that call produced is blocked, the open mid-deck spot is a
    // far better fallback than losing the arrival outright — the threshold
    // has already advanced by this point regardless.
    const at =
      this.spawner.placementFor(bounds, this.player.worldPosition, this.isSpawnBlocked) ??
      this.machine.deckSpawn;

    const enemy = this.enemies.spawn(request.defId, new THREE.Vector3(at.x, at.y, at.z));
    if (!enemy && import.meta.env.DEV) {
      // Should be unreachable: the cap check above already confirmed room in
      // the pool. If this ever fires, the arrival this tick's threshold
      // advance implicitly promised is gone rather than merely delayed.
      console.warn('updateSpawns: EnemyManager.spawn returned null despite the cap check passing.');
    }
  }

  /** Keep-out predicate for `EnemySpawner.placementFor` — see `blockedSpawnCellKeys`. */
  private readonly isSpawnBlocked = (p: Vec3Like): boolean =>
    this.blockedSpawnCellKeys.has(cellKey(worldToCell(p.x, p.z, 0)));

  // -------------------------------------------------------------------------
  // Interaction and panels
  // -------------------------------------------------------------------------

  get panelsOpen(): boolean {
    return this.inventoryUI.isOpen;
  }

  /**
   * Reload timers still need to advance while a panel is open, but no input
   * may reach the weapon. Feeding combat a manager whose actions are all cold
   * is simpler and safer than threading a suppression flag through it.
   */
  private readonly idleInput = {
    isDown: () => false,
    consumePressed: () => false,
  } as unknown as InputManager;

  /** Interactables the player is currently near. */
  private candidates(): Interactable[] {
    return this.build
      .stationsNear(this.player.worldPosition, INTERACT_REACH)
      .map((station) => ({
        id: station.instanceId,
        label: BUILD_PIECES[station.piece].name,
        position: station.position,
        kind: station.piece as Interactable['kind'],
      }));
  }

  private updatePanels(): void {
    const nearest = this.freeCamera
      ? null
      : this.interaction.update(this.player.worldPosition, this.candidates());

    if (this.input.consumePressed('inventory')) {
      if (this.panelsOpen) this.closePanels();
      else this.openInventory();
    }

    if (this.input.consumePressed('cancel') && this.panelsOpen) this.closePanels();

    // E is 'rotate-right' in build mode, so interaction stays out of its way.
    if (!this.buildMode && this.input.consumePressed('interact')) {
      if (this.panelsOpen) this.closePanels();
      else if (nearest) this.openInteractable(nearest);
    }

    this.hud.setPrompt(
      !this.panelsOpen && nearest ? `[E] Open ${nearest.label}` : null,
    );
  }

  openInventory(): void {
    this.inventoryUI.setMode('inventory', { title: 'Inventory' });
    this.releasePointerLock();
  }

  /** Open whatever the player is standing at. Returns false if nothing is. */
  openInteractable(target: Interactable | null = this.interaction.current): boolean {
    if (!target) return false;

    if (target.kind === 'crate') {
      const crate = this.build.crateContainer(target.id);
      if (!crate) return false;
      this.inventoryUI.setMode('transfer', { title: target.label, crate });
    } else {
      this.inventoryUI.setMode('crafting', {
        title: target.label,
        station: target.kind as StationId,
      });
    }

    this.releasePointerLock();
    return true;
  }

  closePanels(): void {
    if (!this.panelsOpen) return;
    this.inventoryUI.setMode('closed');
    // Only reclaim the mouse if the player had it to begin with.
    if (!this.options.bypassPointerLock) this.input.requestPointerLock();
  }

  /** Without this the panels cannot be clicked at all. */
  private releasePointerLock(): void {
    if (this.options.bypassPointerLock) return;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Move a stack between the player and the open crate. */
  private transfer(from: 'player' | 'crate', slotIndex: number, all: boolean): void {
    const crate = this.inventoryUI.currentCrate;
    if (!crate) return;

    const source = from === 'player' ? this.inventory : crate;
    const target = from === 'player' ? crate : this.inventory;
    source.moveTo(target, slotIndex, all ? undefined : 1);
    this.bus.emit('inventory:changed', { scrap: this.resources.count('scrap') });
  }

  /**
   * Use whatever is in a player inventory slot.
   *
   * Each branch consumes only when the use actually succeeded — a repair kit
   * clicked at full health must still be in the bag afterwards.
   */
  useSlot(slotIndex: number): boolean {
    const slot = this.inventory.slots[slotIndex];
    if (!slot) return false;

    if (slot.itemId === 'repair-kit') {
      if (!this.player.stats.useRepairKit()) return false;
      this.inventory.remove('repair-kit', 1);
      return true;
    }

    if (ITEMS[slot.itemId].category === 'mod') {
      if (!this.combat.applyMod(slot.itemId)) return false;
      this.inventory.remove(slot.itemId, 1);
      return true;
    }

    if (ITEMS[slot.itemId].category === 'ammo') {
      const count = slot.count;
      if (!this.combat.addAmmoFor(slot.itemId, count)) return false;
      this.inventory.remove(slot.itemId, count);
      return true;
    }

    return false;
  }

  /** Crafted rounds are loaded rather than left sitting in a slot. */
  private autoLoadAmmo(recipeId: string): void {
    const recipe = recipeById(recipeId);
    if (!recipe) return;

    const { itemId, count } = recipe.output;
    if (ITEMS[itemId].category !== 'ammo') return;
    if (!this.resources.consume({ [itemId]: count })) return;
    this.combat.addAmmoFor(itemId, count);
  }

  private readonly countOf = (itemId: ItemId): number => this.resources.count(itemId);
  private readonly canCraft = (recipe: Recipe): boolean => this.crafting.canCraft(recipe);

  // -------------------------------------------------------------------------
  // Build mode
  // -------------------------------------------------------------------------

  toggleBuildMode(): void {
    this.buildMode = !this.buildMode;
    this.buildPreview.setVisible(this.buildMode);
    this.buildUI.setVisible(this.buildMode);
    if (!this.buildMode) this.buildLevelPinned = false;
  }

  get currentBuildLevel(): number {
    return this.buildLevel;
  }

  private updateBuildMode(): void {
    // Follow the player between storeys unless the wheel has overridden it,
    // so changing level is an override rather than a chore.
    if (!this.buildLevelPinned) {
      const standingOn = Math.round(
        (this.player.worldPosition.y - DECK_HEIGHT - 1) / LEVEL_HEIGHT,
      );
      this.buildLevel = Math.max(0, Math.min(GRID_LEVELS - 1, standingOn));
    }

    const wheel = this.input.wheelDelta;
    if (wheel !== 0) {
      this.buildLevelPinned = true;
      const step = wheel > 0 ? -1 : 1;
      this.buildLevel = Math.max(0, Math.min(GRID_LEVELS - 1, this.buildLevel + step));
    }

    BUILD_PIECE_ORDER.forEach((id, i) => {
      if (this.input.consumePressed(`slot${i + 1}` as 'slot1')) this.selectedPiece = id;
    });

    if (this.input.consumePressed('rotate-left')) this.buildRotation = (this.buildRotation + 3) % 4;
    if (this.input.consumePressed('rotate-right')) this.buildRotation = (this.buildRotation + 1) % 4;

    this.buildPreview.update(
      this.activeCamera,
      this.physics,
      this.build,
      this.buildLevel,
      this.selectedPiece,
      this.buildRotation,
      this.player.collider,
    );

    const placement = this.buildPreview.placement;
    if (!placement) return;

    if (this.input.consumePressed('fire')) this.build.place(placement);
    if (this.input.consumePressed('demolish')) this.build.demolishAt(placement);
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
        this.resources.deposit('scrap', 250);
        this.resources.deposit('components', 10);
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

  /** Bound once so the build panel is not handed a fresh closure every frame. */
  private readonly canAffordCost = (cost: Parameters<ResourceAccess['canAfford']>[0]): boolean =>
    this.resources.canAfford(cost);

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
        inventory: this.inventory.serialise(),
        equipment: {
          currentWeapon: this.combat.current.def.id,
          // Every weapon, not just the equipped one: a mod fitted to the
          // shotgun must survive a save taken while holding the rifle.
          weapons: this.combat.serialise(),
        },
      },
      machine: {
        structures: this.build.serialise(),
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
    // Derived from distance, so a load re-derives it rather than restoring it.
    this.spawner.resync(save.distanceTraveled);

    // Inventory before structures: rebuilding a crate creates an empty
    // container that the piece's own state then fills, and restoring the
    // player's bag afterwards would be sequencing two writes to the same
    // aggregate for no reason.
    this.inventory.restore(save.player.inventory ?? []);
    this.build.restore(save.machine.structures ?? []);
    this.bus.emit('inventory:changed', { scrap: this.inventory.count('scrap') });

    this.player.teleport(
      new THREE.Vector3(save.player.position.x, save.player.position.y, save.player.position.z),
    );
    this.player.stats.reset();
    this.enemies.despawnAll();

    this.combat.equip(save.player.equipment.currentWeapon);
    this.combat.restore(
      save.player.equipment.weapons.map((w) => ({
        id: w.id,
        ammoInMag: w.ammoInMag,
        reserveAmmo: w.reserveAmmo,
        magazineBonus: w.magazineBonus ?? 0,
      })),
    );

    // A panel open over a world that just changed underneath it would be
    // showing stale containers.
    this.closePanels();

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
    this.buildUI.dispose();
    this.inventoryUI.dispose();
    this.buildPreview.dispose();
    this.build.clear();
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
