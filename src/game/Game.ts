import { DECK_SURFACE_Y } from './constants';
import nomadProfile from '@/data/iron-nomad.json';
import { SignalBattleScene } from '@/story/SignalBattleScene';
import { RadioRaids } from '@/story/RadioRaids';
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
import {
  loadDefenseModels,
  authoredEnemyModel,
  authoredModel,
  prepareAuthoredModel,
} from '@/art/DefenseModels';
import { loadSalvageModels } from '@/art/SalvageModels';
import { disposeAutomationModels, loadAutomationModels } from '@/art/AutomationModels';
import { loadMachineStationVisualModels } from '@/art/MachineDetailModels';
import { warmAuthoredGraphics } from '@/art/Warmup';
import { loadTextureSets } from '@/art/TextureLoader';
import { disposeLoadedModel, loadModel, type LoadedModel } from '@/art/ModelLoader';
import { loadPropModels } from '@/world/PropModels';
import { duneHeightAt } from '@/world/DuneField';
import { updateFogColor } from '@/art/Fog';
import { WorldManager, renderedDistance, WORLD_Z_PER_METRE } from '@/world/WorldManager';
import { Machine } from '@/machine/Machine';
import { installNavigationHelm } from '@/machine/MachineGeometry';
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';
import { conditionLabel } from '@/ui/MachineCondition';
import { RepairSystem, type RepairTarget } from '@/interaction/RepairSystem';
import type { BodyPose } from '@/machine/MachineBody';
import { Player } from '@/player/Player';
import { PlayerCamera } from '@/player/PlayerCamera';
import { PlayerCombat } from '@/player/PlayerCombat';
import { isDamageable, type Damageable } from '@/combat/Damageable';
import { EnemyManager } from '@/enemies/EnemyManager';
import { EnemySpawner, type Bounds, type Vec3Like } from '@/enemies/EnemySpawner';
import { ThreatDirector, type ThreatPhase } from '@/enemies/ThreatDirector';
import { SandFX } from '@/fx/SandFX';
import { TrackMarks } from '@/fx/TrackMarks';
import { AudioEngine } from '@/audio/AudioEngine';
import { connectGameSounds } from '@/audio/GameSounds';
import { ImpactFX } from '@/fx/ImpactFX';
import { HUD } from '@/ui/HUD';
import { DefenseHUD } from '@/ui/DefenseHUD';
import { SaveManager } from '@/save/SaveManager';
import { Container } from '@/items/Container';
import { ResourceAccess } from '@/items/ResourceAccess';
import { ITEMS, PLAYER_INVENTORY_SLOTS, STARTING_INVENTORY, type ItemId } from '@/data/items';
import { STARTING_FUEL } from '@/data/power';
import { CraftingSystem } from '@/crafting/CraftingSystem';
import { recipeById, type Recipe, type StationId } from '@/data/recipes';
import {
  InteractionSystem,
  INTERACT_REACH,
  type Interactable,
} from '@/interaction/InteractionSystem';
import { InventoryUI } from '@/ui/InventoryUI';
import { BuildSystem } from '@/building/BuildSystem';
import { BuildPreview } from '@/building/BuildPreview';
import { LampLights, type LampSample } from '@/building/LampLights';
import { BuildUI } from '@/ui/BuildUI';
import {
  BUILD_PIECES,
  canBuildPiece,
  PIECE_CATEGORIES,
  piecesInCategory,
  STARTING_STRUCTURES,
  type PieceCategory,
  type PieceId,
} from '@/data/build-pieces';
import { FUEL_BURN_PER_S, FUEL_TANK_CAP, powerRoleOf } from '@/data/power';
import { routeCards } from '@/data/routes';
import { TURRETS } from '@/data/turrets';
import { isProducer, producerRoleOf, NEEDS_MAX } from '@/data/needs';
import { countEnclosed, insideEnclosed } from '@/building/RoomDetector';
import type { Placement } from '@/building/BuildValidation';
import { padPlaying } from '@/audio/SoundBank';
import { cellKey, parseCellKey, worldToCell } from '@/building/BuildGrid';
import {
  CHARACTER_DROP_Y,
  DECK_HEIGHT,
  DESERT_FLOOR_HALF_X,
  DESERT_FLOOR_HALF_Z,
  DESERT_FLOOR_Y,
  GRID_LEVELS,
  GRID_TILE,
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
import { VehicleManager } from '@/vehicles/VehicleManager';
import { VehicleScene } from '@/vehicles/VehicleScene';
import { GunboatScene } from '@/vehicles/GunboatScene';
import type { VolleyTarget } from '@/vehicles/VolleyPlanner';
import { VEHICLES, GUNBOAT } from '@/data/vehicles';
import { DefenseSystem } from '@/defense/DefenseSystem';
import {
  AutomaticDefenseSystem,
  type AutomaticDefenseTarget,
} from '@/defense/AutomaticDefenseSystem';
import { AutomaticSalvageCollector } from '@/salvage/AutomaticSalvageCollector';
import {
  isDeckLanding,
  OpeningDirector,
  type OpeningEffect,
  type OpeningMode,
} from '@/game/OpeningDirector';
import { GAME_TITLE, TitleScreen, type GameSettings } from '@/ui/TitleScreen';
import { GameLoop, type LoopCallbacks } from './GameLoop';
import { createGameState, type GameState } from './GameState';
import { FirstRunDirector, type FirstRunFact, type FirstRunSnapshot } from './FirstRunDirector';
import { Progression } from '@/progression/Progression';
import type { UpgradeBranch, UpgradeId } from '@/data/upgrades';
import { StoryDirector, type StoryEffect } from '@/story/StoryDirector';
import { Destination } from '@/story/Destination';
import {
  buildRadioModel,
  applyUpgradeVisuals,
  applyTurretUpgradeVisual,
} from '@/art/ExpeditionModels';
import { RadioUI } from '@/ui/RadioUI';
import { ResearchUI, type ResearchUIState } from '@/ui/ResearchUI';
import { ExpeditionUI } from '@/ui/ExpeditionUI';
import { SessionMetrics } from '@/game/SessionMetrics';
import { footprintOverlapsExpedition } from '@/game/ExpeditionBuildConflict';

/**
 * Free-fly camera presets, shared by the screenshot harness (`?cam=`) and the
 * title screen's backdrop.
 *
 * Here rather than in `main.ts` because the title screen is inside `Game` and
 * a second copy of `far`'s numbers is exactly how the menu's shot and the
 * screenshot harness's would quietly drift apart.
 */
export const CAMERA_PRESETS: Record<string, [THREE.Vector3, THREE.Vector3]> = {
  far: [new THREE.Vector3(-28, 23, -32), new THREE.Vector3(0, 12, 0)],
  front: [new THREE.Vector3(-26, 21, -30), new THREE.Vector3(0, 12, 0)],
  side: [new THREE.Vector3(-34, 18, 2), new THREE.Vector3(0, 12, 0)],
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
  /** One skiff encounter at a time; visuals are supplied by Astra's seam. */
  readonly vehicleManager: VehicleManager;
  readonly vehicleScene: VehicleScene;
  readonly gunboatScene: GunboatScene;
  readonly defense: DefenseSystem;
  readonly automaticDefense: AutomaticDefenseSystem;
  private readonly collectors = new Map<string, AutomaticSalvageCollector>();
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
  readonly defenseHUD: DefenseHUD;
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
  readonly radioUI: RadioUI;
  readonly researchUI: ResearchUI;
  readonly expeditionUI: ExpeditionUI;

  /**
   * Where the opening has got to. Exposed on `__game` for the harnesses.
   *
   * Phase 9 hangs the premise off its completion and Phase 15 replaces the
   * placeholder chase behind the same four phases.
   */
  readonly opening = new OpeningDirector();
  /** Pure, event-backed onboarding for the first playable loop. */
  readonly firstRun = new FirstRunDirector();
  readonly progression = new Progression();
  readonly sessionMetrics = new SessionMetrics();
  readonly story = new StoryDirector();
  readonly radioRaids = new RadioRaids();
  private signalBattle: SignalBattleScene | null = null;
  private readonly normalSunTarget = new THREE.Vector3();
  readonly destination: Destination;
  private readonly radioModel: THREE.Group;
  private readonly radioLamp: THREE.Object3D | null;
  private helmGyro: THREE.Object3D | null = null;
  private helmLamp: THREE.Object3D | null = null;
  private helmInteract: THREE.Object3D | null = null;
  /** Game owns this one walker source until final teardown; the machine only borrows clones. */
  private machineAuthoredModel: LoadedModel | null = null;
  private machineCollisionModel: LoadedModel | null = null;
  private readonly radioPowerConsumerId = 'fixed-radio';
  private readonly helmPowerConsumerId = 'navigation-helm';
  private playableStartedAt: number | null = null;
  private radioPowered = false;
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

  /** Autosave is coalesced and only written at a safe fixed-step checkpoint. */
  private autosavePending = false;
  private autosaveInFlight = false;
  private nextAutosaveAt = 60;
  private pendingSaveAndQuit = false;
  private tutorialReadyAt: number | null = null;
  /** Turret that armed the guided boarding countdown, even after dismount. */
  private tutorialTurretId: string | null = null;
  private tutorialStarted = false;
  private pendingBoardingOutcome: 'hull' | 'crew' | 'hook' | 'defended' | null = null;
  private scriptedGunboatPending = false;
  private gunboatResolutionApplied = false;
  private routeRefusal: string | null = null;
  /** Enemy ids landed by the active skiff; ambient enemies are never counted. */
  private readonly boardingEnemyIds = new Set<string>();
  private readonly defenseDamageables = new Map<string, Damageable>();
  private readonly automaticAimEnds = new Map<string, THREE.Vector3>();
  private readonly turretCameraAt = new THREE.Vector3();
  private readonly turretCameraDirection = new THREE.Vector3();
  private readonly turretCameraLookAt = new THREE.Vector3();
  private defenseImpact: {
    point: THREE.Vector3;
    normal: THREE.Vector3;
    targetId: string | null;
    onMetal: boolean;
  } | null = null;

  /** Rapier's wasm must be resolved before any physics object exists. */
  static async create(options: GameOptions): Promise<Game> {
    await initRapier();
    await Promise.all([
      loadDefenseModels(options.models !== false),
      loadSalvageModels(options.models !== false),
      loadAutomationModels(options.models !== false),
    ]);
    const game = new Game(options);
    if (options.models !== false) {
      const kits = await loadMachineStationVisualModels();
      game.machineAuthoredModel = kits.machine;
      game.machineCollisionModel = kits.collision;
      game.machine.applyAuthoredDetailModel(kits.machine, kits.collision);
      game.build.applyAuthoredStationKit(kits.stations);
      const authoredHelm =
        authoredModel('navigation-helm')?.scene ??
        kits.machine?.scene.getObjectByName('HelmRoot') ??
        kits.stations?.scene.getObjectByName('HelmRoot');
      if (authoredHelm) installNavigationHelm(game.machine.group, authoredHelm.clone(true));
    }
    // Models are installed once at boot. Searching the entire detailed walker
    // for these tiny anchors every simulation/render tick costs more than using them.
    game.helmGyro = game.machine.group.getObjectByName('GyroInstalled') ?? null;
    game.helmLamp = game.machine.group.getObjectByName('HelmPowerLamp') ?? null;
    game.helmInteract = game.machine.group.getObjectByName('HelmInteract') ?? null;

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

    const model =
      options.models === false
        ? null
        : (authoredEnemyModel('scavenger') ?? (await loadModel('models/scavenger.glb')));
    game.enemies.setModel(model);
    if (options.models !== false) {
      game.enemies.setModelFor(
        'raider',
        authoredEnemyModel('raider') ?? (await loadModel('models/scavenger.glb')),
      );
      for (const id of ['bastion', 'revenant', 'warden', 'sovereign']) {
        game.enemies.setModelFor(id, authoredEnemyModel(id));
      }
    }

    // The player is on screen from behind for the whole game, so this is the
    // most looked-at model in it. Same bargain as the rest: a missing file
    // costs a nicer-looking character, never a boot.
    game.player.setModel(
      options.models === false
        ? null
        : (authoredModel('player') ?? (await loadModel('models/player.glb'))),
    );

    // Weapons last, and in parallel: they are the smallest files and the least
    // load-bearing thing on screen, so nothing else should wait on them.
    if (options.models !== false) {
      const ids = Object.keys(WEAPON_MODELS);
      const loaded = await Promise.all(ids.map((id) => loadModel(WEAPON_MODELS[id]!.url)));
      ids.forEach((id, i) => {
        const m = loaded[i];
        if (m) {
          prepareAuthoredModel(m);
          game.weaponModels.set(id, m.scene);
        }
      });
      game.equipHeldWeapon();
    }

    if (options.models !== false) {
      const battle = game.prepareSignalBattle();
      const warmEnemies = game.enemies.prewarm([
        'bastion',
        'warden',
        'revenant',
        'sovereign',
        'bastion',
        'warden',
        'revenant',
        'sovereign',
      ]);
      const encounterAssets = [
        'manual-turret',
        'raider-skiff',
        'raider',
        'scavenger',
        'expedition-wreck',
      ]
        .map((id) => authoredModel(id)?.scene)
        .filter((root): root is THREE.Group => root !== undefined);
      // Upload/compile the extra actors during boot, before reception
      // can lock. Creating all five detailed rigs at the reveal causes a hitch.
      battle.root.visible = true;
      try {
        game.lampLights.update(1, game.lampSamples(), game.playerCamera.camera.position);
        const warmCamera = game.playerCamera.camera.clone();
        warmCamera.position.set(0, 22, 35);
        warmCamera.lookAt(0, 8, 0);
        await warmAuthoredGraphics(
          game.renderer.three,
          game.renderer.scene,
          game.playerCamera.camera,
          [...encounterAssets, battle.root],
          warmCamera,
        );
      } finally {
        battle.root.visible = false;
      }
      const sunTarget = game.renderer.sun.target.position.clone();
      try {
        battle.prewarm(game.playerCamera.camera, (camera, focus) => {
          game.renderer.sun.target.position.copy(focus);
          game.renderer.setSunDirection(game.sky.direction);
          game.post.setCamera(camera);
          game.post.render(0, game.renderer.scene, camera);
        });
      } finally {
        game.renderer.sun.target.position.copy(sunTarget);
        game.renderer.setSunDirection(game.sky.direction);
        // Keep real pooled materials and rigs alive so first boarding does not
        // allocate/fit eight characters or compile their first normal/depth pass.
        const warmCrewCamera = game.playerCamera.camera.clone();
        warmCrewCamera.position.set(0, 31.5, 13);
        warmCrewCamera.lookAt(0, 30.6, 0);
        warmEnemies.forEach((enemy, i) =>
          enemy.stageForWarmup(new THREE.Vector3(-7 + i * 2, 30, 0)),
        );
        try {
          game.post.setCamera(warmCrewCamera);
          game.post.render(0, game.renderer.scene, warmCrewCamera);
        } finally {
          for (const enemy of warmEnemies) enemy.finishWarmup();
        }
        // Exercise the normal scene's shadow/normal/depth variants from every
        // direction while loading, before a fast mouse turn can expose them.
        const warmView = game.playerCamera.camera.clone();
        warmView.position.set(5.6, CHARACTER_DROP_Y + 1, 1.5);
        for (const [x, y, z] of [
          [0, 0, -1],
          [1, 0, 0],
          [0, 0, 1],
          [-1, 0, 0],
          [0, 1, -0.01],
          [0, -1, -0.01],
        ]) {
          warmView.lookAt(
            warmView.position.x + x!,
            warmView.position.y + y!,
            warmView.position.z + z!,
          );
          game.post.setCamera(warmView);
          game.post.render(0, game.renderer.scene, warmView);
        }
        game.post.setCamera(game.activeCamera);
        // The normal-play light count needs its shader variants too, so the
        // first playable frame and the eventual hand-back are both warm.
        game.post.render(0, game.renderer.scene, game.activeCamera);
      }
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
    this.radioModel = buildRadioModel(this.materials);
    this.radioLamp = this.radioModel.getObjectByName('SignalLamp') ?? null;
    this.radioModel.position.set(0.65, DECK_SURFACE_Y, -5.8);
    this.radioModel.visible = false;
    this.machine.group.add(this.radioModel);
    this.destination = new Destination({
      scene: this.renderer.scene,
      physics: this.physics,
      materials: this.materials,
      arrivalDistance: 0,
    });
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
    this.combat.setVisualMuzzle(() => this.player.getMuzzleWorldPosition());
    this.combat.setHeldRecoil((distance, pitch, yaw) =>
      this.player.kickHeldWeapon(distance, pitch, yaw),
    );
    this.enemies = new EnemyManager(this.renderer.scene, this.physics, this.bus, this.materials);
    this.vehicleScene = new VehicleScene(this.renderer.scene, this.physics, this.materials, {
      terrainHeightAt: (x, z) =>
        duneHeightAt(x, z - WORLD_Z_PER_METRE * this.world.distanceTraveled),
      boardingLanding: (side, crewIndex) => this.boardingLanding(side, crewIndex),
      spawnBoarder: (position, index, definitionId, health) =>
        this.spawnBoarder(index, position, definitionId, health),
      getVolleyTargets: () => this.getVolleyTargets(),
      getVolleyTargetPosition: (targetId) => this.volleyTargetPosition(targetId),
      canDamageVolleyTarget: (targetId, origin, target) =>
        this.canDamageVolleyTarget(targetId, origin, target),
      damageVolleyTarget: (targetId, amount) => {
        if (targetId === 'player') {
          this.player.stats.damage(amount, 'skiff volley', this.vehicleScene.group.position);
        } else if (targetId === 'engine') {
          this.machine.damage.damage('engine', amount);
        } else {
          this.build.damagePiece(targetId, amount);
        }
      },
      onVolley: (targetId) => {
        this.bus.emit('vehicle:phase', {
          id: 'tutorial-skiff',
          phase: 'firing-pass',
          side: this.vehicleManager?.snapshot?.side ?? 'port',
        });
        void targetId;
      },
      onHookAttached: (state) => this.bus.emit('boarding:hook-attached', { side: state.side }),
      onRetreat: (state) => {
        const outcome = state.crewHealth.every((health) => health <= 0)
          ? 'crew'
          : state.hookHealth <= 0
            ? 'hook'
            : 'defended';
        this.pendingBoardingOutcome ??= outcome;
      },
      onDestroyed: () => {
        this.pendingBoardingOutcome ??= 'hull';
      },
      onEnded: () => {
        if (this.pendingBoardingOutcome) this.finishBoarding(this.pendingBoardingOutcome);
      },
    });
    this.vehicleManager = this.vehicleScene.manager;
    this.gunboatScene = new GunboatScene(this.renderer.scene, this.physics, this.materials, {
      terrainHeightAt: (x, z) =>
        duneHeightAt(x, z - WORLD_Z_PER_METRE * this.world.distanceTraveled),
      getVolleyTargetPosition: (targetId) =>
        targetId === 'player'
          ? this.player.worldPosition.clone().add(new THREE.Vector3(0, 0.3, 0))
          : this.volleyTargetPosition(targetId),
      getVolleyTargets: () => this.getVolleyTargets(),
      canDamageVolleyTarget: (targetId, origin, target) =>
        this.canDamageVolleyTarget(targetId, origin, target),
      damageVolleyTarget: (targetId, amount) => {
        if (targetId === 'player')
          this.player.stats.damage(amount, 'gunboat volley', this.gunboatScene.group.position);
        else if (targetId === 'engine') this.machine.damage.damage('engine', amount);
        else this.build.damagePiece(targetId, amount);
      },
      onVolley: (state) => this.bus.emit('gunboat:volley', { serial: state.volleySerial }),
      onTelegraph: (_state, origin, target) =>
        this.bus.emit('gunboat:telegraph', {
          origin: { x: origin.x, y: origin.y, z: origin.z },
          target: { x: target.x, y: target.y, z: target.z },
        }),
      onDestroyed: (state) => {
        this.bus.emit('gunboat:phase', { phase: state.phase, side: state.side });
        this.finishGunboat('hull');
      },
      onEnded: (state) => {
        this.bus.emit('gunboat:phase', { phase: state.phase, side: state.side });
        this.finishGunboat(state.outcome);
      },
    });
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
    this.build.setBuildAuthorization((piece) => canBuildPiece(piece, this.progression));
    this.build.setBuildBlocker((placement) => this.expeditionBuildBlock(placement));
    this.lampLights = new LampLights(this.renderer.scene, this.quality.lampLights);
    this.buildPreview = new BuildPreview(this.renderer.scene);
    // Before the starting structures are laid, so the generator they include
    // registers as a producer the moment it is placed.
    this.wirePower();
    this.resetStructures();
    this.defense = new DefenseSystem({
      isPowered: (instanceId) => this.machine.power.isPowered(instanceId),
      getHealth: (instanceId) =>
        this.build.serialise().find((p) => p.instanceId === instanceId)?.health ?? 0,
      getPosition: (instanceId) => {
        const visual = this.build.turretVisual(instanceId);
        const at = new THREE.Vector3();
        if (visual) visual.root.getWorldPosition(at);
        else {
          const found = this.build
            .stationsNear(this.player.worldPosition, Number.POSITIVE_INFINITY)
            .find((s) => s.instanceId === instanceId);
          if (found) at.copy(found.position);
          else at.copy(this.machine.deckSpawn);
        }
        return at;
      },
      getTargets: () =>
        this.enemies.active.map((enemy) => ({
          id: enemy.id,
          kind: 'infantry' as const,
          position: {
            x: enemy.worldPosition.x,
            y: enemy.worldPosition.y,
            z: enemy.worldPosition.z,
          },
        })),
      getModifiers: () => {
        const modifiers = this.progression.upgrades.modifiers();
        return {
          damageMultiplier: modifiers.turretDamageMultiplier,
          fireRateMultiplier: modifiers.turretRateMultiplier,
          powerDrawBonus: modifiers.turretPowerBonus,
        };
      },
      raycast: (instanceId, yaw, pitch, range) => {
        const visual = this.build.turretVisual(instanceId);
        if (!visual) return null;
        const origin = new THREE.Vector3();
        const direction = new THREE.Vector3();
        visual.muzzle.getWorldPosition(origin);
        // Object3D's forward axis is +Z; authored barrels and ray weapons
        // point down -Z, so use the negated world direction.
        visual.muzzle.getWorldDirection(direction).negate();
        const hit = this.physics.raycast(origin, direction, range);
        this.defenseImpact = hit
          ? {
              point: hit.point.clone(),
              normal: hit.normal.clone(),
              targetId: null,
              onMetal: true,
            }
          : null;
        const damageable = hit && isDamageable(hit.userData) ? hit.userData : null;
        if (!hit || !damageable) return null;
        this.defenseImpact = {
          point: hit.point.clone(),
          normal: hit.normal.clone(),
          targetId: damageable.id,
          onMetal: damageable.kind !== 'enemy',
        };
        this.defenseDamageables.set(damageable.id, damageable);
        void yaw;
        void pitch;
        return { targetId: damageable.id, distance: hit.distance };
      },
      damageTarget: (targetId, amount) => {
        const damageable = this.defenseDamageables.get(targetId);
        if (!damageable) return;
        // BuildSystem and MachineDamage own their armour arithmetic. Enemy and
        // vehicle runtimes receive post-armour damage, so subtract exactly once
        // at this boundary for those target kinds.
        const targetAmount =
          damageable.kind === 'structure' || damageable.kind === 'subsystem'
            ? amount
            : Math.max(0, amount - damageable.armor);
        damageable.takeDamage(targetAmount);
      },
      onMounted: (instanceId) => {
        this.setArmed(false);
        this.bus.emit('turret:entered', { instanceId });
      },
      onDismounted: (instanceId) => {
        this.setArmed(true);
        this.defenseHUD.update(null);
        this.bus.emit('turret:exited', { instanceId });
      },
      onFired: (instanceId, targetId) => {
        this.bus.emit('turret:fired', { instanceId, targetId });
        const impact = this.defenseImpact;
        this.defenseImpact = null;
        if (impact) {
          this.bus.emit('combat:hit', {
            position: impact.point,
            normal: impact.normal,
            targetId: impact.targetId,
            onMetal: impact.onMetal,
          });
        }
      },
      onAim: (instanceId, yaw, pitch) => {
        const visual = this.build.turretVisual(instanceId);
        if (!visual) return;
        // The authored barrel points down -Z; Three's positive Y rotation
        // turns that direction toward -X, hence the sign inversion.
        visual.yaw.rotation.y = -yaw;
        visual.pitch.rotation.x = pitch;
      },
    });
    for (const piece of this.build.serialise()) {
      if (piece.definitionId === 'turret-manual') this.defense.register(piece.instanceId);
    }
    this.bus.on('build:placed', ({ instanceId, definitionId }) => {
      if (definitionId === 'turret-manual') {
        this.defense.register(instanceId);
        this.machine.power.unregisterConsumer(instanceId);
        this.machine.power.registerConsumer({
          id: instanceId,
          draw: this.defense.effectivePowerDraw,
          priority: 'defense',
        });
      }
    });
    this.bus.on('build:removed', ({ instanceId, definitionId }) => {
      if (definitionId === 'turret-manual') this.defense.unregister(instanceId);
    });
    this.automaticDefense = new AutomaticDefenseSystem({
      isPowered: (id) => this.machine.power.isPowered(id),
      getHealth: (id) => this.build.pieceHealth(id) ?? 0,
      getPosition: (id) => {
        const visual = this.build.turretVisual(id);
        const at = new THREE.Vector3();
        if (visual) visual.pitch.getWorldPosition(at);
        else {
          const station = this.build
            .stationsNear(this.player.worldPosition, Number.POSITIVE_INFINITY)
            .find((s) => s.instanceId === id);
          if (station) at.copy(station.position);
        }
        return at;
      },
      getTargets: () => {
        const targets: AutomaticDefenseTarget[] = this.enemies.active.map((enemy) => ({
          id: enemy.id,
          kind: 'infantry',
          position: {
            x: enemy.worldPosition.x,
            y: enemy.worldPosition.y,
            z: enemy.worldPosition.z,
          },
        }));
        const gunboat = this.gunboatScene.snapshot;
        if (gunboat && this.gunboatScene.active) {
          for (const part of ['hull', 'weapon', 'engine'] as const) {
            const world = this.gunboatScene.getTargetPosition(part);
            if (!world) continue;
            targets.push({
              id: `gunboat-${part}`,
              kind: `gunboat-${part}`,
              position: { x: world.x, y: world.y, z: world.z },
              vehicleId: 'gunboat',
            });
          }
        }
        return targets;
      },
      hasLineOfSight: (id, targetId) => this.automaticTargetHit(id, targetId),
      raycast: (id, targetId) => this.automaticTargetHit(id, targetId),
      damageTarget: (targetId, amount) => {
        const damageable = this.defenseDamageables.get(targetId);
        if (damageable) damageable.takeDamage(Math.max(0, amount - damageable.armor));
        else if (targetId.startsWith('gunboat-')) {
          const part = targetId.slice(8) as 'hull' | 'weapon' | 'engine';
          this.gunboatScene.damage(
            part,
            Math.max(0, amount - this.gunboatScene.getTargetArmor(part)),
          );
        }
      },
      onFired: (instanceId, targetId) => {
        const visual = this.build.turretVisual(instanceId);
        const origin = visual?.muzzle.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3();
        // The hit may have removed its target. Retain the confirmed endpoint
        // until the presentation event for this shot has been emitted.
        const target = this.automaticAimEnds.get(targetId);
        if (target)
          this.bus.emit('automatic-turret:fired', {
            instanceId,
            targetId,
            visualOrigin: { x: origin.x, y: origin.y, z: origin.z },
            aimEnd: { x: target.x, y: target.y, z: target.z },
          });
      },
      onTargetAcquired: (instanceId, targetId) =>
        this.bus.emit('automatic-turret:target-acquired', { instanceId, targetId }),
      onAim: (instanceId, yaw, pitch) => {
        const visual = this.build.turretVisual(instanceId);
        if (visual) {
          const parentRotation = new THREE.Euler().setFromQuaternion(
            visual.yaw.parent!.getWorldQuaternion(new THREE.Quaternion()),
            'YXZ',
          );
          visual.yaw.rotation.y = -yaw - parentRotation.y;
          visual.pitch.rotation.x = pitch;
        }
      },
    });
    for (const piece of this.build.serialise())
      if (piece.definitionId === 'turret-auto') this.automaticDefense.register(piece.instanceId);
    this.bus.on('build:placed', ({ instanceId, definitionId }) => {
      if (definitionId === 'turret-auto') this.automaticDefense.register(instanceId);
    });
    this.bus.on('build:removed', ({ instanceId, definitionId }) => {
      if (definitionId === 'turret-auto') this.automaticDefense.unregister(instanceId);
      if (definitionId === 'collector-auto') {
        this.collectors.get(instanceId)?.dispose();
        this.collectors.delete(instanceId);
      }
    });
    const registerCollector = (instanceId: string): void => {
      const buffer = this.build.collectorContainer(instanceId);
      if (!buffer) return;
      const controller = new AutomaticSalvageCollector(
        instanceId,
        {
          getPosition: () => {
            const visual = this.build.collectorVisual(instanceId);
            const point = new THREE.Vector3();
            if (visual) visual.hookExit.getWorldPosition(point);
            else {
              const collector = this.build
                .collectorContainersNear(this.player.worldPosition, Number.POSITIVE_INFINITY)
                .find((c) => c.instanceId === instanceId);
              if (collector) point.copy(collector.position);
            }
            return point;
          },
          getTargets: () =>
            this.salvage.targets.map((target) => ({
              id: target.id,
              position: { x: target.x, y: target.y, z: target.z },
            })),
          claim: (id, owner) => this.salvage.claim(id, owner),
          release: (id, owner) => this.salvage.release(id, owner),
          isClaimAlive: (id, _owner) => this.salvage.positionOf(id) !== null,
          pullClaimed: (dt, id, owner, toward) => this.salvage.pullClaimed(dt, id, owner, toward),
          transferContents: (id, deposit) => this.salvage.transferContents(id, deposit),
          isPowered: () => this.machine.power.isPowered(instanceId),
          onState: (state) => {
            const visual = this.build.collectorVisual(instanceId);
            if (visual?.bufferLamp instanceof THREE.Mesh) {
              const material = visual.bufferLamp.material as THREE.MeshStandardMaterial;
              if (material.emissiveIntensity !== undefined)
                material.emissiveIntensity =
                  state === 'unpowered' ? 0 : state === 'latched' ? 2.2 : 1;
            }
          },
        },
        buffer,
      );
      this.collectors.set(instanceId, controller);
    };
    for (const piece of this.build.serialise())
      if (piece.definitionId === 'collector-auto') registerCollector(piece.instanceId);
    this.bus.on('build:placed', ({ instanceId, definitionId }) => {
      if (definitionId === 'collector-auto') registerCollector(instanceId);
    });
    this.crafting = new CraftingSystem(this.resources, this.bus, this.stationPowered);

    // HUD first: it owns the root's innerHTML, so anything appended before it
    // would be wiped.
    this.hud = new HUD(options.hudRoot, this.bus);
    this.defenseHUD = new DefenseHUD(options.hudRoot);
    this.buildUI = new BuildUI(options.hudRoot);
    this.inventoryUI = new InventoryUI(options.hudRoot, this.inventory, {
      moveToCrate: (slot, all) => this.transfer('player', slot, all),
      moveToPlayer: (slot, all) => this.transfer('crate', slot, all),
      useSlot: (slot) => this.useSlot(slot),
      craft: (recipeId) => this.crafting.craft(recipeId),
      close: () => this.closePanels(),
    });
    this.radioUI = new RadioUI(
      options.hudRoot,
      {
        close: () => this.closePanels(),
        openResearch: () => this.openResearch(),
        depart: () => this.requestExpeditionDeparture(),
      },
      this.bus,
    );
    this.researchUI = new ResearchUI(options.hudRoot, {
      research: (id) => this.researchUpgrade(id),
      activate: (id) => this.activateUpgrade(id),
      deactivate: (branch) => this.deactivateUpgrade(branch),
      close: () => this.closePanels(),
    });
    this.expeditionUI = new ExpeditionUI(options.hudRoot, {
      close: () => this.closePanels(),
      selectRoute: (route) => this.selectStoryRoute(route),
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
        onSave: () => void this.saveFromPause(false),
        onSaveAndQuit: () => void this.saveFromPause(true),
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
    this.bus.on('opening:phase', ({ phase }) => {
      if (phase !== 'done' || this.playableStartedAt !== null) return;
      this.playableStartedAt = this.state.simTime;
      this.progression.earlyRadioDrop.arm(this.state.simTime);
      if (!this.progression.earlyRadioDrop.radioFound)
        this.salvage.armAfterOpening(this.world.distanceTraveled);
      this.sessionMetrics.mark('opening.done');
    });
    this.bus.on('loot:collected', (e) => {
      if (e.source.toLowerCase().includes('salvage'))
        this.sessionMetrics.mark('salvage.opened', { source: e.source });
    });
    this.bus.on('radio:found', (e) =>
      this.sessionMetrics.mark('radio.found', {
        distance: e.distance,
        elapsed: e.elapsedSincePlayable,
      }),
    );
    this.bus.on('defense:built', () => this.sessionMetrics.mark('defense.built'));
    this.bus.on('upgrade:researched', (e) =>
      this.sessionMetrics.mark(`upgrade.researched:${e.id}`),
    );
    this.bus.on('story:docked', () => this.sessionMetrics.mark('story.docked'));
    this.bus.on('story:unique-collected', () => this.sessionMetrics.mark('story.gyro'));
    this.bus.on('story:departed', () => this.sessionMetrics.mark('story.departed'));

    // First-run facts are derived from the same events that change the live
    // world. They are deliberately monotonic, so an action taken before its
    // objective is displayed still counts.
    this.bus.on('loot:collected', (e) => {
      const salvage = e.source.toLowerCase().includes('salvage');
      if (salvage) {
        this.observeFirstRun({ type: 'salvage-collected', count: 1, source: e.source });
        if (this.progression.recordSalvageCollected()) {
          this.bus.emit('progression:unlocked', { id: 'manual-turret' });
        }
      }
      this.requestAutosave();
    });
    this.bus.on('build:placed', (e) => {
      this.observeFirstRun({ type: 'build-placed', definitionId: e.definitionId });
      if (e.definitionId === 'turret-manual') {
        this.bus.emit('defense:built', { defenseId: e.instanceId });
      }
      this.requestAutosave();
    });
    this.bus.on('craft:completed', ({ recipeId }) => {
      this.observeFirstRun({ type: 'craft-completed', recipeId });
      this.observeFirstRun({ type: 'snapshot', snapshot: this.firstRunSnapshot() });
      this.requestAutosave();
    });
    this.bus.on('defense:built', (e) => {
      this.observeFirstRun({ type: 'defense-built' });
      this.requestAutosave();
      void e;
    });
    this.bus.on('boarding:survived', () => {
      this.observeFirstRun({ type: 'boarding-survived' });
      this.requestAutosave();
    });
    this.bus.on('boarding:ended', (e) => {
      this.observeFirstRun({ type: 'boarding-ended', needsRepair: e.needsRepair ?? false });
      this.requestAutosave();
    });
    this.bus.on('turret:entered', ({ instanceId }) => {
      this.observeFirstRun({ type: 'defense-crewed' });
      if (
        this.firstRun.current === 'survive-boarding' &&
        !this.tutorialStarted &&
        !this.vehicleManager.active &&
        this.tutorialReadyAt === null
      ) {
        this.tutorialTurretId = instanceId;
        this.tutorialReadyAt = this.state.simTime + 15;
      }
      this.requestAutosave();
    });
    this.bus.on('repair:completed', () => {
      this.observeFirstRun({ type: 'repair-completed' });
      this.requestAutosave();
    });
    // Infantry recovery does not satisfy the skiff objective. Only the
    // boarding controller's terminal event can advance that step.
    this.bus.on('enemy:spawned', () => {
      // A later boarding system may provide a dedicated survived event. The
      // threat director's recovery edge remains a valid fallback for today's
      // enemy manager, so no objective depends on a particular combat actor.
    });
    this.refreshFirstRunObjective();

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

  /** Build the small snapshot needed when loading or restoring old saves. */
  private firstRunSnapshot(): FirstRunSnapshot {
    const pieces = this.build.serialise();
    return {
      refineryBuilt: pieces.some((piece) => piece.definitionId === 'refinery'),
      workbenchBuilt: pieces.some((piece) => piece.definitionId === 'workbench'),
      defenseBuilt: pieces.filter((piece) => piece.definitionId === 'turret-manual').length,
      componentsAvailable: this.resources.count('components'),
    };
  }

  private observeFirstRun(fact: FirstRunFact): void {
    const change = this.firstRun.observe(fact);
    if (!change) return;
    this.bus.emit('objective:updated', change);
    this.refreshFirstRunObjective();
    const instruction = this.firstRun.instruction;
    this.bus.emit('objective:changed', {
      view: {
        title: instruction.title,
        instruction: instruction.detail,
        control: instruction.control || undefined,
        optional: instruction.step === 'complete',
      },
    });
  }

  private refreshFirstRunObjective(): void {
    this.hud?.setObjective(this.firstRun.instruction);
  }

  private requestAutosave(): void {
    if (this.opening.phase !== 'done') return;
    this.autosavePending = true;
    // High-value story edges should be attempted at the next safe fixed-step
    // boundary instead of waiting for the periodic checkpoint.
    this.nextAutosaveAt = Math.min(this.nextAutosaveAt, this.state.simTime);
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
    return (
      this.titleCamera ??
      (this.signalBattle?.active ? this.signalBattle.camera : null) ??
      this.freeCamera
    );
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
    if (this.state.simTime >= this.nextAutosaveAt) {
      if (!this.autosavePending) this.bus.emit('game:autosave-pending', {});
      this.autosavePending = true;
    }

    if (this.signalBattle?.active) {
      // The Nomad keeps passing the battle, but the player cannot be damaged,
      // starved, or moved by held input while the camera has control.
      this.machine.fixedUpdate(dt);
      this.world.fixedUpdate(dt, this.machine.speed);
      if (this.signalBattle.update(dt, this.world.distanceTraveled, this.input.isDown('cancel')))
        this.finishSignalBattle();
      else {
        this.renderer.sun.target.position.copy(this.signalBattle.lightingFocus);
        this.renderer.setSunDirection(this.sky.direction);
      }
      this.physics.step();
      return;
    }
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

      if (this.defense.mounted)
        this.player.fixedUpdate(dt, this.idleInput, this.playerCamera.yawAngle);
      else this.player.fixedUpdate(dt, this.input, this.playerCamera.yawAngle);
      // The camera follows where the player would be if the body were at rest,
      // not where the deck has just lifted them to. See `Machine.steadyPoint`:
      // the deck is supposed to move and the view is not, and without this the
      // gait reaches the camera through the player and buzzes it at 4.6Hz.
      if (!this.defense.mounted) {
        this.playerCamera.fixedUpdate(
          dt,
          this.input,
          this.machine.steadyPoint(this.player.worldPosition, this.cameraAnchor),
          this.physics,
          this.player.collider,
        );
      }
      // Build mode suppresses weapon fire entirely: LMB places, and firing
      // while placing would be both surprising and expensive. An open panel
      // suppresses both — its clicks belong to the panel.
      // A dead player keeps reload timers running but reaches no trigger, the
      // same way an open panel does.
      // An unarmed player reaches no trigger either, which is what the roof
      // is: the answer up there is run.
      if (this.panelsOpen || this.state.playerDead || !this.armed || this.defense.mounted) {
        this.combat.fixedUpdate(dt, this.idleInput, this.playerCamera);
      } else if (this.buildMode) this.updateBuildMode();
      else this.combat.fixedUpdate(dt, this.input, this.playerCamera);

      if (this.defense.mounted) {
        const look = this.input.consumeLook();
        const view = this.defense.update(this.state.simTime, {
          dt,
          lookX: look.x * 0.004,
          // Mouse down is positive in InputManager; turret pitch uses
          // positive values for raising the barrel, so invert the screen Y.
          lookY: -look.y * 0.004,
          fireHeld: this.input.isDown('fire'),
          powered: this.machine.power.isPowered(this.defense.mounted),
          occupied: true,
        });
        if (view) {
          this.defenseHUD.update(view);
          const visual = this.build.turretVisual(view.instanceId);
          if (visual) {
            // Mounted fire is aimed from the authored muzzle. Keep the active
            // view on that same ray so the player can actually see what the
            // manual gun is targeting instead of retaining the old third-
            // person player camera pose.
            visual.muzzle.getWorldPosition(this.turretCameraAt);
            visual.muzzle.getWorldDirection(this.turretCameraDirection).negate();
            this.playerCamera.camera.position
              .copy(this.turretCameraAt)
              // The barrel's end cap would fill the view from behind it.
              .addScaledVector(this.turretCameraDirection, 0.12);
            this.turretCameraLookAt
              .copy(this.turretCameraAt)
              .addScaledVector(this.turretCameraDirection, 50);
            this.playerCamera.camera.lookAt(this.turretCameraLookAt);
          }
        }
      }

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

      if (this.scriptedGunboatPending) this.spawnGunboatEncounter('port');
      this.updateVehicles(dt);

      this.updateOpening(dt);
    }

    this.machine.fixedUpdate(dt);
    this.updateStory();
    this.destination.fixedUpdate(this.world.distanceTraveled);
    this.tickNeeds(dt);
    this.tickPower(dt);
    this.automaticAimEnds.clear();
    this.automaticDefense.update(dt);
    for (const collector of this.collectors.values()) collector.update(dt);
    this.refreshResearchPanel();
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
    if (!this.cinematicCamera) this.updateSpawns(dt);

    if (!this.cinematicCamera) {
      this.salvage.update(dt, this.world.distanceTraveled, this.machine.speed);
      this.updateReel(dt);
    }

    // Last: resolve everything the kinematic bodies above just requested.
    this.physics.step();

    this.handleDebugKeys();
    if (!this.state.paused && this.opening.phase === 'done' && !this.state.playerDead) {
      this.sessionMetrics.advance(dt, {
        scrap: this.resources.count('scrap'),
        components: this.resources.count('components'),
        fuel: this.machine.power.fuel,
        powerCapacity: this.machine.power.capacity,
        powerDraw: this.machine.power.draw,
        speed: this.machine.speed,
      });
    }
    this.processAutosave();
  }

  private updateStory(): void {
    const before = this.story.currentPhase;
    const effects = this.story.update({
      distance: this.world.distanceTraveled,
      radioFound: this.progression.earlyRadioDrop.radioFound,
      firstRunComplete: this.firstRun.isComplete,
      stable: this.isStableForStory(),
      speed: this.machine.speed,
      playerOnMachine: this.destination.playerOnMachine(this.player.worldPosition),
      maxSpeed: this.machine.movement.maxSpeed,
      encounterActive:
        this.enemies.activeCount > 0 || this.vehicleManager.active || this.gunboatScene.active,
      signalBattleMode: true,
    });
    if (effects.length > 0) this.applyStoryEffects(effects);
    // Defensive recovery for an externally supplied mid-scene save. Ordinary
    // saves are taken before the reveal or after control has been restored.
    if (
      this.story.currentPhase === 'crossfire' &&
      !this.signalBattle?.active &&
      !this.cinematicCamera
    )
      this.beginSignalBattle();
    const after = this.story.currentPhase;
    if (after !== before) {
      this.bus.emit('story:phase', { chapterId: this.story.chapter.id, phase: after });
      if (after === 'route-selection') this.openExpedition();
    }
    const view = this.story.snapshot(this.world.distanceTraveled);
    const gyro = this.helmGyro;
    if (gyro) gyro.visible = view.recoveredUniques.includes('course-gyro');
    const helmLamp = this.helmLamp;
    if (helmLamp) helmLamp.visible = this.machine.power.isPowered(this.helmPowerConsumerId);
    this.hud.setStoryState({
      phase: view.phase,
      objective:
        view.phase === 'signal'
          ? `Signal ${Math.floor(view.signalStrength * 100)}% · ${view.objective}`
          : view.objective,
      remainingM: view.remainingM,
    });
    this.hud.setRadioState(
      this.progression.earlyRadioDrop.radioFound,
      this.progression.earlyRadioDrop.radioFound &&
        this.machine.power.isPowered(this.radioPowerConsumerId),
    );
    if (this.radioUI.isOpen)
      this.radioUI.setView({
        strength: view.signalStrength,
        remainingM: view.remainingM,
        signalText: view.objective,
      });
    if (this.expeditionUI.isOpen) this.expeditionUI.setView(this.expeditionView());
    // Keep the machine-side gate in lockstep with the destination state. This
    // runs after story effects and also covers a restored docked state before
    // the next player movement step.
    this.machine.setExpeditionGangwayOpen(this.destination.docked);
  }

  private prepareSignalBattle(): SignalBattleScene {
    this.signalBattle ??= new SignalBattleScene(
      this.renderer.scene,
      this.materials,
      (x, z) => duneHeightAt(x, z - WORLD_Z_PER_METRE * this.world.distanceTraveled),
      (kind) => this.audio.play(kind === 'shot' ? 'distant-gunfire' : 'distant-explosion', 24, 32),
      this.weaponModels.get('rifle') ?? null,
    );
    if (!this.renderer.extraCameras.includes(this.signalBattle.camera))
      this.renderer.extraCameras.push(this.signalBattle.camera);
    return this.signalBattle;
  }

  private beginSignalBattle(): void {
    if (this.signalBattle?.active) return;
    this.closePanels();
    this.defense.exit();
    this.input.clearAll();
    // Retire any unreleased ordinary wave; the radio now owns encounter pacing.
    this.director.finishExternalEncounter(this.world.distanceTraveled);
    this.prepareSignalBattle().start(this.playerCamera.camera, this.world.distanceTraveled);
    this.normalSunTarget.copy(this.renderer.sun.target.position);
    this.setHudVisible(false);
    this.audio.play('radio-signal');
  }

  private cancelSignalBattle(): void {
    if (this.signalBattle?.active) {
      this.renderer.sun.target.position.copy(this.normalSunTarget);
      this.renderer.setSunDirection(this.sky.direction);
      this.signalBattle.stop();
      this.input.clearAll();
    }
  }

  private finishSignalBattle(): void {
    if (!this.story.finishSignalBattle()) return;
    this.renderer.sun.target.position.copy(this.normalSunTarget);
    this.renderer.setSunDirection(this.sky.direction);
    this.input.clearAll();
    this.setHudVisible(true);
    this.bus.emit('story:phase', { chapterId: 'wreck-one', phase: 'raids' });
    this.hud.setWarning('They saw us. Watch for grapples on both sides of the machine.');
    this.requestAutosave();
  }

  private updateRadioRaids(dt: number): void {
    const safe =
      this.enemies.activeCount === 0 &&
      !this.vehicleScene.active &&
      !this.gunboatScene.active &&
      !this.pendingBoardingOutcome &&
      !this.scriptedGunboatPending &&
      !this.panelsOpen &&
      !this.buildMode &&
      this.player.stats.health / this.player.stats.maxHealth >= 0.35 &&
      this.destination.playerOnMachine(this.player.worldPosition);
    const plan = this.radioRaids.update(dt, safe, this.state.seed);
    if (!plan || !this.vehicleScene.spawn(plan.side, false, plan.crew)) return;
    this.radioRaids.started();
    this.tutorialStarted = false;
    // Claim the ordinary director too so save/debug consumers agree about the
    // encounter owner. Its normal infantry release path is never called here.
    this.director.update(this.world.distanceTraveled, 0, 1, true);
    this.threatPhase = 'engagement';
    this.bus.emit('threat:phase', { phase: 'engagement', wavesSurvived: this.director.waves });
    this.bus.emit('boarding:started', { encounterId: 'robot-boarding-ship' });
    this.hud.setWarning(
      `Robot boarding ship — ${plan.side}! Destroy its grapple or hold the deck.`,
    );
  }

  private isStableForStory(): boolean {
    const clearForApproach =
      this.story.currentPhase !== 'route-selection' || !this.hasDestinationBuildConflict();
    if (!clearForApproach) {
      this.hud?.setWarning(
        'Clear structures from the expedition approach lane before choosing a route',
      );
    }
    return (
      clearForApproach &&
      this.enemies.activeCount === 0 &&
      !this.vehicleManager.active &&
      !this.gunboatScene.active &&
      !this.scriptedGunboatPending &&
      this.pendingBoardingOutcome === null &&
      !this.state.playerDead &&
      this.hook === null &&
      !this.cinematicCamera &&
      // Route selection itself happens inside a panel. Only the new signal
      // camera takeover needs the player to finish their current interaction.
      (this.story.currentPhase !== 'signal' ||
        ((!this.panelsOpen || this.radioUI.isOpen) && !this.buildMode && !this.defense.mounted)) &&
      this.opening.phase === 'done'
    );
  }

  private expeditionBuildBlock(
    placement: Placement,
  ): { ok: false; reason: 'expedition-reserved' } | null {
    if (!this.destination.active) return null;
    return footprintOverlapsExpedition(placement)
      ? { ok: false, reason: 'expedition-reserved' }
      : null;
  }

  private hasDestinationBuildConflict(): boolean {
    return this.build.serialise().some((piece) => footprintOverlapsExpedition(piece));
  }

  private applyStoryEffects(effects: readonly StoryEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'begin-signal-battle':
          this.beginSignalBattle();
          break;
        case 'begin-signal':
          this.bus.emit('story:signal', {
            strength: 0.08,
            remainingM: null,
            text: 'A recovered signal answers from the route.',
          });
          break;
        case 'begin-approach':
          this.destination.setActive(false);
          this.destination.configure(this.story.chapter);
          this.destination.setActive(true);
          this.destination.setArrivalDistance(effect.arrivalDistance);
          this.destination.fixedUpdate(this.world.distanceTraveled);
          break;
        case 'scripted-vehicle-due':
          if (effect.vehicle === 'gunboat') {
            this.director.queueExternal('gunboat');
            this.scriptedGunboatPending = true;
            this.spawnGunboatEncounter('port');
          }
          break;
        case 'request-sanctuary':
          this.director.setSanctuary(effect.active, this.world.distanceTraveled);
          break;
        case 'request-speed-limit':
          this.machine.movement.setScriptedSpeedLimit(effect.mps);
          break;
        case 'hold-destination':
          this.destination.setArrivalDistance(this.world.distanceTraveled + effect.remainingM);
          break;
        case 'deploy-gangway':
          this.destination.setDocked(true);
          this.machine.setExpeditionGangwayOpen(true);
          this.bus.emit('story:docked', { chapterId: this.story.chapter.id });
          this.requestAutosave();
          break;
        case 'retract-gangway':
          this.destination.setDocked(false);
          this.machine.setExpeditionGangwayOpen(false);
          break;
        case 'chapter-complete':
          this.destination.setActive(false);
          this.machine.setExpeditionGangwayOpen(false);
          this.bus.emit('story:departed', { chapterId: this.story.chapter.id });
          break;
        case 'next-signal':
          this.bus.emit('story:next-signal', { id: 'signal-two' });
          break;
      }
    }
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
    if (this.progression.earlyRadioDrop.radioFound) {
      const powered = this.machine.power.isPowered(this.radioPowerConsumerId);
      if (powered !== this.radioPowered) {
        this.radioPowered = powered;
        this.bus.emit('radio:power', { powered });
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
    this.hookAt.copy(this.hookDir).multiplyScalar(this.hook.distance).add(this.hookOrigin);

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
        this.sessionMetrics.mark('salvage.hooked');
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
    this.reelHead.lookAt(
      this.hookAt.x + this.hookDir.x,
      this.hookAt.y + this.hookDir.y,
      this.hookAt.z + this.hookDir.z,
    );
    if (this.hook.phase === 'out') this.reelHead.rotateZ(this.hook.distance * HOOK_SPIN);
    this.reelHead.visible = true;

    if (this.hook.phase === 'done') {
      if (this.hookedCrate !== null) {
        this.salvage.open(
          this.hookedCrate,
          (id, count) => {
            this.resources.deposit(id as Parameters<ResourceAccess['deposit']>[0], count);
          },
          () => {
            if (this.opening.phase !== 'done') return [];
            const reward = this.progression.earlyRadioDrop.onSalvageChestOpened(
              this.state.simTime,
              this.world.distanceTraveled,
            );
            if (!reward.granted) return [];
            this.radioModel.visible = true;
            this.machine.power.registerConsumer({
              id: this.radioPowerConsumerId,
              draw: 1,
              priority: 'station',
            });
            this.bus.emit('radio:found', {
              source: 'salvage-crate',
              distance: this.world.distanceTraveled,
              elapsedSincePlayable:
                this.playableStartedAt === null
                  ? this.state.simTime
                  : Math.max(0, this.state.simTime - this.playableStartedAt),
            });
            this.bus.emit('radio:power', {
              powered: this.machine.power.isPowered(this.radioPowerConsumerId),
            });
            this.radioPowered = this.machine.power.isPowered(this.radioPowerConsumerId);
            this.requestAutosave();
            return [
              { id: 'scrap', count: reward.cache.scrap },
              { id: 'fuel', count: reward.cache.fuel },
            ];
          },
        );
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
    if (this.cinematicCamera || this.state.paused) {
      // A locked cursor can still move during a cutscene. Do not bank that
      // movement for the hand-back to the player; mounted look waits for its tick.
      this.input.consumeLook();
    } else if (!this.defense.mounted) {
      this.playerCamera.update(alpha, this.input);
    }
    this.enemies.update(alpha, frameDt);
    // Whether a throw would catch something, asked of the same function the
    // throw itself uses -- a cue derived from different rules to the mechanic
    // is a cue that lies.
    if (this.hook !== null) {
      this.reelReady = false;
    } else {
      const camera = this.activeCamera;
      camera.getWorldDirection(this.reelAim);
      this.hookOrigin.copy(this.player.worldPosition);
      this.hookOrigin.y += 0.35;
      this.reelReady = pickReelTarget(this.salvage.targets, this.hookOrigin, this.reelAim) !== null;
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
    this.audio.setActive(!this.state.paused && !this.titleScreen?.isOpen);
    this.audio.setInterior(this.playerIsIndoors);
    this.audio.setCombatActive(this.threatPhase !== 'calm' && this.threatPhase !== 'recovery');
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
      this.audio.play(
        'footfall',
        foot.x - this.player.worldPosition.x,
        foot.z - this.player.worldPosition.z,
      );
    }
    // Where the player is standing, and what the desert is doing, before the
    // drone is asked how loud it should be. Both are level-triggered and both
    // ramp, so a doorway is a threshold rather than a switch.
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
      infiniteAmmo: this.combat.current.infiniteReserve,
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
        canBuild: this.build.canBuildPiece.bind(this.build),
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
    const radioLamp = this.radioLamp;
    if (radioLamp) {
      radioLamp.visible =
        this.progression.earlyRadioDrop.radioFound &&
        this.machine.power.isPowered(this.radioPowerConsumerId);
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
  private updateSpawns(dt = 1 / 60): void {
    // Ordinary threat pacing waits until the guided boarding loop is done.
    if (!this.firstRun.isComplete) return;
    if (!this.enemySpawnsEnabled) return;
    if (this.state.playerDead) return;
    if (this.story.currentPhase === 'raids') {
      this.updateRadioRaids(dt);
      return;
    }
    // A destroyed hull can leave shells in flight. Keep scheduling paused
    // during that tail without reacquiring the encounter just resolved.
    if (this.gunboatResolutionApplied && this.gunboatScene.active) return;

    const decision = this.director.update(
      this.world.distanceTraveled,
      this.enemies.activeCount,
      this.player.stats.health / this.player.stats.maxHealth,
      this.vehicleManager.active ||
        this.gunboatScene.active ||
        this.pendingBoardingOutcome !== null,
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

    if (
      decision.vehicle &&
      !this.vehicleManager.active &&
      !this.gunboatScene.active &&
      !this.pendingBoardingOutcome
    ) {
      const started =
        decision.vehicle.type === 'gunboat'
          ? (() => {
              const spawned = this.gunboatScene.spawn('port');
              if (spawned) {
                this.gunboatResolutionApplied = false;
                this.scriptedGunboatPending = false;
              }
              return spawned;
            })()
          : this.enemies.activeCount === 0 && this.vehicleScene.spawn('port');
      if (started) {
        this.tutorialStarted = false;
        if (decision.vehicle.type === 'skiff')
          this.bus.emit('boarding:started', { encounterId: 'skiff' });
        else this.bus.emit('gunboat:phase', { phase: 'approach', side: 'port' });
      } else if (!this.vehicleManager.active && !this.gunboatScene.active) {
        // ThreatDirector marks the external encounter before handing us the
        // request. Release that ownership if the scene cannot accept it so a
        // failed spawn cannot freeze ordinary threat pacing forever.
        this.director.abortOrphanExternal(this.world.distanceTraveled);
      }
      return;
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

  private spawnBoarder(
    index: number,
    landing?: THREE.Vector3,
    definitionId = 'raider',
    health?: number,
  ): void {
    if (landing) {
      const enemy = this.enemies.spawn(definitionId, landing);
      if (enemy) {
        if (health !== undefined && health < enemy.currentHealth)
          enemy.takeDamage(enemy.currentHealth - health);
        this.boardingEnemyIds.add(enemy.id);
        this.bus.emit('boarding:crossed', { enemyId: enemy.id, crewIndex: index });
      }
      return;
    }
    const side = this.vehicleManager.snapshot?.side === 'starboard' ? 1 : -1;
    const z = index === 0 ? -this.machine.deckBounds.max.z + 1 : this.machine.deckBounds.max.z - 1;
    const enemy = this.enemies.spawn(
      definitionId,
      new THREE.Vector3(side * Math.max(2, this.machine.deckBounds.max.x - 1), CHARACTER_DROP_Y, z),
    );
    if (enemy) {
      this.boardingEnemyIds.add(enemy.id);
      this.bus.emit('boarding:crossed', { enemyId: enemy.id, crewIndex: index });
    }
  }

  /** Pick a live level-0 nav cell beside the relevant deck edge. */
  private boardingLanding(side: 'port' | 'starboard', _crewIndex: number): THREE.Vector3 {
    const sign = side === 'starboard' ? 1 : -1;
    const grid = this.build.gridView;
    // NavGraph deliberately keeps the machine's equipment cells walkable for
    // A* and lets EnemySteering handle the fine-grained collider avoidance.
    // That is correct for routing, but it is unsafe as a spawn rule: a body
    // created inside the workbench or a crate has no depenetration path. The
    // same applies to player stations and stair runs, whose colliders occupy a
    // cell while their navigation node remains useful to route around.
    const occupied = new Set([
      ...this.machine.equipmentCells.map(cellKey),
      ...grid.stationEntries().map(({ cell }) => cellKey(cell)),
      ...grid.stairsEntries().map(({ cell }) => cellKey(cell)),
    ]);
    const candidates = [...this.build.navGraph.links.entries()]
      .map(([key, links]) => ({ cell: parseCellKey(key), links }))
      .filter(
        ({ cell, links }) => cell.y === 0 && links.length > 0 && !occupied.has(cellKey(cell)),
      );
    const wantedX = sign * Math.floor(this.machine.deckBounds.max.x / GRID_TILE);
    // The hook has one physical endpoint. Both crew cross to that same safe
    // deck cell; the second raider can then walk off it through ordinary
    // steering instead of visually landing beside the cable target.
    const wantedZ = -1;
    const cell = candidates.sort((a, b) => {
      const scoreA = Math.abs(a.cell.x - wantedX) * 10 + Math.abs(a.cell.z - wantedZ);
      const scoreB = Math.abs(b.cell.x - wantedX) * 10 + Math.abs(b.cell.z - wantedZ);
      return scoreA - scoreB;
    })[0]?.cell;
    return new THREE.Vector3(
      (cell?.x ?? sign * 2) * GRID_TILE,
      CHARACTER_DROP_Y,
      (cell?.z ?? wantedZ) * GRID_TILE,
    );
  }

  private getVolleyTargets(): readonly VolleyTarget[] {
    const targets: VolleyTarget[] = [
      { id: 'player', kind: 'player', exposed: true },
      { id: 'engine', kind: 'subsystem', exposed: true },
    ];
    for (const station of this.build.stationsNear(
      this.player.worldPosition,
      Number.POSITIVE_INFINITY,
    )) {
      targets.push({
        id: station.instanceId,
        kind:
          station.piece === 'turret-manual' || station.piece === 'turret-auto'
            ? 'turret'
            : 'structure',
        exposed: true,
      });
    }
    return targets;
  }

  private volleyTargetPosition(targetId: string): THREE.Vector3 | null {
    if (targetId === 'player') return this.player.worldPosition.clone();
    if (targetId === 'engine') {
      return new THREE.Vector3(
        SUBSYSTEMS.engine.hitbox.center.x,
        SUBSYSTEMS.engine.hitbox.center.y,
        SUBSYSTEMS.engine.hitbox.center.z,
      );
    }
    const station = this.build
      .stationsNear(this.player.worldPosition, Number.POSITIVE_INFINITY)
      .find((candidate) => candidate.instanceId === targetId);
    if (station) {
      // Build colliders for stations are lifted from the floor. Aim at their
      // collider volume rather than the mesh origin so exposure checks do not
      // terminate on the deck plate below the target. The upper manual-gun
      // housing is the exposed part of its one-metre collider; aiming there
      // also clears the deck lip when the gun is attacked from below.
      return station.position
        .clone()
        .add(new THREE.Vector3(0, station.piece === 'turret-manual' ? 0.85 : 0.5, 0));
    }
    const turret = this.build.turretVisual(targetId);
    if (turret) {
      const position = new THREE.Vector3();
      turret.root.getWorldPosition(position);
      position.y += 0.5;
      return position;
    }
    return null;
  }

  private canDamageVolleyTarget(
    targetId: string,
    origin: THREE.Vector3,
    target: THREE.Vector3,
  ): boolean {
    const delta = target.clone().sub(origin);
    const distance = delta.length();
    if (distance <= 0.01) return false;
    const direction = delta.multiplyScalar(1 / distance);
    const hit = this.physics.raycast(origin, direction, distance);
    if (!hit) return false;
    if (targetId === 'player') return hit.collider.handle === this.player.collider.handle;
    const damageable = isDamageable(hit.userData) ? hit.userData : null;
    return damageable?.id === targetId;
  }

  private automaticTargetHit(instanceId: string, targetId: string): boolean {
    const visual = this.build.turretVisual(instanceId);
    if (!visual) return false;
    const target =
      this.enemies.active.find((enemy) => enemy.id === targetId)?.worldPosition ??
      (targetId.startsWith('gunboat-')
        ? this.gunboatScene.getTargetPosition(targetId.slice(8) as 'hull' | 'weapon' | 'engine')
        : null);
    if (!target) return false;
    const origin = visual.muzzle.getWorldPosition(new THREE.Vector3());
    const delta = target.clone().sub(origin);
    const distance = delta.length();
    if (distance <= 0.01) return false;
    const hit = this.physics.raycast(origin, delta.multiplyScalar(1 / distance), distance + 0.5);
    const damageable = hit && isDamageable(hit.userData) ? hit.userData : null;
    if (!damageable || damageable.id !== targetId) return false;
    this.defenseDamageables.set(targetId, damageable);
    this.automaticAimEnds.set(targetId, target.clone());
    return true;
  }

  private finishBoarding(outcome: 'hull' | 'crew' | 'hook' | 'defended'): void {
    const wasTutorial = this.tutorialStarted;
    if (this.story.currentPhase === 'raids') this.radioRaids.finished(this.state.seed);
    const needsRepair = this.machine.damage.damaged().length > 0;
    const reward = VEHICLES.skiff.defenseReward;
    this.resources.deposit('scrap', reward.scrap);
    this.resources.deposit('components', reward.components);
    this.bus.emit('loot:collected', {
      items: [
        { id: 'scrap', count: reward.scrap },
        { id: 'components', count: reward.components },
      ],
      source: 'Dust skiff salvage',
    });
    this.bus.emit('boarding:survived', { encounterId: 'tutorial-skiff' });
    this.bus.emit('boarding:ended', { outcome, tutorial: this.tutorialStarted, needsRepair });
    if (wasTutorial) {
      this.tutorialStarted = false;
      this.tutorialReadyAt = null;
      this.tutorialTurretId = null;
    }
    this.vehicleScene.clear();
    this.boardingEnemyIds.clear();
    if (this.director.hasActiveExternalEncounter || wasTutorial) {
      this.director.finishExternalEncounter(this.world.distanceTraveled);
      this.threatPhase = 'recovery';
      this.bus.emit('threat:phase', {
        phase: 'recovery',
        wavesSurvived: this.director.waves,
      });
    }
    this.pendingBoardingOutcome = null;
    this.requestAutosave();
  }

  private finishGunboat(outcome: 'hull' | 'weapon-and-engine' | 'escaped' | null): void {
    if (!outcome || this.gunboatResolutionApplied) return;
    this.gunboatResolutionApplied = true;
    const reward =
      outcome === 'hull'
        ? GUNBOAT.rewards.destroyed
        : outcome === 'weapon-and-engine'
          ? GUNBOAT.rewards.disabled
          : null;
    if (reward) {
      this.resources.deposit('scrap', reward.scrap);
      this.resources.deposit('components', reward.components);
      this.bus.emit('loot:collected', {
        items: [
          { id: 'scrap', count: reward.scrap },
          { id: 'components', count: reward.components },
        ],
        source: 'Raider gunboat salvage',
      });
    }
    this.gunboatScene.clear(true);
    this.scriptedGunboatPending = false;
    if (this.story.snapshot(this.world.distanceTraveled).expeditionId === 'relay-foundry')
      this.applyStoryEffects(this.story.resolveScriptedEncounter());
    if (this.director.hasActiveExternalEncounter)
      this.director.finishExternalEncounter(this.world.distanceTraveled);
    this.threatPhase = 'recovery';
    this.bus.emit('threat:phase', { phase: 'recovery', wavesSurvived: this.director.waves });
    this.requestAutosave();
  }

  /** Integration seam for the scripted direct-route gunboat request. */
  spawnGunboatEncounter(side: 'port' | 'starboard' = 'port'): boolean {
    if (
      this.vehicleManager.active ||
      this.gunboatScene.active ||
      this.pendingBoardingOutcome ||
      this.enemies.activeCount > 0 ||
      this.director.hasActiveExternalEncounter
    )
      return false;
    if (
      !this.director.queueExternal('gunboat') ||
      !this.director.tryBeginExternal(
        'gunboat',
        this.world.distanceTraveled,
        this.enemies.activeCount,
      )
    )
      return false;
    const spawned = this.gunboatScene.spawn(side);
    if (spawned) {
      this.scriptedGunboatPending = false;
      this.gunboatResolutionApplied = false;
      this.bus.emit('gunboat:phase', { phase: 'approach', side });
    } else this.director.abortOrphanExternal(this.world.distanceTraveled);
    return spawned;
  }

  private updateVehicles(dt: number): void {
    if (this.gunboatScene.active) {
      this.gunboatScene.fixedUpdate(dt);
      return;
    }
    if (this.opening.phase !== 'done') return;
    if (
      !this.vehicleManager.active &&
      !this.pendingBoardingOutcome &&
      this.enemies.activeCount === 0 &&
      !this.state.playerDead &&
      this.tutorialReadyAt !== null &&
      this.state.simTime >= this.tutorialReadyAt
    ) {
      if (this.vehicleScene.spawn(this.tutorialSkiffSide(), true)) {
        this.tutorialStarted = true;
        // The guided encounter happens before the director's recurring
        // schedule, so explicitly hand ownership to it for the same recovery
        // window used by a later scheduled skiff.
        this.director.update(
          this.world.distanceTraveled,
          this.enemies.activeCount,
          this.player.stats.health / this.player.stats.maxHealth,
          true,
        );
        this.bus.emit('boarding:started', { encounterId: 'tutorial-skiff' });
      }
    }
    if (!this.vehicleManager.active) {
      if (this.pendingBoardingOutcome && this.enemies.activeCount === 0) {
        this.finishBoarding(this.pendingBoardingOutcome);
      }
      return;
    }
    const activeIds = new Set(this.enemies.active.map((enemy) => enemy.id));
    for (const id of this.boardingEnemyIds) {
      if (!activeIds.has(id)) this.boardingEnemyIds.delete(id);
    }
    this.vehicleScene.setLandedBoardersAlive(this.boardingEnemyIds.size);
    // The pure controller owns the 0.75s hook flight; Game only supplies an
    // explicit cut/attach command, so entering hook-flight never skips it.
    const phase = this.vehicleManager.snapshot?.phase;
    const hook = this.vehicleScene.hookWorldPosition;
    const closeToHook =
      hook !== null && this.player.worldPosition.distanceTo(hook) <= INTERACT_REACH + 1.5;
    if (
      closeToHook &&
      (phase === 'attached' || phase === 'boarding') &&
      this.input.isDown('interact')
    ) {
      this.vehicleScene.holdCutHook(dt);
    } else {
      this.vehicleScene.releaseCutHook();
    }
    this.vehicleScene.fixedUpdate(dt, false, false);
    const after = this.vehicleManager.snapshot;
    void after;
  }

  /** Choose the side that is closest to the currently mounted gun's yaw. */
  private tutorialSkiffSide(): 'port' | 'starboard' {
    const savedTurrets = this.defense.serialise();
    const saved =
      savedTurrets.find((turret) => turret.instanceId === this.tutorialTurretId) ??
      savedTurrets.find((turret) => turret.instanceId === this.defense.mounted) ??
      savedTurrets[0];
    const visual = saved ? this.build.turretVisual(saved.instanceId) : null;
    if (!saved || !visual?.yaw.parent) return 'port';

    const options: { side: 'port' | 'starboard'; x: number }[] = [
      { side: 'port', x: -13 },
      { side: 'starboard', x: 13 },
    ];
    const current = saved.yaw;
    let best = options[0]!;
    let bestDistance = Number.POSITIVE_INFINITY;
    let hasValidSide = false;
    for (const option of options) {
      const target = new THREE.Vector3(option.x, DECK_HEIGHT + 1, 0);
      const parentLocal = visual.yaw.parent.worldToLocal(target);
      const local = parentLocal.sub(visual.yaw.position);
      const authoredYaw = Math.atan2(-local.x, -local.z);
      const desired = -authoredYaw;
      if (
        desired < TURRETS['manual-turret'].traverse.yawMin ||
        desired > TURRETS['manual-turret'].traverse.yawMax
      ) {
        continue;
      }
      const delta = Math.abs(Math.atan2(Math.sin(desired - current), Math.cos(desired - current)));
      if (delta < bestDistance) {
        best = option;
        bestDistance = delta;
        hasValidSide = true;
      }
    }
    if (hasValidSide) return best.side;

    // Both sides should not be outside the 240° traverse, but keep the
    // deterministic fallback safe if a future layout moves the gun farther
    // aft or forward than today's deck.
    return 'port';
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
    this.refreshFirstRunObjective();
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
    this.state.simTime = 0;
    this.state.paused = false;
    this.state.playerDead = false;
    this.world.reset(0);
    this.spawner.resync(0);
    this.director.reset(0);
    this.threatPhase = 'calm';
    this.vehicleScene.clear();
    this.gunboatScene.clear();
    this.gunboatResolutionApplied = false;
    this.boardingEnemyIds.clear();
    this.pendingBoardingOutcome = null;
    this.scriptedGunboatPending = false;
    this.tutorialStarted = false;
    this.tutorialReadyAt = null;
    this.tutorialTurretId = null;
    this.defense.clear();
    this.automaticDefense.clear();
    for (const collector of this.collectors.values()) collector.dispose();
    this.collectors.clear();
    this.resetInventory();
    this.progression.restore(undefined);
    this.story.restore(undefined);
    this.cancelSignalBattle();
    this.radioRaids.restore();
    this.destination.setActive(false);
    this.destination.configure(this.story.chapter);
    this.routeRefusal = null;
    this.destination.syncProgress({ journalsRead: [], uniqueCollected: false });
    this.resetStructures();
    this.machine.power.restore({ fuel: STARTING_FUEL });
    this.machine.damage.restore(undefined);
    this.machine.movement.setScriptedSpeedLimit(null);
    this.refreshUpgradeModifiers();
    this.playableStartedAt = null;
    this.sessionMetrics.reset();
    this.radioModel.visible = false;
    this.destination.setActive(false);
    this.machine.setExpeditionGangwayOpen(false);
    this.machine.power.unregisterConsumer(this.radioPowerConsumerId);
    this.machine.power.unregisterConsumer(this.helmPowerConsumerId);
    this.radioPowered = false;
    this.salvage.reset(0);
    this.hook = null;
    this.hookedCrate = null;
    this.reelReady = false;
    this.combat.equip('rifle');
    this.player.stats.reset();
    this.player.needs.reset();
    this.firstRun.restore(undefined);
    this.autosavePending = false;
    this.pendingSaveAndQuit = false;
    this.nextAutosaveAt = this.state.simTime + 60;
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
    this.audio.setAmbienceVolume(settings.ambienceVolume);
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
    return (
      this.inventoryUI.isOpen ||
      this.radioUI.isOpen ||
      this.researchUI.isOpen ||
      this.expeditionUI.isOpen
    );
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

  /** World-space radio mount used by interaction and route-driving tools. */
  get radioWorldPosition(): THREE.Vector3 {
    const position = new THREE.Vector3();
    this.radioModel.getWorldPosition(position);
    return position;
  }

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
      kind:
        station.piece === 'turret-manual'
          ? 'turret'
          : station.piece === 'turret-auto'
            ? 'turret-auto'
            : station.piece === 'collector-auto'
              ? 'collector'
              : ((isProducer(station.piece) ? 'producer' : station.piece) as Interactable['kind']),
    }));

    if (this.progression.earlyRadioDrop.radioFound) {
      out.push({
        id: this.radioPowerConsumerId,
        label: 'Recovered Radio',
        position: this.radioWorldPosition,
        kind: 'radio',
      });
    }
    const helm = this.helmInteract;
    if (helm) {
      const position = new THREE.Vector3();
      helm.getWorldPosition(position);
      out.push({ id: this.helmPowerConsumerId, label: 'Navigation Helm', position, kind: 'helm' });
    }
    if (this.destination.docked) out.push(...this.destination.interactables);

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
      this.bus.emit('repair:completed', {
        targetId: target.id,
        targetKind: target.kind,
      });
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
    if (this.defense.mounted) {
      if (this.input.consumePressed('interact') || this.input.consumePressed('cancel')) {
        this.defense.exit();
      }
      this.hud.setPrompt('[E] Exit manual deck gun');
      return;
    }
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

    this.hud.setPrompt(this.panelsOpen ? null : (repairPrompt ?? this.promptFor(nearest)));
  }

  /** What standing at something says. Null when standing at nothing. */
  private promptFor(nearest: Interactable | null): string | null {
    if (!nearest) return null;
    if (nearest.kind === 'producer') return this.producerPrompt(nearest);
    if (nearest.kind === 'turret') {
      return this.machine.power.isPowered(nearest.id)
        ? '[E] Enter Manual Deck Gun'
        : 'Manual Deck Gun — NO POWER';
    }
    if (nearest.kind === 'turret-auto') {
      return this.machine.power.isPowered(nearest.id)
        ? 'Automatic Defense Turret — SCANNING'
        : 'Automatic Defense Turret — NO POWER';
    }
    if (nearest.kind === 'collector') {
      const controller = this.collectors.get(nearest.id);
      if (!this.machine.power.isPowered(nearest.id)) return 'Automatic Collector — NO POWER';
      if (!controller) return 'Automatic Collector — SCANNING';
      if (controller.state === 'latched' && controller.bufferFull)
        return 'Automatic Collector — BUFFER FULL';
      if (controller.state === 'claiming') return 'Automatic Collector — REELING';
      if (controller.bufferedCount > 0)
        return `Automatic Collector — READY: ${controller.bufferedCount}`;
      return 'Automatic Collector — SCANNING';
    }
    if (nearest.kind !== 'generator') return `[E] Open ${nearest.label}`;

    const power = this.machine.power;
    const tank = `${Math.floor(power.fuel)}/${FUEL_TANK_CAP}`;
    const carried = this.resources.count('fuel');
    if (carried <= 0)
      return power.fuel <= 0
        ? `${nearest.label} — empty. Reel salvage [F] for fuel.`
        : `${nearest.label} — ◆ ${tank}`;
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
    this.closeSpecialPanels();
    this.inventoryUI.setMode('inventory', { title: 'Inventory' });
    this.releasePointerLock();
  }

  private closeSpecialPanels(): void {
    this.radioUI.close();
    this.researchUI.close();
    this.expeditionUI.close();
  }

  private openRadio(): void {
    if (!this.progression.earlyRadioDrop.radioFound) return;
    this.closeSpecialPanels();
    const snapshot = this.story.snapshot(this.world.distanceTraveled);
    this.radioUI.open({
      found: true,
      powered: this.machine.power.isPowered(this.radioPowerConsumerId),
      signalText: snapshot.objective,
      strength: snapshot.signalStrength,
      remainingM: snapshot.remainingM,
      nextSignal: this.story.legacyProjection().nextSignal,
      canDepart:
        this.story.currentPhase === 'docked' &&
        this.story.legacyProjection().uniqueCollected &&
        this.destination.playerOnMachine(this.player.worldPosition),
    });
    this.releasePointerLock();
  }

  private openResearch(): void {
    this.closeSpecialPanels();
    this.researchUI.open(this.researchPanelState());
    this.releasePointerLock();
  }

  private refreshResearchPanel(): void {
    if (this.researchUI.isOpen) this.researchUI.setState(this.researchPanelState());
  }

  private researchPanelState(): ResearchUIState {
    const upgrades = this.progression.upgrades;
    const active: Record<string, string> = {};
    for (const branch of ['propulsion', 'power', 'defense'] as const) {
      const id = upgrades.active(branch);
      if (id) active[branch] = id;
    }
    return {
      researched: upgrades.researchedIds,
      active,
      radioPowered: this.machine.power.isPowered(this.radioPowerConsumerId),
      stable: this.isStableForResearch(),
      resources: (id) => this.resources.count(id as ItemId),
      canResearch: (id) => upgrades.canResearch(id, this.resources),
      canActivate: (id) => upgrades.hasResearched(id),
    };
  }

  private isStableForResearch(): boolean {
    return (
      this.opening.phase === 'done' &&
      this.enemies.activeCount === 0 &&
      !this.vehicleManager.active &&
      !this.gunboatScene.active &&
      !this.scriptedGunboatPending &&
      this.pendingBoardingOutcome === null &&
      !this.state.playerDead &&
      this.destination.playerOnMachine(this.player.worldPosition) &&
      ['locked', 'signal', 'raids', 'route-selection', 'docked', 'complete'].includes(
        this.story.currentPhase,
      )
    );
  }

  private researchUpgrade(id: UpgradeId): void {
    if (
      !this.progression.earlyRadioDrop.radioFound ||
      !this.machine.power.isPowered(this.radioPowerConsumerId) ||
      !this.isStableForResearch()
    )
      return;
    const result = this.progression.upgrades.research(id, this.resources);
    if (!result.ok) return;
    this.bus.emit('upgrade:researched', { id });
    this.refreshUpgradeModifiers();
    this.openResearch();
    this.requestAutosave();
  }

  private activateUpgrade(id: UpgradeId): void {
    if (
      !this.progression.earlyRadioDrop.radioFound ||
      !this.machine.power.isPowered(this.radioPowerConsumerId) ||
      !this.isStableForResearch()
    )
      return;
    const definition = this.progression.upgrades.definition(id);
    if (!definition || !this.progression.upgrades.activate(id)) return;
    this.refreshUpgradeModifiers();
    this.bus.emit('upgrade:active-changed', { branch: definition.branch, id });
    this.openResearch();
    this.requestAutosave();
  }

  private deactivateUpgrade(branch: UpgradeBranch): void {
    // Uninstall must remain possible when an active power upgrade has shed the
    // radio itself. Research and installation still require radio power, but
    // removing hardware is the recovery action that restores capacity.
    if (!this.progression.earlyRadioDrop.radioFound || !this.isStableForResearch()) return;
    const result = this.progression.upgrades.setActive(branch, null);
    if (!result.ok) return;
    this.refreshUpgradeModifiers();
    this.bus.emit('upgrade:active-changed', { branch, id: null });
    this.openResearch();
    this.requestAutosave();
  }

  private refreshUpgradeModifiers(): void {
    const modifiers = this.progression.upgrades.modifiers();
    this.machine.movement.setModifiers({
      speedMultiplier: modifiers.speedMultiplier,
      effectiveWeightMultiplier: modifiers.effectiveWeightMultiplier,
      accelerationMultiplier: modifiers.accelerationMultiplier,
    });
    this.machine.power.setModifiers({
      fuelBurnMultiplier: modifiers.fuelBurnMultiplier,
      generationBonus: modifiers.generationBonus,
    });
    for (const piece of this.build.serialise()) {
      if (piece.definitionId !== 'turret-manual') continue;
      this.machine.power.unregisterConsumer(piece.instanceId);
      this.machine.power.registerConsumer({
        id: piece.instanceId,
        draw: this.defense.effectivePowerDraw,
        priority: 'defense',
      });
    }
    const active: Partial<Record<'propulsion' | 'power' | 'defense', UpgradeId>> = {};
    for (const branch of ['propulsion', 'power', 'defense'] as const) {
      const id = this.progression.upgrades.active(branch);
      if (id) active[branch] = id;
    }
    applyUpgradeVisuals(this.machine.group, active);
    for (const piece of this.build.serialise()) {
      if (piece.definitionId !== 'turret-manual') continue;
      const visual = this.build.turretVisual(piece.instanceId);
      if (visual) applyTurretUpgradeVisual(visual.root, active.defense ?? null);
    }
  }

  private readExpeditionJournal(id: string): void {
    if (!this.destination.docked) return;
    const before = this.story.legacyProjection();
    const alreadyRead = before.journalsRead.includes(id);
    if (!alreadyRead && !this.story.readJournal(id)) return;
    const progress = this.story.legacyProjection();
    this.destination.syncProgress({
      journalsRead: progress.journalsRead,
      uniqueIds: this.story.snapshot(this.world.distanceTraveled).recoveredUniques,
    });
    if (!alreadyRead) this.bus.emit('story:journal-read', { id });
    this.expeditionUI.setView(this.expeditionView());
    this.openExpedition();
  }

  private expeditionView(): Parameters<ExpeditionUI['setView']>[0] {
    const snapshot = this.story.snapshot(this.world.distanceTraveled);
    const save = this.story.legacyProjection();
    return {
      phase: snapshot.phase,
      objective: snapshot.objective,
      strength: snapshot.signalStrength,
      remainingM: snapshot.remainingM,
      expeditionId: snapshot.expeditionId,
      journalsRead: save.journalsRead,
      uniqueCollected: save.uniqueCollected,
      playerOnMachine: this.destination.playerOnMachine(this.player.worldPosition),
      journalTexts: Object.fromEntries(
        this.story
          .legacyProjection()
          .journalsRead.map((id) => [
            id,
            this.story.chapter.journals.find((journal) => journal.id === id)?.text ?? '',
          ]),
      ),
      routes: snapshot.phase === 'route-selection' ? ['foundry-direct', 'foundry-detour'] : [],
      routeCards:
        snapshot.phase === 'route-selection'
          ? routeCards(
              this.world.distanceTraveled,
              (FUEL_BURN_PER_S * this.progression.upgrades.modifiers().fuelBurnMultiplier) /
                Math.max(0.1, this.machine.movement.maxSpeed),
              this.machine.movement.maxSpeed,
            )
          : [],
      routeRefusal: this.routeRefusal,
      recoveredUniques: snapshot.recoveredUniques,
    };
  }

  private selectStoryRoute(route: 'foundry-direct' | 'foundry-detour'): void {
    const result = this.story.selectRoute(route, {
      poweredHelm: this.machine.power.isPowered(this.helmPowerConsumerId),
      playerOnMachine: this.destination.playerOnMachine(this.player.worldPosition),
      stable: this.isStableForStory(),
      encounterActive:
        this.enemies.activeCount > 0 || this.vehicleManager.active || this.gunboatScene.active,
      currentDistance: this.world.distanceTraveled,
    });
    if (!result.ok) {
      this.routeRefusal =
        result.reason === 'helm-unpowered'
          ? 'Power the navigation helm first'
          : result.reason === 'off-machine'
            ? 'Return to the helm to choose a route'
            : result.reason === 'unstable'
              ? 'Wait until the machine is stable'
              : 'Route unavailable';
      this.expeditionUI.setView(this.expeditionView());
      this.openExpedition();
      return;
    }
    this.routeRefusal = null;
    this.applyStoryEffects(result.effects);
    this.closePanels();
  }

  private openExpedition(): void {
    this.closeSpecialPanels();
    this.expeditionUI.open(this.expeditionView());
    this.releasePointerLock();
  }

  private requestExpeditionDeparture(): void {
    const effects = this.story.requestDepart({
      playerOnMachine: this.destination.playerOnMachine(this.player.worldPosition),
    });
    if (effects.length === 0) return;
    this.applyStoryEffects(effects);
    this.closePanels();
    this.requestAutosave();
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

    if (target.kind === 'turret') return this.defense.enter(target.id);
    if (target.kind === 'turret-auto') return false;
    if (target.kind === 'collector') {
      const buffer = this.build.collectorContainer(target.id);
      if (!buffer) return false;
      this.inventoryUI.setMode('transfer', {
        title: target.label,
        buffer,
        storageLabel: 'Collector Buffer',
      });
      this.releasePointerLock();
      return true;
    }
    if (target.kind === 'radio') {
      this.openRadio();
      return true;
    }
    if (target.kind === 'helm') {
      this.openExpedition();
      return true;
    }
    if (target.kind === 'journal') {
      this.readExpeditionJournal(target.id);
      return true;
    }
    if (target.kind === 'unique') {
      return this.collectStoryUnique(target.id);
    }
    if (target.kind === 'departure') {
      this.requestExpeditionDeparture();
      return true;
    }

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

  private collectStoryUnique(interactionId: string): boolean {
    const id = interactionId.includes('salvage-controller')
      ? 'salvage-controller'
      : interactionId.includes('tracking-servo')
        ? 'tracking-servo'
        : 'course-gyro';
    if (!this.destination.docked || !this.destination.containsPlayer(this.player.worldPosition))
      return false;
    if (!this.story.collectUnique(id)) return false;
    if (
      id === 'salvage-controller' &&
      this.progression.grantBlueprint('automatic-salvage-collector')
    )
      this.bus.emit('progression:unlocked', { id: 'automatic-salvage-collector' });
    if (id === 'tracking-servo' && this.progression.grantBlueprint('automatic-defense-turret'))
      this.bus.emit('progression:unlocked', { id: 'automatic-defense-turret' });
    if (id === 'course-gyro' && !this.machine.power.isPowered(this.helmPowerConsumerId)) {
      this.machine.power.registerConsumer({
        id: this.helmPowerConsumerId,
        draw: 1,
        priority: 'station',
      });
    }
    const view = this.story.snapshot(this.world.distanceTraveled);
    this.destination.syncProgress({
      journalsRead: this.story.legacyProjection().journalsRead,
      uniqueIds: view.recoveredUniques,
    });
    if (id === 'course-gyro') this.bus.emit('story:unique-collected', { id });
    this.expeditionUI.setView(this.expeditionView());
    this.requestAutosave();
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
    this.radioUI.close();
    this.researchUI.close();
    this.expeditionUI.close();
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
      const standingOn = Math.round((this.player.worldPosition.y - DECK_HEIGHT - 1) / LEVEL_HEIGHT);
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
    if (this.input.consumePressed('rotate-right'))
      this.buildRotation = (this.buildRotation + 1) % 4;

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
    this.world.applyQuality(this.quality);
    this.sandFX.applyQuality(this.quality);
    this.impactFX.applyQuality(this.quality);
    this.lampLights.applyQuality(this.quality.lampLights);
  }

  // -------------------------------------------------------------------------
  // Save / load
  // -------------------------------------------------------------------------

  /** A save may not erase a live encounter on the next load. */
  private isSafeToSave(allowPauseMenu = false): boolean {
    return (
      this.opening.phase === 'done' &&
      (!this.titleScreen?.isOpen || (allowPauseMenu && this.state.paused)) &&
      (!this.state.paused || allowPauseMenu) &&
      !this.state.playerDead &&
      this.enemies.activeCount === 0 &&
      !this.vehicleManager.active &&
      !this.gunboatScene.active &&
      !this.scriptedGunboatPending &&
      this.pendingBoardingOutcome === null &&
      this.hook === null &&
      this.hookedCrate === null &&
      ['locked', 'signal', 'raids', 'route-selection', 'docked', 'complete'].includes(
        this.story.currentPhase,
      ) &&
      !(
        this.story.currentPhase === 'docked' &&
        this.destination.playerOnGangway(this.player.worldPosition)
      )
    );
  }

  private processAutosave(): void {
    if (this.autosaveInFlight || !this.autosavePending) return;
    if (this.state.simTime < this.nextAutosaveAt && !this.pendingSaveAndQuit) return;
    if (!this.isSafeToSave()) return;

    this.autosavePending = false;
    this.autosaveInFlight = true;
    const quitting = this.pendingSaveAndQuit;
    void this.saveTo('quicksave', 'auto')
      .then((saved) => {
        if (saved) {
          this.nextAutosaveAt = this.state.simTime + 60;
          if (quitting) {
            this.pendingSaveAndQuit = false;
            this.enterTitle();
          }
        } else {
          // Storage failures must not turn an expired deadline into a write
          // attempt every fixed tick. Keep the in-memory game alive and retry
          // at the next normal checkpoint.
          this.nextAutosaveAt = this.state.simTime + 60;
          if (quitting) this.pendingSaveAndQuit = false;
        }
      })
      .finally(() => {
        this.autosaveInFlight = false;
      });
  }

  private async saveFromPause(quit: boolean): Promise<void> {
    if (!this.titleScreen?.isOpen) return;
    if (!this.isSafeToSave(true)) {
      if (quit) {
        this.pendingSaveAndQuit = true;
        this.autosavePending = true;
        const message = this.destination.playerOnGangway(this.player.worldPosition)
          ? 'Return to the machine deck before saving'
          : ['approach', 'braking', 'departing'].includes(this.story.currentPhase)
            ? 'Wait until the machine is safely moored'
            : 'Finish the attack to save & quit';
        this.titleScreen.showStatus(message, true);
        this.hud.setWarning(message);
        this.resume();
      } else {
        this.titleScreen.showStatus(
          this.destination.playerOnGangway(this.player.worldPosition)
            ? 'Return to the machine deck before saving'
            : ['approach', 'braking', 'departing'].includes(this.story.currentPhase)
              ? 'Wait until the machine is safely moored'
              : 'Finish the attack before saving',
          true,
        );
      }
      return;
    }

    this.titleScreen.showStatus('Saving…');
    const saved = await this.saveTo('quicksave', 'manual', true);
    if (!saved) {
      this.titleScreen.showStatus('Save failed — progress remains in memory', true);
      return;
    }
    this.titleScreen.showStatus(quit ? 'Saved' : 'Saved');
    if (quit) this.enterTitle();
  }

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
        layout: nomadProfile.layout,
        structures: [...this.build.serialise(), ...this.build.recoveryPieces],
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
      progression: {
        ...this.progression.toSave(),
        radio: this.progression.earlyRadioDrop.toSave(),
        opening: this.opening.toSave(),
        firstRun: this.firstRun.toSave(),
        turrets: this.defense.serialise(),
        automaticTurrets: this.automaticDefense.toSave(),
      },
      world: {
        chunkIndex: Math.floor(this.world.distanceTraveled / 64),
        threatDirector: this.director.toSave(),
        story: this.story.toSave(),
        radioRaids: this.radioRaids.toSave(),
      },
    };
  }

  async saveTo(
    slot: string,
    mode: 'manual' | 'auto' = 'manual',
    allowPauseMenu = false,
  ): Promise<boolean> {
    if (!this.isSafeToSave(allowPauseMenu)) return false;
    try {
      await this.saves.save(slot, this.buildSave());
      this.bus.emit('game:save-written', { slot });
      return true;
    } catch (error) {
      const message =
        mode === 'manual' ? 'Save failed — progress remains in memory' : 'Autosave failed';
      this.titleScreen?.showStatus(message, true);
      this.hud.setWarning(message);
      this.bus.emit('game:save-failed', { message });
      if (import.meta.env.DEV) console.warn('Save failed', error);
      return false;
    }
  }

  async loadFrom(slot: string): Promise<boolean> {
    const save = await this.saves.load(slot);
    if (!save) return false;
    this.sessionMetrics.reset();

    // Distance drives everything about the world, so restoring it regenerates
    // the identical chunks — nothing about the world itself is stored.
    this.world.reset(save.distanceTraveled);
    this.vehicleScene.clear();
    this.gunboatScene.clear();
    this.boardingEnemyIds.clear();
    this.gunboatResolutionApplied = false;
    this.scriptedGunboatPending = false;
    this.routeRefusal = null;
    this.pendingBoardingOutcome = null;
    this.tutorialStarted = false;
    this.tutorialReadyAt = null;
    this.tutorialTurretId = null;
    // Derived from distance, so a load re-derives it rather than restoring it.
    this.spawner.resync(save.distanceTraveled);
    // A save written before the director existed restores as a fresh one from
    // the same seed, which is the same thing a new game gets.
    if (save.world.threatDirector) {
      this.director.restore(save.world.threatDirector);
      // External scenes are intentionally never serialized. A restored
      // director flag therefore represents an orphaned encounter and must
      // return to a calm floor without awarding salvage or recovery credit.
      if (this.director.hasActiveExternalEncounter)
        this.director.abortOrphanExternal(save.distanceTraveled);
    } else this.director.reset(save.distanceTraveled);
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
    this.automaticDefense.clear();
    for (const collector of this.collectors.values()) collector.dispose();
    this.collectors.clear();
    this.build.restore(save.machine.structures ?? [], true);
    this.defense.clear();
    const savedTurrets = new Map(
      (save.progression.turrets ?? []).map((turret) => [turret.instanceId, turret]),
    );
    for (const piece of this.build.serialise()) {
      if (piece.definitionId === 'turret-manual')
        this.defense.register(piece.instanceId, savedTurrets.get(piece.instanceId));
    }
    const savedAutomaticTurrets = new Map(
      (save.progression.automaticTurrets ?? []).map((turret) => [turret.instanceId, turret]),
    );
    for (const piece of this.build.serialise()) {
      if (piece.definitionId === 'turret-auto')
        this.automaticDefense.register(
          piece.instanceId,
          savedAutomaticTurrets.get(piece.instanceId),
        );
    }
    this.progression.restore(save.progression);
    const savedRadio = save.progression.radio ?? save.progression.radioDrop;
    this.progression.earlyRadioDrop.restore(savedRadio);
    this.radioPowered = false;
    // Saves written before the radio ledger existed become pending once their
    // completed opening is restored, so the next real chest is eligible.
    this.radioModel.visible = this.progression.earlyRadioDrop.radioFound;
    this.machine.power.unregisterConsumer(this.radioPowerConsumerId);
    if (this.progression.earlyRadioDrop.radioFound) {
      this.machine.power.registerConsumer({
        id: this.radioPowerConsumerId,
        draw: 1,
        priority: 'station',
      });
      this.radioPowered = this.machine.power.isPowered(this.radioPowerConsumerId);
    }
    this.story.restore(save.world.story);
    this.cancelSignalBattle();
    this.radioRaids.restore(save.world.radioRaids);
    const recovered = this.story.snapshot(save.distanceTraveled).recoveredUniques;
    if (recovered.includes('salvage-controller'))
      this.progression.grantBlueprint('automatic-salvage-collector');
    if (recovered.includes('tracking-servo'))
      this.progression.grantBlueprint('automatic-defense-turret');
    this.machine.power.unregisterConsumer(this.helmPowerConsumerId);
    if (this.story.snapshot(save.distanceTraveled).recoveredUniques.includes('course-gyro'))
      this.machine.power.registerConsumer({
        id: this.helmPowerConsumerId,
        draw: 1,
        priority: 'station',
      });
    const storyPayload = this.story.toSave();
    const legacyStory = this.story.legacyProjection();
    const campaignStory = 'format' in storyPayload ? storyPayload : null;
    const storyPhase = campaignStory?.active?.phase ?? legacyStory.phase;
    const storyArrival = campaignStory?.active?.arrivalDistance ?? legacyStory.arrivalDistance;
    const storyJournals = campaignStory?.active?.journalsRead ?? legacyStory.journalsRead;
    const storyUniques = this.story.snapshot(save.distanceTraveled).recoveredUniques;
    // Reset the previous destination before applying the restored target. A
    // destination that was docked in the old run intentionally ignores target
    // changes while docked; undocking first keeps loading a new/legacy run
    // from silently retaining its old wreck position.
    this.destination.setActive(false);
    this.destination.configure(this.story.chapter);
    this.destination.syncProgress({
      journalsRead: storyJournals,
      uniqueIds: storyUniques,
    });
    this.destination.setArrivalDistance(storyArrival ?? 0);
    const dockedRestore = storyPhase === 'docked';
    const destinationActive = ['approach', 'braking', 'docked', 'departing'].includes(storyPhase);
    this.destination.setActive(destinationActive);
    this.destination.setDocked(dockedRestore);
    this.machine.setExpeditionGangwayOpen(dockedRestore);
    this.destination.fixedUpdate(save.distanceTraveled);
    this.director.setSanctuary(
      ['approach', 'braking', 'docked'].includes(storyPhase),
      save.distanceTraveled,
    );
    this.playableStartedAt = this.state.simTime;
    this.salvage.reset(save.distanceTraveled);
    this.hook = null;
    this.hookedCrate = null;
    this.reelReady = false;
    if (this.opening.phase === 'done' && !this.progression.earlyRadioDrop.radioFound)
      this.salvage.armAfterOpening(save.distanceTraveled);
    this.refreshUpgradeModifiers();
    this.firstRun.restore(
      save.progression.firstRun ?? {
        completed: [
          'salvage',
          'build-refinery',
          'refine-components',
          'build-workbench',
          'build-defense',
          'survive-boarding',
          'repair',
        ],
        counters: {},
      },
    );
    this.observeFirstRun({ type: 'snapshot', snapshot: this.firstRunSnapshot() });
    if (this.firstRun.current === 'survive-boarding') {
      this.tutorialTurretId =
        this.build.serialise().find((piece) => piece.definitionId === 'turret-manual')
          ?.instanceId ?? null;
      this.tutorialReadyAt = this.state.simTime + 15;
    }
    // Absent in every save written before machine damage, and absent means
    // undamaged — which is what `restore` does with it.
    this.machine.damage.restore(save.machine.subsystems);
    this.bus.emit('inventory:changed', { scrap: this.inventory.count('scrap') });

    this.player.teleport(
      save.machine.layout === nomadProfile.layout
        ? new THREE.Vector3(save.player.position.x, save.player.position.y, save.player.position.z)
        : this.machine.deckSpawn,
    );
    this.player.stats.reset();
    this.player.stats.restoreHealth(save.player.health);
    this.player.restoreAfterLoad();
    this.state.playerDead = false;
    // Re-evaluate proximity and onboarding facts after the restored capsule is
    // in its final destination. This also arms an already-crewed turret save.
    this.observeFirstRun({ type: 'snapshot', snapshot: this.firstRunSnapshot() });
    if (this.firstRun.current === 'survive-boarding' && this.defense.mounted) {
      this.tutorialTurretId = this.defense.mounted;
      this.tutorialReadyAt ??= this.state.simTime + 15;
    }
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
    if (this.opening.phase === 'done') {
      this.playableStartedAt = this.state.simTime;
      this.sessionMetrics.mark('opening.done');
      if (!savedRadio) this.progression.earlyRadioDrop.arm(this.state.simTime);
      if (!this.progression.earlyRadioDrop.radioFound)
        this.salvage.armAfterOpening(save.distanceTraveled);
    }
    if (this.rooftop) {
      this.rooftop.dispose();
      this.rooftop = null;
      this.rooftopScrolling = false;
    }
    this.player.setSpawn(this.machine.deckSpawn);
    this.setArmed(true);
    this.machine.movement.setThrottle(1);
    this.machine.movement.setScriptedSpeedLimit(dockedRestore ? 0 : null);
    this.bus.emit('opening:phase', { phase: this.opening.phase });
    this.refreshFirstRunObjective();

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
    this.signalBattle?.dispose();
    this.disconnectSounds();
    this.audio.dispose();
    window.removeEventListener('resize', this.onResize);
    this.loop.stop();
    this.input.dispose();
    this.rooftop?.dispose();
    this.rooftop = null;
    this.titleScreen?.dispose();
    this.hud.dispose();
    this.defenseHUD.dispose();
    this.buildUI.dispose();
    this.inventoryUI.dispose();
    this.radioUI.dispose();
    this.researchUI.dispose();
    this.expeditionUI.dispose();
    this.destination.dispose();
    this.buildPreview.dispose();
    this.lampLights.dispose();
    this.machine.dispose();
    disposeLoadedModel(this.machineAuthoredModel);
    disposeLoadedModel(this.machineCollisionModel);
    this.machineCollisionModel = null;
    this.machineAuthoredModel = null;
    this.build.dispose();
    disposeAutomationModels();
    this.post.dispose();
    this.enemies.dispose();
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
