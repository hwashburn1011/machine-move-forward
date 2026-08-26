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
import { loadTextureSets } from '@/art/TextureLoader';
import { loadModel } from '@/art/ModelLoader';
import { loadPropModels } from '@/world/PropModels';
import { updateFogColor } from '@/art/Fog';
import { WorldManager, renderedDistance, WORLD_Z_PER_METRE } from '@/world/WorldManager';
import { Machine } from '@/machine/Machine';
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';
import { conditionLabel } from '@/ui/MachineCondition';
import { RepairSystem, type RepairTarget } from '@/interaction/RepairSystem';
import type { BodyPose } from '@/machine/MachineBody';
import { Player } from '@/player/Player';
import { PlayerCamera } from '@/player/PlayerCamera';
import { PlayerCombat } from '@/player/PlayerCombat';
import { EnemyManager } from '@/enemies/EnemyManager';
import { EnemySpawner, type Bounds, type Vec3Like } from '@/enemies/EnemySpawner';
import { ThreatDirector, type ThreatPhase } from '@/enemies/ThreatDirector';
import { SandFX } from '@/fx/SandFX';
import { TrackMarks } from '@/fx/TrackMarks';
import { AudioEngine } from '@/audio/AudioEngine';
import { connectGameSounds } from '@/audio/GameSounds';
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
import { LampLights, type LampSample } from '@/building/LampLights';
import { BuildUI } from '@/ui/BuildUI';
import {
  BUILD_PIECES,
  PIECE_CATEGORIES,
  piecesInCategory,
  STARTING_STRUCTURES,
  type PieceCategory,
  type PieceId,
} from '@/data/build-pieces';
import { FUEL_TANK_CAP, powerRoleOf } from '@/data/power';
import { isProducer, producerRoleOf, NEEDS_MAX } from '@/data/needs';
import { countEnclosed, insideEnclosed } from '@/building/RoomDetector';
import { padPlaying } from '@/audio/SoundBank';
import { cellKey, worldToCell } from '@/building/BuildGrid';
import {
  CHARACTER_DROP_Y,
  DECK_HEIGHT,
  DESERT_FLOOR_HALF_X,
  DESERT_FLOOR_HALF_Z,
  DESERT_FLOOR_Y,
  GRID_LEVELS,
  LOST_IN_THE_DESERT_S,
  LEVEL_HEIGHT,
  ON_THE_SAND_Y,
  BASE_MACHINE_SPEED,
} from '@/game/constants';
import { CURRENT_SAVE_VERSION, type SaveGameV1 } from '@/save/SaveSchema';
import { hashSeed, Rng } from '@/core/math/Random';
import { rollDrops } from '@/enemies/Loot';
import { WEAPON_MODELS } from '@/data/weapon-models';
import { SalvageField } from '@/salvage/SalvageField';
import { pickReelTarget, REEL_RANGE } from '@/salvage/Reel';
import { stepHook, type HookState } from '@/salvage/Hook';
import { buildHook, HOOK_SPIN } from '@/salvage/HookModel';
import { ENEMIES } from '@/data/enemies';
import { RooftopSet } from '@/world/RooftopSet';
import {
  isDeckLanding,
  OpeningDirector,
  type OpeningEffect,
  type OpeningMode,
} from '@/game/OpeningDirector';
import { GAME_TITLE, TitleScreen, type GameSettings } from '@/ui/TitleScreen';
import { GameLoop, type LoopCallbacks } from './GameLoop';
import { createGameState, type GameState } from './GameState';

/**
 * Free-fly camera presets, shared by the screenshot harness (`?cam=`) and the
 * title screen's backdrop.
 *
 * Here rather than in `main.ts` because the title screen is inside `Game` and
 * a second copy of `far`'s numbers is exactly how the menu's shot and the
 * screenshot harness's would quietly drift apart.
 */
export const CAMERA_PRESETS: Record<string, [THREE.Vector3, THREE.Vector3]> = {
  far: [new THREE.Vector3(9, 7.5, 19), new THREE.Vector3(0, 2, -30)],
  front: [new THREE.Vector3(11, 6.5, -19), new THREE.Vector3(0, 3, 0)],
  side: [new THREE.Vector3(22, 6, 2), new THREE.Vector3(0, 2.5, 0)],
  sky: [new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 40, -18)],
};

/** Which of them the menu is shot from. */
const TITLE_PRESET = 'far';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  hudRoot: HTMLElement;
  /**
   * Root for the title screen. A SIBLING of `hudRoot`: `HUD` owns its root's
   * innerHTML and would wipe anything appended to it. Absent in tests and in
   * any harness that never wants a menu.
   */
  titleRoot?: HTMLElement;
  /**
   * Show the title screen on boot. Default true.
   *
   * `?nomenu=1` turns it off and reproduces the pre-Phase-2 boot exactly —
   * straight into gameplay, no opening. Every harness and e2e test boots with
   * it, which is the whole reason the switch exists.
   */
  menu?: boolean;
  /** `?opening=1`: play the rooftop opening regardless of `menu`. */
  forceOpening?: boolean;
  seed?: string;
  qualityTier?: QualityTier;
  bypassPointerLock?: boolean;
  /**
   * Load PBR textures over the procedural materials. Default true.
   *
   * The browser harnesses turn this off: they boot with nothing to fetch, so
   * they stay deterministic and fast.
   */
  textures?: boolean;
  /**
   * Draw enemies as the rigged character model rather than the box. Default
   * true.
   *
   * The browser harnesses turn this off for the same reason they turn textures
   * off, and because the fallback is the path that must never rot.
   */
  models?: boolean;
  /** Free-fly camera for screenshots, disables the player rig. */
  freeCamera?: THREE.Vector3 | null;
  freeCameraTarget?: THREE.Vector3 | null;
  /** Distance-driven arrivals. Off for harnesses that must travel undisturbed. */
  enemySpawns?: boolean;
  /**
   * Synthesised audio. Default true.
   *
   * The harnesses turn it off: a headless Chromium's audio backend is one more
   * thing to be slow and flaky about, and nothing they measure can hear.
   */
  sound?: boolean;
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
/** Returned for anything the deck is not carrying. Never mutated. */
const ZERO_CARRY = { x: 0, y: 0, z: 0 } as const;

/**
 * Simulated seconds between engine-under-attack cues.
 *
 * Comfortably longer than a raider's 0.75s attack cooldown, so a sustained
 * attack is a repeating alarm rather than a stutter of overlapping tones.
 */
const DAMAGE_CUE_SECONDS = 4;

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
  /**
   * When a wave comes and how big it is. `spawner` now only answers WHERE.
   *
   * Kept as two objects rather than merged: placement is a geometry problem
   * that depends on the deck and the player's position, and pacing is a
   * scheduling problem that depends on neither. They were only ever one thing
   * because there was nothing to schedule.
   */
  readonly director: ThreatDirector;
  /** The phase last seen, so a change can be announced exactly once. */
  private threatPhase: ThreatPhase = 'calm';

  /** Last tick's subsystem health, so a drop can be spotted without an event. */
  private readonly lastSubsystemHealth = new Map<SubsystemId, number>();
  /** Simulated seconds left before another damage cue may play. */
  private damageCueCooldown = 0;

  readonly repair = new RepairSystem();
  /** This tick's repair targets, by the id their interactable carries. */
  private readonly repairTargets = new Map<string, RepairTarget>();
  private readonly repairPoint = new THREE.Vector3();
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
  readonly tracks: TrackMarks;
  readonly audio: AudioEngine;
  /** Loaded weapon scenes by weapon id. Empty when models are off. */
  readonly weaponModels = new Map<string, THREE.Object3D>();
  private readonly disconnectSounds: () => void;
  readonly impactFX: ImpactFX;
  readonly hud: HUD;
  readonly post: PostProcessing;
  readonly debug: DebugOverlay;
  readonly saves = new SaveManager();
  /** What the player carries. Crates hold their own. */
  readonly inventory = new Container(PLAYER_INVENTORY_SLOTS);
  readonly resources: ResourceAccess;
  readonly build: BuildSystem;
  readonly lampLights: LampLights;
  readonly buildPreview: BuildPreview;
  readonly buildUI: BuildUI;
  readonly crafting: CraftingSystem;
  readonly interaction = new InteractionSystem(INTERACT_REACH);
  readonly inventoryUI: InventoryUI;

  /**
   * Where the opening has got to. Exposed on `__game` for the harnesses.
   *
   * Phase 9 hangs the premise off its completion and Phase 15 replaces the
   * placeholder chase behind the same four phases.
   */
  readonly opening = new OpeningDirector();
  /** The menu, or null when the game was booted without one (`?nomenu=1`). */
  readonly titleScreen: TitleScreen | null = null;
  /** The opening's building. Null outside the opening. */
  rooftop: RooftopSet | null = null;
  /** True once the opening is over and the set is receding with the world. */
  private rooftopScrolling = false;
  /**
   * The player has their weapons. False for the length of the rooftop chase:
   * the answer up there is run, and a gun in hand says otherwise.
   */
  private armed = true;
  /** The title screen's backdrop camera, or null in play. */
  private titleCamera: THREE.PerspectiveCamera | null = null;

  buildMode = false;
  selectedPiece: PieceId = 'floor';
  /** Which group the number keys address. `G` pages it. */
  buildCategory: PieceCategory = 'structure';
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
  readonly salvage: SalvageField;
  /** The crate the hook has latched onto, if any. */
  private hookedCrate: string | null = null;
  /** Flight of the thrown hook. Null between throws. */
  private hook: HookState | null = null;
  /** Where the throw started and the direction it was aimed, frozen at launch. */
  private readonly hookOrigin = new THREE.Vector3();
  private readonly hookDir = new THREE.Vector3();
  private readonly hookAt = new THREE.Vector3();
  private readonly reelLine: THREE.Line;
  private readonly reelHead: THREE.Group;
  private readonly reelAim = new THREE.Vector3();
  /** A crate is lined up and a throw would reach it. Read by the HUD. */
  private reelReady = false;
  private readonly lootRng: Rng;
  private fps = 0;
  private frameMs = 0;

  /** Rapier's wasm must be resolved before any physics object exists. */
  static async create(options: GameOptions): Promise<Game> {
    await initRapier();
    const game = new Game(options);

    // After construction: the procedural materials are already complete and
    // usable, and this only swaps their surfaces. A failed fetch costs a
    // nicer-looking hull, never a boot.
    if (options.textures !== false) {
      const sets = await loadTextureSets();
      game.materials.applyTextureSets(sets);
      // The dunes are not a material slot — the terrain shader samples the
      // scan in world space itself — so they are handed it separately.
      if (sets.sand) game.world.applySand(sets.sand);
    }

    // Same bargain as the textures: a missing or undecodable model costs a
    // nicer-looking scavenger, never a boot. `setModel` rather than a
    // constructor argument because the manager is built in the synchronous
    // constructor, before this has resolved.
    // The desert's wrecks, on the same bargain: a missing pack costs a wreck
    // on the horizon, never a boot.
    if (options.models !== false) {
      game.world.applyPropModels(await loadPropModels());
    }

    const model = options.models === false ? null : await loadModel('models/scavenger.glb');
    game.enemies.setModel(model);

    // The player is on screen from behind for the whole game, so this is the
    // most looked-at model in it. Same bargain as the rest: a missing file
    // costs a nicer-looking character, never a boot.
    game.player.setModel(
      options.models === false ? null : await loadModel('models/player.glb'),
    );

    // Weapons last, and in parallel: they are the smallest files and the least
    // load-bearing thing on screen, so nothing else should wait on them.
    if (options.models !== false) {
      const ids = Object.keys(WEAPON_MODELS);
      const loaded = await Promise.all(ids.map((id) => loadModel(WEAPON_MODELS[id]!.url)));
      ids.forEach((id, i) => {
        const m = loaded[i];
        if (m) game.weaponModels.set(id, m.scene);
      });
      game.equipHeldWeapon();
    }

    return game;
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

    // Something to land on. See `DESERT_FLOOR_Y`: the dunes are drawn on the
    // GPU and have never been solid, so anyone who left the deck fell through
    // the world.
    this.physics.addFixedBox(
      new THREE.Vector3(DESERT_FLOOR_HALF_X, 1, DESERT_FLOOR_HALF_Z),
      new THREE.Vector3(0, DESERT_FLOOR_Y - 1, 0),
      0,
      { kind: 'desert' },
    );

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
    this.director = new ThreatDirector(seed);
    this.salvage = new SalvageField(this.renderer.scene, this.bus, this.materials, seed);

    // The cable. Two points, rewritten each frame while a crate is on the
    // hook, hidden otherwise.
    this.reelLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0.9 }),
    );
    this.reelLine.frustumCulled = false;
    this.reelLine.visible = false;
    this.renderer.scene.add(this.reelLine);

    // The hook itself, so the throw is something you watch rather than infer.
    // It was an octahedron -- a floating orange diamond, which said "something
    // is happening" and never once said "this is a hook".
    this.reelHead = buildHook(this.materials.bareSteel);
    this.reelHead.visible = false;
    this.renderer.scene.add(this.reelHead);
    // Its own stream, so loot rolls cannot shift where arrivals are placed.
    this.lootRng = new Rng(hashSeed(seed, 'loot'));
    this.bus.on('enemy:killed', (e) =>
      this.collectKillReward(e.defId, ENEMIES[e.defId]?.name ?? 'Scavenger'),
    );
    this.enemySpawnsEnabled = options.enemySpawns ?? true;
    this.blockedSpawnCellKeys = new Set(this.machine.equipmentCells.map(cellKey));

    this.sandFX = new SandFX(this.renderer.scene, this.quality);
    this.tracks = new TrackMarks(this.renderer.scene);
    this.impactFX = new ImpactFX(this.renderer.scene, this.bus, this.quality);

    // The listener is the PLAYER, always. The camera orbits them; the ears do
    // not. `yawAngle` rather than the player's own facing, because that is the
    // direction the screen is pointing and therefore the direction "left" and
    // "right" mean to the person holding the mouse.
    this.audio = new AudioEngine({ enabled: options.sound ?? true });
    this.disconnectSounds = connectGameSounds(this.bus, this.audio, () => ({
      x: this.player.worldPosition.x,
      z: this.player.worldPosition.z,
      yaw: this.playerCamera.yawAngle,
    }));

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
    this.lampLights = new LampLights(this.renderer.scene, this.quality.lampLights);
    this.buildPreview = new BuildPreview(this.renderer.scene);
    // Before the starting structures are laid, so the generator they include
    // registers as a producer the moment it is placed.
    this.wirePower();
    this.resetStructures();
    this.crafting = new CraftingSystem(this.resources, this.bus, this.stationPowered);

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

    // The menu. Its callbacks are the ONLY way it reaches the game, so it can
    // be restyled or replaced without the simulation learning anything.
    //
    // Built whenever there is a root for it, `?nomenu=1` included: that
    // parameter says what this boot STARTS with, not whether `Esc` has a
    // pause menu behind it. No harness presses `Esc` outside a panel, so
    // nothing measured today can see the difference.
    if (options.titleRoot) {
      this.titleScreen = new TitleScreen(options.titleRoot, {
        onNewGame: () => this.startNewGame(),
        onContinue: () => void this.continueGame(),
        onResume: () => this.resume(),
        onQuitToTitle: () => this.enterTitle(),
        onSettings: (s) => this.applySettings(s),
        hasSave: () => this.hasSave(),
      });
      this.applySettings(this.titleScreen.current);
    }

    // Crafted rounds go straight to the gun that fires them, so the HUD
    // reserve rises on the same click that spent the materials.
    this.bus.on('craft:completed', ({ recipeId }) => this.autoLoadAmmo(recipeId));
    // Off the event, not polled, so the model in the hand and the name on the
    // HUD change on the same tick and cannot disagree about what is held.
    this.bus.on('weapon:equipped', () => this.equipHeldWeapon());

    this.bus.on('player:died', () => {
      this.state.playerDead = true;
    });
    this.bus.on('player:respawned', () => {
      this.state.playerDead = false;
    });

    window.addEventListener('resize', this.onResize);
    this.loop = new GameLoop(this);
  }

  /**
   * Where the machine's body pose comes from each step, or null for a body at
   * rest. A seam, not a setting: the gait will fill it, and the deck-carry
   * harness fills it today.
   */
  poseSource: ((simTime: number) => BodyPose) | null = null;

  /** Reused each step; the camera reads it immediately. */
  private readonly cameraAnchor = new THREE.Vector3();
  /** Seconds the player has spent off the machine, on the sand. */
  private timeOnTheSand = 0;

  /**
   * Put every powered piece on the grid as it is built, and take it off again.
   *
   * Off the build events rather than polled, so a device is live on the tick
   * it is placed and gone on the tick it comes down — including when it comes
   * down through Phase 1's damage cascade, which routes through the same
   * `build:removed` the player's own hammer does. That is the whole reason
   * these are build pieces and not a separate device registry.
   */
  private wirePower(): void {
    const power = this.machine.power;

    this.bus.on('build:placed', ({ instanceId, definitionId }) => {
      const role = powerRoleOf(definitionId as PieceId);
      if (!role) return;
      if (role.kind === 'producer') power.registerProducer(instanceId, role.capacity);
      else power.registerConsumer({ id: instanceId, draw: role.draw, priority: role.priority });
    });

    this.bus.on('build:removed', ({ instanceId }) => {
      // Both, unconditionally: the piece is already gone, so there is nothing
      // left to ask what it was, and neither call minds an id it never knew.
      power.unregisterProducer(instanceId);
      power.unregisterConsumer(instanceId);
    });

    // Phase 1's hook. A generator at half health makes half the power, which
    // browns the machine out gradually rather than at a threshold — the same
    // continuous reading `MachineDamage` gives the legs and the engine.
    this.bus.on('build:damaged', ({ instanceId, definitionId, health, maxHealth }) => {
      if (definitionId !== 'generator') return;
      power.setProducerHealth(instanceId, maxHealth > 0 ? health / maxHealth : 0);
    });
  }

  /**
   * Whether the station in front of the player has power.
   *
   * Bound once so `CraftingSystem` holds a stable predicate. It asks about the
   * station the OPEN PANEL belongs to: two refineries on one machine are one
   * consumer each, and `MachinePower` sheds by class, so in practice they
   * agree — but asking about the one being used is the honest question.
   */
  private readonly stationPowered = (station: StationId): boolean => {
    const open = this.interaction.current;
    if (open && open.kind === station) return this.machine.power.isPowered(open.id);
    // No panel open — a harness or a scripted craft. Fall back to whether ANY
    // station of that class is powered, rather than refusing outright.
    return this.machine.power.isPowered(this.anyStationOf(station) ?? '');
  };

  /** The instance id of any built station of a kind, for the power gate's fallback. */
  private anyStationOf(station: StationId): string | undefined {
    return this.build
      .stationsNear(this.player.worldPosition, Number.POSITIVE_INFINITY)
      .find((ref) => ref.piece === station)?.instanceId;
  }

  /**
   * Build what a new machine is already carrying — the starting generator.
   *
   * Placed FREE through the ordinary placement path, which is the same one a
   * save replays through. There is no special case here and no bespoke
   * geometry: from the moment it exists it is a build piece like any other,
   * and the player can demolish it for a refund and live with the dark.
   *
   * Loading a save replaces all of this: `build.restore` clears first, and the
   * save carries whatever generator the player actually has.
   */
  resetStructures(): void {
    // `clear` drops its instances wholesale rather than demolishing them, so
    // no `build:removed` fires and nothing would otherwise unregister.
    this.machine.power.clearDevices();
    this.shedClasses.clear();
    this.build.clear();
    for (const placement of STARTING_STRUCTURES) this.build.place(placement, true);
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
    return this.cinematicCamera ?? this.playerCamera.camera;
  }

  /**
   * A camera that is NOT the player's rig — the screenshot harness's `?cam=`
   * preset, or the title screen's backdrop.
   *
   * One question with one answer, because every "is the player being
   * simulated" check in `fixedUpdate` has to agree with every other one, and
   * two of them asking about `freeCamera` alone is how the title screen would
   * end up running the chase behind its own menu.
   */
  private get cinematicCamera(): THREE.PerspectiveCamera | null {
    return this.titleCamera ?? this.freeCamera;
  }

  get isFreeCamera(): boolean {
    return this.cinematicCamera !== null;
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

    this.updatePanels(dt);
    // Build mode and the panels are mutually exclusive: both want LMB.
    if (!this.panelsOpen && this.input.consumePressed('build')) this.toggleBuildMode();

    if (!this.cinematicCamera) {
      // The body's pose for this step, from the gait — how far the machine has
      // walked, not how long it has been running, so a stopped machine settles
      // mid-stride instead of marching on the spot. `poseSource` overrides it
      // for the deck-carry harness, which has to oscillate the body far harder
      // than any gait would (section 10).
      this.machine.setPose(
        this.poseSource
          ? this.poseSource(this.state.simTime)
          : this.machine.poseAt(this.world.distanceTraveled),
      );

      // Carry anything standing on the deck by however far the deck moved,
      // BEFORE it moves and before the machine writes its colliders to the new
      // pose. Sampled per body, since under tilt the extremities move most.
      //
      // The order is the point. The player is resting on the deck where the
      // last step left it; carrying it and the deck by the same rigid step
      // preserves that exactly. Computing the carry after the player has moved
      // -- which is what this did -- hands it a delta the deck already made,
      // so every step resolves a contact that should never have existed. The
      // gait's `setPose` is the line above.
      if (this.player.worldPosition.y < ON_THE_SAND_Y) {
        // Off the machine and on the sand. It is pulling away at exactly the
        // speed a person sprints, so this is already over — see
        // `LOST_IN_THE_DESERT_S`.
        this.timeOnTheSand += dt;
        if (this.timeOnTheSand >= LOST_IN_THE_DESERT_S) {
          this.player.stats.damage(
            this.player.stats.health,
            'lost to the desert',
            this.player.worldPosition,
          );
        }
        // Standing on the desert, not on the machine. The sand is the thing
        // that is moving, so it carries them astern at the machine's own speed
        // and the machine drives off and leaves them — which is what walking
        // off a moving vehicle gets you. Without this they would hover beside
        // it forever, matching its speed while standing on the ground.
        this.player.carry.x = 0;
        this.player.carry.y = 0;
        this.player.carry.z = WORLD_Z_PER_METRE * this.machine.speed * dt;
      } else {
        this.timeOnTheSand = 0;
        const carried = this.machine.carryFor(this.player.worldPosition);
        this.player.carry.x = carried.x;
        this.player.carry.y = carried.y;
        this.player.carry.z = carried.z;
      }

      this.player.fixedUpdate(dt, this.input, this.playerCamera.yawAngle);
      // The camera follows where the player would be if the body were at rest,
      // not where the deck has just lifted them to. See `Machine.steadyPoint`:
      // the deck is supposed to move and the view is not, and without this the
      // gait reaches the camera through the player and buzzes it at 4.6Hz.
      this.playerCamera.fixedUpdate(
        dt,
        this.input,
        this.machine.steadyPoint(this.player.worldPosition, this.cameraAnchor),
        this.physics,
        this.player.collider,
      );
      // Build mode suppresses weapon fire entirely: LMB places, and firing
      // while placing would be both surprising and expensive. An open panel
      // suppresses both — its clicks belong to the panel.
      // A dead player keeps reload timers running but reaches no trigger, the
      // same way an open panel does.
      // An unarmed player reaches no trigger either, which is what the roof
      // is: the answer up there is run.
      if (this.panelsOpen || this.state.playerDead || !this.armed) {
        this.combat.fixedUpdate(dt, this.idleInput, this.playerCamera);
      } else if (this.buildMode) this.updateBuildMode();
      else this.combat.fixedUpdate(dt, this.input, this.playerCamera);

      // No nav graph during the chase. The graph describes the machine's deck
      // and what the player has built on it; the roof is neither, so A* would
      // hand every scavenger up there an empty route computed against a deck
      // ten metres away. Null is the honest input, and the fallback it selects
      // — steer straight at the player — is exactly the chase this wants.
      this.enemies.fixedUpdate(
        dt,
        this.player.worldPosition,
        this.player.stats,
        this.opening.phase === 'rooftop' ? null : this.build.navGraph,
        this.carryOnDeck,
        this.build,
        this.machine.damage,
      );

      this.updateOpening(dt);
    }

    this.machine.fixedUpdate(dt);
    this.tickNeeds(dt);
    this.tickPower(dt);
    // After the power, so a condenser that lost its supply this tick is asked
    // about the state the tick actually ended in rather than the one it began
    // with. The same ordering argument `MachinePower.fixedUpdate` makes about
    // burning fuel before settling.
    this.tickProducers(dt);
    this.announceMachineDamage(dt);
    this.world.fixedUpdate(dt, this.machine.speed);
    // The building recedes by exactly what the world does, and only once the
    // opening has released it — nothing stands on it while it moves.
    if (this.rooftop && this.rooftopScrolling) {
      this.rooftop.scroll(this.machine.speed * dt);
      if (this.rooftop.gone) {
        this.rooftop.dispose();
        this.rooftop = null;
      }
    }
    // After the world moves, so the distance the spawner reads is this tick's.
    if (!this.cinematicCamera) this.updateSpawns();

    // Last: resolve everything the kinematic bodies above just requested.
    this.physics.step();

    this.handleDebugKeys();
  }

  /**
   * Drain the survival meters, and announce them on whole points.
   *
   * NOT while the title screen is up and NOT during the opening. Both are
   * states the player cannot drink in: the menu runs the machine as a backdrop
   * with nobody aboard, and the rooftop chase strips the player's weapons, let
   * alone their supplies. A meter that emptied itself over a title screen left
   * running would be the first thing a returning player noticed and the last
   * thing they could explain.
   *
   * The pause menu is handled a level up — `fixedUpdate` returns before this
   * on `state.paused` — which is the same reason it needs no mention here.
   */
  private tickNeeds(dt: number): void {
    if (this.cinematicCamera) return;
    if (this.opening.phase !== 'done') return;

    const needs = this.player.needs;
    const before = this.announcedNeeds;
    needs.fixedUpdate(dt);

    const hydration = Math.ceil(needs.hydration);
    const nourishment = Math.ceil(needs.nourishment);
    if (before && before.hydration === hydration && before.nourishment === nourishment) return;

    this.announcedNeeds = { hydration, nourishment };
    this.bus.emit('needs:changed', { hydration, nourishment });
  }

  /** The last meter pair put on the bus, so `tickNeeds` can emit edges only. */
  private announcedNeeds: { hydration: number; nourishment: number } | null = null;

  /**
   * Run the condensers and the planters, and announce what they finished.
   *
   * The power predicate is `MachinePower.isPowered` by instance id, which is
   * the whole of the condenser's Phase 3 dependency: no new registration path,
   * no new call site in `wirePower` — `powerRoleOf` already put it on the grid
   * when the piece was placed.
   *
   * Runs on the same gate the needs do. A planter that grew three bunches of
   * greens behind a title screen would be a gift from nowhere.
   */
  private tickProducers(dt: number): void {
    if (this.cinematicCamera) return;
    if (this.opening.phase !== 'done') return;

    for (const output of this.build.tickProducers(dt, this.devicePowered)) {
      this.bus.emit('producer:output', output);
    }
  }

  /** Bound once, so `BuildSystem` is handed a stable predicate per tick. */
  private readonly devicePowered = (instanceId: string): boolean =>
    this.machine.power.isPowered(instanceId);

  /**
   * Burn the fuel and put the model's edges on the bus.
   *
   * `MachinePower` owns no bus, exactly as `MachineDamage` owns none: it is
   * pure and returns what changed, and this is the one place that turns those
   * into events. Also refreshes the lamps, which is the only thing in the
   * frame that depends on the shed state rather than reading it on demand.
   */
  private tickPower(dt: number): void {
    for (const event of this.machine.power.fixedUpdate(dt)) {
      if (event.type === 'changed') {
        this.bus.emit('power:changed', {
          capacity: event.capacity,
          draw: event.draw,
          fuel: event.fuel,
        });
      } else if (event.type === 'shed') {
        this.shedClasses.add(event.priority);
        this.bus.emit('power:shed', { priority: event.priority });
      } else {
        this.shedClasses.delete(event.priority);
        this.bus.emit('power:restored', { priority: event.priority });
      }
    }
  }

  /**
   * Which priority classes are currently shed.
   *
   * Accumulated from the model's edges rather than recomputed, because that is
   * what the edges are for — and because "is anything shed" is a question the
   * HUD asks every frame and the model would have to re-derive every time.
   */
  private readonly shedClasses = new Set<string>();

  private get powerShed(): boolean {
    return this.shedClasses.size > 0;
  }

  /**
   * Say — out loud — that a subsystem is being attacked.
   *
   * Polled rather than pushed because `MachineDamage` is deliberately pure and
   * owns no event bus: it is read every frame by whoever needs it, and this is
   * one of those readers. A sustained attack lands a hit every attack cooldown,
   * so the cue is limited to one every few seconds; unlimited, a raider at the
   * engine would machine-gun the warning tone.
   *
   * The cooldown runs on SIMULATED seconds, like every other clock in the sim,
   * so a save, a reload and a replay all produce the same cues.
   */
  private announceMachineDamage(dt: number): void {
    this.damageCueCooldown = Math.max(0, this.damageCueCooldown - dt);

    for (const id of Object.keys(SUBSYSTEMS) as SubsystemId[]) {
      const now = this.machine.damage.health(id);
      const before = this.lastSubsystemHealth.get(id) ?? now;
      this.lastSubsystemHealth.set(id, now);
      if (now >= before) continue;

      if (this.damageCueCooldown > 0) continue;
      this.damageCueCooldown = DAMAGE_CUE_SECONDS;
      this.bus.emit('machine:damaged', {
        subsystemId: id,
        fraction: this.machine.damage.fraction(id),
        stopped: this.machine.damage.isStopped,
      });
    }
  }

  /**
   * Pay the player for a kill.
   *
   * Straight into the inventory rather than as something to walk over: the
   * deck moves at 7.5 m/s and is cluttered, and loot that has to be chased is
   * loot that slides under the engine block. The event is what the HUD reads,
   * so nothing about the message has to know where items are stored.
   */
  /**
   * Throw the hook at whatever the player is looking at.
   *
   * Nothing happens if there is no crate in the cone -- deliberately silent
   * rather than an error, because the reel is on a key the player will press
   * speculatively while scanning the dunes.
   */
  private fireReel(): void {
    // One throw at a time, but a throw always happens: pressing the key with
    // nothing in front of you still sends the hook out and brings it back
    // empty, which is the only way to learn where the thing points.
    if (this.hook !== null) return;

    const camera = this.activeCamera;
    camera.getWorldDirection(this.reelAim);
    // Frozen at launch, so the hook flies straight rather than curving to
    // follow the camera around.
    this.hookOrigin.copy(this.player.worldPosition);
    this.hookOrigin.y += 0.35;
    this.hookDir.copy(this.reelAim).normalize();
    this.hook = { distance: 0, phase: 'out' };
    this.hookedCrate = null;
    this.audio.play('hook-throw');
  }

  /**
   * Fly the hook out, latch anything it passes, and drag it home.
   *
   * The cable and head are drawn for the whole flight, empty or not. A reel
   * that only appears on a successful grab teaches nothing about its aim.
   */
  private updateReel(dt: number): void {
    if (this.hook === null) {
      this.reelLine.visible = false;
      this.reelHead.visible = false;
      return;
    }

    this.hook = stepHook(this.hook, dt, REEL_RANGE);

    // Where the head is this frame: along the throw while outbound, and
    // pulled back to the player on the way home.
    this.hookAt
      .copy(this.hookDir)
      .multiplyScalar(this.hook.distance)
      .add(this.hookOrigin);

    // Latch on the way out only, so a returning hook does not sweep up
    // everything between it and the player.
    if (this.hook.phase === 'out' && this.hookedCrate === null) {
      const caught = pickReelTarget(this.salvage.targets, this.hookAt, this.hookDir);
      const nearby = this.salvage.targets.find(
        (t) => Math.hypot(t.x - this.hookAt.x, t.y - this.hookAt.y, t.z - this.hookAt.z) < 2.4,
      );
      const grab = nearby ?? (caught && this.hook.distance >= REEL_RANGE - 0.01 ? caught : null);
      if (grab && this.salvage.hook(grab.id)) {
        this.hookedCrate = grab.id;
        this.hook = { distance: this.hook.distance, phase: 'back' };
        this.audio.play('hook-catch');
      }
    }

    // A latched crate rides the hook home.
    if (this.hookedCrate !== null) {
      const crate = this.salvage.positionOf(this.hookedCrate);
      if (crate) crate.copy(this.hookAt);
      else this.hookedCrate = null;
    }

    const from = this.player.worldPosition;
    const points = this.reelLine.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (points) {
      points.setXYZ(0, from.x, from.y + 0.35, from.z);
      points.setXYZ(1, this.hookAt.x, this.hookAt.y, this.hookAt.z);
      points.needsUpdate = true;
      this.reelLine.visible = true;
    }
    this.reelHead.position.copy(this.hookAt);
    // Point it the way it is going, and spin it about that axis as it flies.
    // A hook that holds one attitude the whole way out reads as a prop being
    // slid along a wire; tumbling is most of what sells the throw. On the way
    // BACK it is dragging a crate, so it holds still -- a line under tension
    // does not let its end spin.
    this.reelHead.lookAt(this.hookAt.x + this.hookDir.x, this.hookAt.y + this.hookDir.y, this.hookAt.z + this.hookDir.z);
    if (this.hook.phase === 'out') this.reelHead.rotateZ(this.hook.distance * HOOK_SPIN);
    this.reelHead.visible = true;

    if (this.hook.phase === 'done') {
      if (this.hookedCrate !== null) {
        this.salvage.open(this.hookedCrate, (id, count) => {
          this.resources.deposit(id as Parameters<ResourceAccess['deposit']>[0], count);
        });
        this.hookedCrate = null;
      }
      this.hook = null;
      this.reelLine.visible = false;
      this.reelHead.visible = false;
    }
  }

  private collectKillReward(defId: string, source: string): void {
    const def = ENEMIES[defId];
    if (!def) return;
    const drops = rollDrops(def.drops, this.lootRng);
    if (drops.length === 0) return;

    for (const drop of drops) this.resources.deposit(drop.id, drop.count);
    this.bus.emit('loot:collected', { items: drops, source });
  }

  render(alpha: number): void {
    this.renderer.beginFrame();

    const frameDt = Math.min(this.clock.getDelta(), 0.1);
    const now = performance.now();

    this.player.update(alpha, frameDt);
    this.enemies.update(alpha, frameDt);
    this.salvage.update(frameDt, this.world.distanceTraveled, this.machine.speed);
    this.updateReel(frameDt);

    // Whether a throw would catch something, asked of the same function the
    // throw itself uses -- a cue derived from different rules to the mechanic
    // is a cue that lies.
    if (this.hook !== null) {
      this.reelReady = false;
    } else {
      const camera = this.activeCamera;
      camera.getWorldDirection(this.reelAim);
      this.reelReady =
        pickReelTarget(this.salvage.targets, camera.position, this.reelAim) !== null;
    }

    const camera = this.activeCamera;
    this.sandFX.update(frameDt, this.machine.speed, camera.position);
    this.impactFX.update(frameDt, camera.position);
    this.lampLights.update(frameDt, this.lampSamples(), camera.position);
    // Interpolate the world scroll before drawing it. The player and enemies
    // are already interpolated; without this the ground alone snaps to the
    // fixed step and everything standing on it appears to slide.
    // The legs walk against the distance the world will be DRAWN at, which is
    // a fraction of a step ahead of the simulation. Against the simulation's
    // own distance the feet skate on the sand by up to 0.125m at speed.
    const walked = renderedDistance(this.world.distanceTraveled, alpha, this.machine.speed);
    const plants = this.machine.updateVisuals(walked);
    // Footfalls, and the dust that goes with them, are made where a foot
    // actually lands at the moment it lands — not laid down by the metre.
    for (const leg of plants) {
      const foot = this.machine.footPosition(leg);
      this.tracks.press(foot);
      this.sandFX.footfall(foot, this.machine.speed);
      // The sound the whole audio pass exists for. Positional, so a foot
      // landing to port is heard to port -- the machine is sixteen metres long
      // and the player is standing on it, which is close enough that four
      // identical centred thuds would read as a loop rather than as a walk.
      this.audio.play('footfall', foot.x - this.player.worldPosition.x, foot.z - this.player.worldPosition.z);
    }
    // Where the player is standing, and what the desert is doing, before the
    // drone is asked how loud it should be. Both are level-triggered and both
    // ramp, so a doorway is a threshold rather than a switch.
    this.audio.setInterior(this.playerIsIndoors);
    this.audio.updatePad(padPlaying(this.threatPhase));
    this.audio.updateDrone(this.machine.speed, BASE_MACHINE_SPEED);
    // Given the same walked distance the legs are driven by, so a print and
    // the foot that made it agree about which piece of ground they are on --
    // and so both agree with the dunes. `TrackMarks` takes its scroll from the
    // delta of this rather than from wall time; see its `update`.
    this.tracks.update(walked);
    this.world.applyRenderOffset(alpha, this.machine.speed);
    this.world.update(this.clock.elapsedTime);

    if (this.sky.update(now)) this.applySky();

    this.hud.update({
      health: this.player.stats.health,
      maxHealth: this.player.stats.maxHealth,
      ammoInMag: this.combat.current.ammoInMag,
      reserveAmmo: this.combat.current.reserveAmmo,
      infiniteAmmo: this.combat.current.infiniteReserve,
      reelReady: this.reelReady,
      weaponName: this.combat.current.def.name,
      machineSpeed: this.machine.speed,
      distanceTraveled: this.world.distanceTraveled,
      spread: this.combat.currentSpread(this.playerCamera.isAiming),
      moving: this.player.speed > 0.1,
      pointerLocked: this.input.pointerLocked,
      playerX: this.player.worldPosition.x,
      playerZ: this.player.worldPosition.z,
      cameraYaw: this.playerCamera.yawAngle,
      enemiesAboard: this.enemies.activeCount,
      deckHalfWidth: this.machine.deckBounds.max.x,
      deckHalfLength: this.machine.deckBounds.max.z,
      machineCondition: conditionLabel(this.machine.damage.damaged()),
      machineStopped: this.machine.damage.isStopped,
      powerDraw: this.machine.power.draw,
      powerCapacity: this.machine.power.capacity,
      fuel: this.machine.power.fuel,
      powerShed: this.powerShed,
      hydration: this.player.needs.hydration,
      nourishment: this.player.needs.nourishment,
    });

    this.inventoryUI.update({
      countOf: this.countOf,
      canCraft: this.canCraft,
      stationNote: this.stationNote(),
    });

    if (this.buildMode) {
      this.buildUI.update({
        piece: this.selectedPiece,
        category: this.buildCategory,
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
   * Is the player standing inside an enclosed room?
   *
   * The build level is derived the same way build mode derives it — from the
   * height above the deck — so a player on the second storey is asked about
   * the second storey's rooms rather than about the ones underneath them.
   *
   * Exposed because the browser harness has no other way to ask: the duck it
   * measures is a gain ramp, and the thing worth checking is that the game
   * agrees with the room model about where the player is.
   */
  get playerIsIndoors(): boolean {
    const at = this.player.worldPosition;
    const level = Math.max(
      0,
      Math.min(GRID_LEVELS - 1, Math.round((at.y - DECK_HEIGHT - 1) / LEVEL_HEIGHT)),
    );
    return insideEnclosed(this.build.rooms, worldToCell(at.x, at.z, level));
  }

  /**
   * Every lamp and whether it has power — and, in the same pass, its glow.
   *
   * Both jobs here rather than in the fixed step because both are presentation:
   * the pool is renderer state and the emissive is a material. Every lamp is
   * visited, not just the lit ones, because a lamp that has just shed has to
   * be TOLD to go dark — it is no longer in the lit set to be found.
   */
  private lampSamples(): LampSample[] {
    const out: LampSample[] = [];
    for (const lamp of this.build.lamps()) {
      const lit = this.machine.power.isPowered(lamp.instanceId);
      this.build.setLampLit(lamp.instanceId, lit);
      out.push({
        id: lamp.instanceId,
        x: lamp.position.x,
        y: lamp.position.y,
        z: lamp.position.z,
        lit,
      });
    }
    return out;
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

    const decision = this.director.update(
      this.world.distanceTraveled,
      this.enemies.activeCount,
      this.player.stats.health / this.player.stats.maxHealth,
    );

    // Announced once, on the edge, rather than polled: the HUD's alert is a
    // timed banner and re-triggering it every frame would pin it up forever.
    if (decision.entered && decision.entered !== this.threatPhase) {
      this.threatPhase = decision.entered;
      this.bus.emit('threat:phase', {
        phase: decision.entered,
        wavesSurvived: this.director.waves,
      });
    }

    if (!decision.spawn) return;
    const request = decision.spawn;

    const bounds: Bounds = {
      halfWidth: this.machine.deckBounds.max.x,
      halfLength: this.machine.deckBounds.max.z,
      // Literally the same height `deckSpawn` drops the player from. It used
      // to be `deckBounds.min.y + 1.0`, which reads like the same trick and is
      // half a deck plate lower — low enough to land the capsule inside the
      // plate collider, which the character controller answers by never moving
      // it again.
      deckY: CHARACTER_DROP_Y,
    };
    // The perimeter ring can dip into the prow or the engine block depending
    // on which edge wins (see blockedSpawnCellKeys above), so every candidate
    // is checked against the machine's own equipment footprint. If every
    // candidate that call produced is blocked, the open mid-deck spot is a
    // far better fallback than losing the arrival outright — the director has
    // already taken this body off the wave by the time we get here.
    const at =
      this.spawner.placementFor(bounds, this.player.worldPosition, this.isSpawnBlocked) ??
      this.machine.deckSpawn;

    const enemy = this.enemies.spawn(request.defId, new THREE.Vector3(at.x, at.y, at.z));
    if (!enemy && import.meta.env.DEV) {
      // Should be unreachable: the director's own cap check confirmed room in
      // the pool before releasing this body. If it ever fires, an arrival the
      // wave promised is gone rather than merely delayed.
      console.warn('updateSpawns: EnemyManager.spawn returned null despite the cap check passing.');
    }
  }

  // -------------------------------------------------------------------------
  // The opening (Phase 2)
  // -------------------------------------------------------------------------

  /**
   * Decide what this boot sees first.
   *
   * Called by `main` after construction rather than from the constructor, so
   * the caller's URL params are the only thing that decides it and there is
   * exactly one place to read the answer off.
   */
  boot(): void {
    if (this.options.forceOpening) {
      this.beginOpening('new-game');
      return;
    }
    if (this.options.menu === false || !this.titleScreen) {
      // Exactly today's boot: no menu, no opening, straight into gameplay.
      this.beginOpening('skipped');
      return;
    }
    this.enterTitle();
  }

  private beginOpening(mode: OpeningMode): void {
    this.applyOpeningEffects(this.opening.begin(mode));
    this.bus.emit('opening:phase', { phase: this.opening.phase });
  }

  /** Feed the director this step and obey whatever it asks for. */
  private updateOpening(dt: number): void {
    const before = this.opening.phase;
    if (before === 'title' || before === 'done') return;

    this.applyOpeningEffects(
      this.opening.update({
        playerGrounded: this.player.isGrounded,
        playerPos: this.player.worldPosition,
        // A HOLD, and only during the chase. Esc is also 'cancel', so a tap
        // would skip the opening every time a player shut a panel.
        skipHeld: before === 'rooftop' && this.input.isDown('cancel'),
        dt,
      }),
    );

    if (this.opening.phase !== before) {
      this.bus.emit('opening:phase', { phase: this.opening.phase });
    }

    // The meter is the director's own accumulator, not a second timer that
    // could disagree with the thing it is drawing.
    if (this.opening.phase === 'rooftop') {
      this.titleScreen?.showSkipHint(this.opening.skipProgress);
    } else {
      this.titleScreen?.hideSkipHint();
    }
  }

  private applyOpeningEffects(effects: readonly OpeningEffect[]): void {
    for (const effect of effects) {
      switch (effect) {
        case 'spawn-rooftop':
          this.raiseRooftop();
          break;
        case 'grant-weapons':
          this.setArmed(true);
          break;
        case 'throttle-up':
          this.machine.movement.setThrottle(1);
          break;
        case 'show-title-card':
          this.titleScreen?.showTitleCard(GAME_TITLE);
          break;
        case 'teardown-rooftop':
          this.releaseRooftop();
          break;
      }
    }
  }

  /**
   * Put up the building, and put the player and their pursuers on it.
   *
   * The machine goes to throttle 0 for the duration: it idles alongside, so
   * the chase happens on solid unmoving ground and nothing has to be a moving
   * platform. The landing is what starts it walking again.
   */
  private raiseRooftop(): void {
    this.leaveTitle();
    this.rooftop?.dispose();

    const set = new RooftopSet(this.renderer.scene, this.physics, this.materials);
    set.build();
    // `set.applyClutter(model)` is the seam a verified CC0 rooftop pack drops
    // into — see ASSETS.md. Nothing fetches one today, deliberately: a URL
    // pointing at a file that is not there costs a 404 in every console for a
    // decoration, and the roof reads fine without it.
    this.rooftop = set;
    this.rooftopScrolling = false;

    this.machine.movement.setThrottle(0);
    this.setArmed(false);

    this.player.setSpawn(set.playerSpawn);
    this.player.teleport(set.playerSpawn);
    this.player.stats.reset();

    // Distance-driven arrivals stay off while the deck is empty: a wave
    // dropped on an unattended machine would be waiting on it at the landing.
    this.enemySpawnsEnabled = false;
    this.enemies.despawnAll();
    for (const at of set.enemySpawns) this.enemies.spawn('scavenger', at);

    this.setHudVisible(true);
  }

  /**
   * Let the building go astern with the world.
   *
   * Anyone still standing on it — a skip, mostly — is put on the deck first:
   * its colliders are about to start moving out from under them.
   */
  private releaseRooftop(): void {
    if (!isDeckLanding(this.player.worldPosition)) {
      this.player.teleport(this.machine.deckSpawn);
    }
    this.player.setSpawn(this.machine.deckSpawn);
    this.rooftopScrolling = true;
    this.enemySpawnsEnabled = this.options.enemySpawns ?? true;
  }

  /** Weapons in hand, and a trigger that reaches them. */
  private setArmed(armed: boolean): void {
    this.armed = armed;
    if (armed) this.equipHeldWeapon();
    else this.player.setHeldWeapon(null, null);
  }

  /** Is the player carrying their loadout? Read by the opening harness. */
  get playerArmed(): boolean {
    return this.armed;
  }

  // -------------------------------------------------------------------------
  // Title screen and pause menu
  // -------------------------------------------------------------------------

  /**
   * The menu, over a live machine walking the dunes.
   *
   * The simulation keeps running — the machine, the world, the sky — because
   * the whole idea of the title screen is that its background is the game.
   * What stops is the player rig, which is what `cinematicCamera` gates.
   */
  private enterTitle(): void {
    const preset = CAMERA_PRESETS[TITLE_PRESET];
    this.titleCamera = this.renderer.camera;
    if (preset) {
      this.titleCamera.position.copy(preset[0]);
      this.titleCamera.lookAt(preset[1]);
    }
    this.state.paused = false;
    this.machine.movement.setThrottle(1);
    this.enemies.despawnAll();
    this.setHudVisible(false);
    this.releasePointerLock();
    this.titleScreen?.show('boot');
  }

  private leaveTitle(): void {
    this.titleCamera = null;
    this.state.paused = false;
    this.setHudVisible(true);
    this.titleScreen?.hide();
    if (!this.options.bypassPointerLock) this.input.requestPointerLock();
  }

  private startNewGame(): void {
    // Fresh state before the opening, so New Game after a session in progress
    // does not start the chase over a deck the last run built.
    this.world.reset(0);
    this.spawner.resync(0);
    this.build.clear();
    this.resetInventory();
    this.combat.equip('rifle');
    this.player.stats.reset();
    this.player.needs.reset();
    this.announcedNeeds = null;
    this.closePanels();
    this.beginOpening('new-game');
  }

  private async continueGame(): Promise<void> {
    const slot = await this.newestSave();
    this.leaveTitle();
    if (slot) await this.loadFrom(slot);
    // Straight to `done` either way: a player who asked to continue and had
    // nothing to continue should land in the game, not in the opening.
    this.beginOpening('continue');
  }

  private async hasSave(): Promise<boolean> {
    return (await this.newestSave()) !== null;
  }

  private async newestSave(): Promise<string | null> {
    try {
      const slots = await this.saves.list();
      if (slots.length === 0) return null;
      return slots.includes('quicksave') ? 'quicksave' : (slots[0] ?? null);
    } catch {
      return null;
    }
  }

  /** `Esc` in play. The world genuinely stops behind it. */
  pause(): void {
    if (!this.titleScreen || this.titleScreen.isOpen) return;
    this.state.paused = true;
    this.releasePointerLock();
    this.titleScreen.show('pause');
  }

  resume(): void {
    if (!this.titleScreen) return;
    this.state.paused = false;
    this.titleScreen.hide();
    if (!this.options.bypassPointerLock) this.input.requestPointerLock();
  }

  /**
   * Can `Esc` open the menu right now?
   *
   * Not during the chase: up there `Esc` is the skip, and a menu that opened
   * on the first frame of the hold would eat it.
   */
  private get canPause(): boolean {
    return (
      this.titleScreen !== null &&
      !this.titleScreen.isOpen &&
      this.opening.phase !== 'rooftop' &&
      !this.cinematicCamera
    );
  }

  private setHudVisible(visible: boolean): void {
    this.options.hudRoot.classList.toggle('is-hidden', !visible);
  }

  private applySettings(settings: GameSettings): void {
    this.audio.setVolume(settings.volume);
    // A `?quality=` in the URL is a deliberate override for a harness or a
    // screenshot, and must outrank a stored preference.
    if (settings.quality && !this.options.qualityTier) this.setQuality(settings.quality);
  }

  /**
   * How far the deck moved under a point this step. Bound once so the enemy
   * manager can sample it per body without allocating a closure per tick.
   *
   * Anything below the deck is out on the sand, which the machine is walking
   * away from rather than carrying — see `ON_THE_SAND_Y`.
   */
  private readonly carryOnDeck = (p: THREE.Vector3): { x: number; y: number; z: number } =>
    p.y < ON_THE_SAND_Y ? ZERO_CARRY : this.machine.carryFor(p);

  /**
   * Put the equipped weapon in the player's hand.
   *
   * Driven off `weapon:equipped` rather than polled, so the model swaps on the
   * same event the HUD's weapon name does and the two cannot disagree about
   * what is being held.
   */
  equipHeldWeapon(): void {
    const id = this.combat.current.def.id;
    this.player.setHeldWeapon(id, this.weaponModels.get(id) ?? null);
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

  /**
   * Interactables the player is currently near.
   *
   * Repair targets are gathered alongside the stations rather than in a system
   * of their own, because a broken thing you walk up to and hold E on is
   * exactly what `InteractionSystem` already picks between. `repairTargets` is
   * rebuilt here so the driver below can look one up by the id the nearest
   * interactable carries.
   */
  private candidates(): Interactable[] {
    const at = this.player.worldPosition;
    this.repairTargets.clear();

    // A condenser and a planter are stations on the grid but not stations at
    // the prompt: E collects from them rather than opening a recipe list. The
    // table decides which, so neither this loop nor the opener holds a list of
    // machine names it could get out of step with.
    const out: Interactable[] = this.build.stationsNear(at, INTERACT_REACH).map((station) => ({
      id: station.instanceId,
      label: BUILD_PIECES[station.piece].name,
      position: station.position,
      kind: (isProducer(station.piece) ? 'producer' : station.piece) as Interactable['kind'],
    }));

    // Subsystems are serviced at their access panel, NOT at their hitbox: four
    // of the five hips are outboard of the deck and below it, so there is
    // nowhere to stand at one.
    for (const id of Object.keys(SUBSYSTEMS) as SubsystemId[]) {
      const missing = 1 - this.machine.damage.fraction(id);
      if (missing <= 0) continue;
      const panel = SUBSYSTEMS[id].repairAt;
      this.repairPoint.set(panel.x, panel.y, panel.z);
      if (this.repairPoint.distanceTo(at) > INTERACT_REACH) continue;
      this.repairTargets.set(id, { id, kind: 'subsystem', missingFraction: missing });
      out.push({
        id,
        label: SUBSYSTEMS[id].name,
        position: this.repairPoint.clone(),
        kind: 'repair',
      });
    }

    for (const piece of this.build.damagedNear(at, INTERACT_REACH)) {
      this.repairTargets.set(piece.instanceId, {
        id: piece.instanceId,
        kind: 'structure',
        pieceId: piece.piece,
        missingFraction: piece.missingFraction,
      });
      out.push({
        id: piece.instanceId,
        label: BUILD_PIECES[piece.piece].name,
        position: piece.position,
        kind: 'repair',
      });
    }

    return out;
  }

  /**
   * Drive the hold-to-repair, and say what it is doing.
   *
   * Returns the prompt line, so the caller's own prompt logic stays one place.
   * Null when this is not a repair target at all.
   */
  private updateRepair(dt: number, nearest: Interactable | null): string | null {
    const target = nearest?.kind === 'repair' ? (this.repairTargets.get(nearest.id) ?? null) : null;
    const holding = !this.buildMode && !this.panelsOpen && this.input.isDown('interact');
    const tick = this.repair.update(dt, target, holding, this.resources);

    if (!target || !nearest) return null;

    if (tick.completed) {
      if (target.kind === 'subsystem') {
        this.machine.damage.repair(target.id as SubsystemId, Number.POSITIVE_INFINITY);
      } else {
        this.build.repairPiece(target.id, Number.POSITIVE_INFINITY);
      }
      this.audio.play('build-place');
      return `${nearest.label} repaired`;
    }

    if (tick.blocked === 'cannot-afford') {
      return `Need ${tick.cost?.scrap ?? 0} scrap to repair ${nearest.label}`;
    }

    const cost = tick.cost?.scrap ?? 0;
    const pct = Math.round(this.repair.progress * 100);
    return this.repair.progress > 0
      ? `Repairing ${nearest.label}... ${pct}%`
      : `[Hold E] Repair ${nearest.label} — ${cost} scrap`;
  }

  private updatePanels(dt: number): void {
    const nearest = this.cinematicCamera
      ? null
      : this.interaction.update(this.player.worldPosition, this.candidates());

    const repairPrompt = this.updateRepair(dt, nearest);

    if (this.input.consumePressed('inventory')) {
      if (this.panelsOpen) this.closePanels();
      else this.openInventory();
    }

    if (this.input.consumePressed('cancel')) {
      if (this.panelsOpen) this.closePanels();
      else if (this.canPause) this.pause();
    }

    // E is 'rotate-right' in build mode, so interaction stays out of its way.
    if (!this.buildMode && this.input.consumePressed('contextual')) this.fireReel();

    if (!this.buildMode && this.input.consumePressed('interact')) {
      if (this.panelsOpen) this.closePanels();
      // A repair is a HOLD, and `updateRepair` owns it. Opening something on
      // the press that starts the hold would put a panel over the player's
      // face for the whole of it.
      else if (nearest && nearest.kind !== 'repair') this.openInteractable(nearest);
    }

    this.hud.setPrompt(
      this.panelsOpen ? null : (repairPrompt ?? this.promptFor(nearest)),
    );
  }

  /** What standing at something says. Null when standing at nothing. */
  private promptFor(nearest: Interactable | null): string | null {
    if (!nearest) return null;
    if (nearest.kind === 'producer') return this.producerPrompt(nearest);
    if (nearest.kind !== 'generator') return `[E] Open ${nearest.label}`;

    const power = this.machine.power;
    const tank = `${Math.floor(power.fuel)}/${FUEL_TANK_CAP}`;
    const carried = this.resources.count('fuel');
    if (carried <= 0) return `${nearest.label} — ◆ ${tank}`;
    if (power.fuel >= FUEL_TANK_CAP) return `${nearest.label} — tank full ◆ ${tank}`;
    return `[E] Refuel ${nearest.label} — ◆ ${tank} (carrying ${carried})`;
  }

  /**
   * What standing at a condenser or a planter says.
   *
   * Three states, and the middle one is the interesting one: a device with
   * nothing ready still tells the player it is working and roughly how far
   * along it is. Without that, an empty condenser and a broken one look the
   * same, and the player concludes it is broken.
   */
  private producerPrompt(nearest: Interactable): string | null {
    const ref = this.build
      .producersNear(this.player.worldPosition, INTERACT_REACH)
      .find((p) => p.instanceId === nearest.id);
    if (!ref) return null;

    if (ref.stored > 0) {
      const item = ITEMS[ref.itemId];
      return `[E] Collect ${ref.stored} ${item.name} — ${item.glyph}`;
    }

    const role = producerRoleOf(ref.piece);
    if (role?.needsPower && !this.machine.power.isPowered(ref.instanceId)) {
      return `${nearest.label} — NO POWER`;
    }
    return `${nearest.label} — working ${Math.floor(ref.fraction * 100)}%`;
  }

  /**
   * Take a producer's output. Returns false when there was nothing to take,
   * so the caller leaves the prompt alone rather than reporting a collection
   * that never happened.
   *
   * Limited by the room the player actually has: a bag with space for one
   * bunch takes one and leaves the other two growing, which is strictly better
   * than emptying the box onto the deck.
   */
  private claimProducer(instanceId: string): boolean {
    const ref = this.build
      .producersNear(this.player.worldPosition, INTERACT_REACH)
      .find((p) => p.instanceId === instanceId);
    if (!ref || ref.stored <= 0) return false;

    const room = this.resources.roomFor(ref.itemId);
    if (room <= 0) return false;

    const taken = this.build.claimProducer(instanceId, room);
    if (!taken) return false;

    this.resources.deposit(taken.itemId, taken.count);
    this.bus.emit('loot:collected', {
      items: [{ id: taken.itemId, count: taken.count }],
      source: BUILD_PIECES[ref.piece].name,
    });
    return true;
  }

  openInventory(): void {
    this.inventoryUI.setMode('inventory', { title: 'Inventory' });
    this.releasePointerLock();
  }

  /** Open whatever the player is standing at. Returns false if nothing is. */
  openInteractable(target: Interactable | null = this.interaction.current): boolean {
    if (!target) return false;
    // A repair has no panel. `updateRepair` drives it from the held key.
    if (target.kind === 'repair') return false;

    // The generator has no panel either: E tips the fuel in and you get on
    // with it. A transfer screen for a tank with one thing in it would be
    // three clicks where one will do.
    if (target.kind === 'generator') return this.depositFuel();

    // Nor does a condenser or a planter: E takes what is ready and you get on
    // with it, for exactly the reason the generator has no panel.
    if (target.kind === 'producer') return this.claimProducer(target.id);

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

  /**
   * Tip every fuel unit within reach into the machine's tank.
   *
   * Takes only what fits, and consumes only what was taken — a player standing
   * at a full tank with a bag of fuel must still have that bag afterwards.
   * Returns false when there was nothing to do, so the caller can leave the
   * prompt alone rather than reporting a deposit that never happened.
   */
  depositFuel(): boolean {
    const carried = this.resources.count('fuel');
    if (carried <= 0) return false;

    const accepted = this.machine.power.addFuel(carried);
    if (accepted <= 0) return false;

    this.resources.consume({ fuel: accepted });
    this.audio.play('build-place');
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

    // Water and rations, refused at a full meter for exactly the reason a
    // repair kit is refused at full health: a misclick that burns a bottle for
    // nothing is worse than a click that does nothing.
    if (slot.itemId === 'water' || slot.itemId === 'rations') {
      const needs = this.player.needs;
      const before = slot.itemId === 'water' ? needs.hydration : needs.nourishment;
      if (before >= NEEDS_MAX) return false;
      if (slot.itemId === 'water') needs.drink();
      else needs.eat();
      this.inventory.remove(slot.itemId, 1);
      this.audio.play('pickup');
      // Announce immediately: a meter that jumps only on the next integer
      // edge would leave the HUD a second behind the swallow.
      this.announcedNeeds = null;
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

  /**
   * The line over the recipe list at an open station.
   *
   * Null almost always: this is the panel's exception channel, not a status
   * bar, and a permanent banner would stop being read within a minute.
   */
  private stationNote(): string | null {
    const open = this.interaction.current;
    if (!open || open.kind !== 'refinery') return null;
    return this.machine.power.isPowered(open.id) ? null : 'NO POWER';
  }

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

  /**
   * Move to the next group, and take the selection with it.
   *
   * The selection moves because leaving it behind is how a player presses `G`,
   * presses `1`, and gets a deck plate when the panel is showing them chairs.
   */
  cycleBuildCategory(): void {
    const at = PIECE_CATEGORIES.indexOf(this.buildCategory);
    const next = PIECE_CATEGORIES[(at + 1) % PIECE_CATEGORIES.length] ?? 'structure';
    this.buildCategory = next;
    const first = piecesInCategory(next)[0];
    if (first) this.selectedPiece = first;
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

    // Page between structure, stations and comforts. The number keys only
    // reach nine and the table holds eighteen, so a group is what makes the
    // last of them selectable at all — see `BuildUI`.
    if (this.input.consumePressed('build-category')) this.cycleBuildCategory();

    piecesInCategory(this.buildCategory).forEach((id, i) => {
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
      case 'mute':
        this.audio.toggleMute();
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
    | 'mute'
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
        needs: this.player.needs.toSave(),
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
        // Written for real at last. `machine.fuel` has been in the schema
        // since v1 and written as a flat 100 ever since, so a save from before
        // power existed loads as a comfortably full tank — which needs no
        // migration and no version bump.
        fuel: this.machine.power.toSave().fuel,
        coreHealth: 100,
        navigationTier: 0,
        subsystems: this.machine.damage.toSave(),
      },
      // Optional field, so no version bump and no migration: a save written
      // before the opening existed reads back as `undefined`, and a loader
      // treats that the same way it treats a finished one — see `loadFrom`.
      progression: { unlocks: [], opening: this.opening.toSave() },
      world: {
        chunkIndex: Math.floor(this.world.distanceTraveled / 64),
        threatDirector: this.director.toSave(),
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
    // A save written before the director existed restores as a fresh one from
    // the same seed, which is the same thing a new game gets.
    if (save.world.threatDirector) this.director.restore(save.world.threatDirector);
    this.threatPhase = this.director.currentPhase;

    // Inventory before structures: rebuilding a crate creates an empty
    // container that the piece's own state then fills, and restoring the
    // player's bag afterwards would be sequencing two writes to the same
    // aggregate for no reason.
    this.inventory.restore(save.player.inventory ?? []);
    // The tank BEFORE the structures: rebuilding them re-registers every
    // producer and consumer, and they should settle against the fuel the save
    // actually holds rather than briefly against a fresh tank.
    this.shedClasses.clear();
    this.machine.power.clearDevices();
    this.machine.power.restore({ fuel: save.machine.fuel });
    this.build.restore(save.machine.structures ?? []);
    // Absent in every save written before machine damage, and absent means
    // undamaged — which is what `restore` does with it.
    this.machine.damage.restore(save.machine.subsystems);
    this.bus.emit('inventory:changed', { scrap: this.inventory.count('scrap') });

    this.player.teleport(
      new THREE.Vector3(save.player.position.x, save.player.position.y, save.player.position.z),
    );
    this.player.stats.reset();
    // Absent in every save written before Phase 4, and absent means full — see
    // `SaveSchema`. The announcement is cleared so the first tick after the
    // load emits the restored meters rather than comparing them to the old
    // game's.
    this.player.needs.restore(save.player.needs);
    this.announcedNeeds = null;
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

    // A loaded game is a game that has already been played, so it never gets
    // the opening — including a save from before the opening existed, whose
    // missing field restores as `done` for exactly that reason.
    this.opening.restore(save.progression.opening ?? { phase: 'done' });
    if (this.rooftop) {
      this.rooftop.dispose();
      this.rooftop = null;
      this.rooftopScrolling = false;
    }
    this.player.setSpawn(this.machine.deckSpawn);
    this.setArmed(true);
    this.machine.movement.setThrottle(1);
    this.bus.emit('opening:phase', { phase: this.opening.phase });

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
    this.disconnectSounds();
    this.audio.dispose();
    window.removeEventListener('resize', this.onResize);
    this.loop.stop();
    this.input.dispose();
    this.rooftop?.dispose();
    this.rooftop = null;
    this.titleScreen?.dispose();
    this.hud.dispose();
    this.buildUI.dispose();
    this.inventoryUI.dispose();
    this.buildPreview.dispose();
    this.lampLights.dispose();
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
