import type { Game } from './Game';
import { Container } from '@/items/Container';
import { ITEMS, type ItemId } from '@/data/items';
import {
  BUILD_PIECES,
  PIECE_CATEGORIES,
  piecesInCategory,
  type PieceCategory,
  type PieceId,
} from '@/data/build-pieces';
import { RECIPES, type Recipe, type StationId } from '@/data/recipes';
import { powerRoleOf } from '@/data/power';
import type { BuildPieceInstance } from '@/building/BuildSystem';
import type { CaretakerSnapshot } from '@/companion/CaretakerDirector';
import type { CampaignProfile } from './CampaignProfile';
import {
  craftOnboard,
  transferOnboardSlot,
  type OnboardContainerId,
  type OnboardMutationResult,
  type OnboardResourceContext,
  type OnboardStationEndpoint,
  type OnboardStorageEndpoint,
} from './OnboardTransactions';
import type { MachineOperationsView } from './MachineOperations';
import type { AttachmentId } from '@/data/weapon-loadouts';
import type { FieldworkView } from '@/ui/FieldworkUI';
import type {
  TerminalBuildView,
  TerminalCharacterView,
  TerminalCommand,
  TerminalMachineView,
  TerminalOutputDestinationView,
  TerminalRecipeView,
  TerminalSignalView,
  TerminalSlotView,
  TerminalStationView,
  TerminalStorageView,
  TerminalTab,
  TerminalView,
  TerminalWorkshopView,
} from './TerminalView';
import { TerminalUI, type TerminalAccessibility } from '@/ui/TerminalUI';

/** Public, game-owned reads and explicit mutation seams used by GameTerminal. */
export interface GameTerminalSource {
  readonly state: { paused: boolean; readonly playerDead?: boolean };
  readonly isPlayerAboard: () => boolean;
  readonly inventory: Container;
  readonly profile: () => CampaignProfile;
  readonly player: {
    readonly stats: {
      readonly health: number;
      readonly maxHealth: number;
      readonly stamina: number;
      readonly maxStamina: number;
    };
    readonly needs: { readonly hydration: number; readonly nourishment: number };
    readonly worldPosition: { readonly x: number; readonly y: number; readonly z: number };
  };
  readonly combat: {
    readonly current: {
      readonly def: { readonly id: string; readonly name: string };
      readonly ammoInMag: number;
      readonly reserveAmmo: number;
      readonly infiniteReserve: boolean;
      readonly researchedAttachments: readonly string[];
      readonly installedAttachment?: string | null;
    };
  };
  readonly resources: { canAfford(cost: Readonly<Record<string, number>>): boolean };
  readonly machine: {
    readonly power: { isPowered(id: string): boolean };
    readonly damage: { damaged(): readonly { id: string; fraction: number }[] };
  };
  readonly machineStatus?: () => readonly string[];
  readonly build: TerminalBuildSource;
  readonly caretaker: { snapshot(): CaretakerSnapshot };
  readonly operations?: () => MachineOperationsView | undefined;
  readonly records?: () => TerminalSignalView['records'];
  readonly scanner?: () => TerminalSignalView['scanner'];
  readonly objective?: () => TerminalSignalView['objective'];
  readonly radioMessages?: () => NonNullable<TerminalSignalView['radioMessages']>;
  readonly fieldwork?: () => readonly FieldworkView[];
  readonly actions: GameTerminalActions;
}

export interface TerminalBuildSource {
  serialise(): readonly BuildPieceInstance[];
  crateContainer(instanceId: string): Container | undefined;
  collectorContainer(instanceId: string): Container | undefined;
  canBuildPiece(piece: PieceId): boolean;
  producersNear(
    position: { x: number; y: number; z: number },
    reach: number,
  ): readonly { instanceId: string; itemId: ItemId; stored: number; capacity: number }[];
  gardenSnapshot(instanceId: string): Readonly<{ water: number; greens: number }> | null;
}

export interface GameTerminalActions {
  readonly close?: () => void;
  readonly eat: () => boolean;
  readonly drink: () => boolean;
  readonly collectOutput?: (
    sourceId: string,
    destinationId: string,
    amount?: number,
  ) => OnboardMutationResult;
  readonly waterGarden?: (
    gardenId: string,
    sourceId: string,
    amount?: number,
  ) => OnboardMutationResult;
  readonly repair?: (id: string) => boolean;
  readonly setCaretakerPriority?: (priority: 'auto' | 'gardens' | 'outputs') => boolean;
  readonly pinTask?: (pin: import('./MachineOperations').MachineOperationsPin | null) => void;
  readonly startScanner?: () => boolean;
  readonly selectBuildPiece?: (id: string) => void;
  readonly onCraftCompleted?: (recipeId: string) => void;
  /** Returns a player-facing refusal for unique/installed recipes, or null when allowed. */
  readonly canCraftRecipe?: (recipeId: string) => string | null;
  readonly recipeAllowed?: (recipeId: string) => string | null;
  readonly useItem?: (slot: number) => boolean;
  readonly takeAll?: (sourceId: string) => boolean;
  readonly depositMatching?: (sourceId: string) => boolean;
  readonly sortStorage?: (sourceId: string) => boolean;
  readonly harvestGarden?: (
    gardenId: string,
    destinationId: string,
    amount?: number,
  ) => OnboardMutationResult;
  readonly onInventoryChanged?: () => void;
  readonly fieldwork?: (
    kind: 'research' | 'equip',
    weaponId: string,
    attachmentId: AttachmentId | null,
  ) => boolean;
}

/**
 * Runtime adapter for the wrist terminal. It owns no simulation state beyond
 * the selected tab/storage; every view is rebuilt from current public systems.
 * Game supplies explicit callbacks for actions that are intentionally private.
 */
export class GameTerminal {
  readonly ui: TerminalUI;
  private readonly source: GameTerminalSource;
  private activeTab: TerminalTab = 'inventory';
  private selectedStorageId: string | null = null;
  private selectedOutputId: OnboardContainerId = 'carried';
  private selectedStationId: string | null = null;
  private _isOpen = false;

  constructor(parent: HTMLElement, source: GameTerminalSource) {
    this.source = source;
    this.ui = new TerminalUI(parent, { dispatch: (command) => this.dispatch(command) });
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  /** Shared onboard snapshot for Game-owned policies such as fieldwork. */
  onboardResources(): OnboardResourceContext {
    return this.context();
  }

  setAccessibility(accessibility: TerminalAccessibility): void {
    this.ui.setAccessibility(accessibility);
  }

  /** Game calls this only after it has claimed pause ownership. */
  open(tab: TerminalTab = 'inventory', targetId?: string): boolean {
    if (!this.source.state.paused || this.source.state.playerDead || !this.source.isPlayerAboard())
      return false;
    this.activeTab = tab;
    if (tab === 'workshop') this.selectedStationId = targetId ?? this.selectedStationId;
    if (tab === 'inventory') this.selectedStorageId = targetId ?? this.selectedStorageId;
    this._isOpen = true;
    this.ui.show(this.view());
    return true;
  }

  close(): boolean {
    if (!this._isOpen) return false;
    this._isOpen = false;
    this.ui.hide();
    return true;
  }

  refresh(): void {
    if (!this._isOpen) return;
    this.ui.update(this.view());
  }

  dispose(): void {
    this._isOpen = false;
    this.ui.dispose();
  }

  private dispatch(command: TerminalCommand): void {
    if (!this._isOpen) return;
    if (command.kind === 'close') {
      this.close();
      this.source.actions.close?.();
      return;
    }
    if (!this.source.state.paused || this.source.state.playerDead || !this.source.isPlayerAboard())
      return;
    switch (command.kind) {
      case 'select-tab':
        this.activeTab = command.tab;
        this.refresh();
        return;
      case 'select-storage':
        this.selectedStorageId = command.id;
        this.refresh();
        return;
      case 'select-output':
        this.selectedOutputId = command.id;
        this.refresh();
        return;
      case 'transfer':
        this.mutate(
          transferOnboardSlot(
            this.context(),
            command.sourceId,
            command.destinationId,
            command.slot,
            command.count,
          ),
        );
        return;
      case 'craft': {
        const recipe = RECIPES.find((entry) => entry.id === command.recipeId);
        const station = this.stationEndpoints().find((entry) => entry.id === command.stationId);
        if (!recipe || !station) return;
        if (this.recipeRefusal(recipe)) return;
        const result = craftOnboard(
          this.context(),
          [station],
          station.id,
          recipe,
          command.destinationId,
        );
        this.mutate(result);
        if (result.ok && result.moved === recipe.output.count)
          this.source.actions.onCraftCompleted?.(recipe.id);
        return;
      }
      case 'eat':
        if (this.source.actions.eat()) this.afterMutation();
        return;
      case 'drink':
        if (this.source.actions.drink()) this.afterMutation();
        return;
      case 'use-item':
        if (this.source.actions.useItem?.(command.slot)) this.afterMutation();
        return;
      case 'take-all':
        if (this.source.actions.takeAll?.(command.sourceId)) this.afterMutation();
        return;
      case 'deposit-matching':
        if (this.source.actions.depositMatching?.(command.sourceId)) this.afterMutation();
        return;
      case 'sort-storage':
        if (this.source.actions.sortStorage?.(command.sourceId)) this.afterMutation();
        return;
      case 'collect-output': {
        const result = this.source.actions.collectOutput?.(
          command.sourceId,
          command.destinationId,
          command.amount,
        );
        if (result) this.mutate(result);
        return;
      }
      case 'water-garden': {
        const result = this.source.actions.waterGarden?.(
          command.gardenId,
          command.sourceId,
          command.amount,
        );
        if (result) this.mutate(result);
        return;
      }
      case 'harvest-garden': {
        const result = this.source.actions.harvestGarden?.(
          command.gardenId,
          command.destinationId,
          command.amount,
        );
        if (result) this.mutate(result);
        return;
      }
      case 'repair':
        if (this.source.actions.repair?.(command.id)) this.afterMutation();
        return;
      case 'caretaker-priority':
        if (this.source.actions.setCaretakerPriority?.(command.priority)) this.refresh();
        return;
      case 'pin-task':
        this.source.actions.pinTask?.(command.pin);
        this.refresh();
        return;
      case 'start-scanner':
        if (this.source.actions.startScanner?.()) this.refresh();
        return;
      case 'select-build-piece':
        this.source.actions.selectBuildPiece?.(command.id);
        return;
      case 'fieldwork':
        if (this.source.actions.fieldwork?.(command.action, command.weaponId, command.attachmentId))
          this.afterMutation();
        return;
      case 'select-station':
        this.selectedStationId = command.id;
        this.activeTab = 'workshop';
        this.refresh();
        return;
    }
  }

  private mutate(result: OnboardMutationResult): void {
    if (result.moved > 0) this.afterMutation();
  }

  private afterMutation(): void {
    this.source.actions.onInventoryChanged?.();
    this.refresh();
  }

  private context(): OnboardResourceContext {
    const storage: OnboardStorageEndpoint[] = [];
    for (const piece of this.source.build.serialise()) {
      const kind =
        piece.definitionId === 'crate'
          ? 'crate'
          : piece.definitionId === 'collector-auto'
            ? 'collector'
            : null;
      if (!kind) continue;
      const container =
        kind === 'crate'
          ? this.source.build.crateContainer(piece.instanceId)
          : this.source.build.collectorContainer(piece.instanceId);
      if (!container) continue;
      storage.push({
        id: piece.instanceId,
        kind,
        label: BUILD_PIECES[piece.definitionId].name,
        container,
        online: piece.health > 0,
      });
    }
    return {
      carried: this.source.inventory,
      storage,
      aboard:
        this.source.state.paused && !this.source.state.playerDead && this.source.isPlayerAboard(),
    };
  }

  private storageViews(): { carried: TerminalStorageView; storage: TerminalStorageView[] } {
    const context = this.context();
    const all: TerminalStorageView[] = [];
    for (const entry of context.storage) all.push(this.storageView(entry));
    const selected =
      this.selectedStorageId &&
      all.some((entry) => entry.id === this.selectedStorageId && entry.online)
        ? this.selectedStorageId
        : (all.find((entry) => entry.online)?.id ?? null);
    this.selectedStorageId = selected;
    const carried: TerminalStorageView = {
      id: 'carried',
      label: 'Carried inventory',
      kind: 'carried',
      capacity: context.carried.capacity,
      slots: this.slots(context.carried),
      online: true,
      selected: selected === 'carried',
      transferEnabled: context.storage.some((entry) => entry.kind === 'crate' && entry.online),
      canTakeAll: false,
      canDeposit: false,
      canSort: !!this.source.actions.sortStorage,
    };
    return {
      carried,
      storage: all.map((entry) => ({ ...entry, selected: entry.id === selected })),
    };
  }

  private storageView(entry: OnboardStorageEndpoint): TerminalStorageView {
    return {
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      capacity: entry.container.capacity,
      slots: this.slots(entry.container),
      online: entry.online,
      selected: entry.id === this.selectedStorageId,
      transferEnabled: entry.online,
      canTakeAll: !!this.source.actions.takeAll,
      canDeposit: !!this.source.actions.depositMatching,
      canSort: !!this.source.actions.sortStorage,
    };
  }

  private slots(container: Container): TerminalSlotView[] {
    return container.slots.map((slot, index) => ({
      slot: index,
      itemId: slot?.itemId ?? null,
      label: slot ? ITEMS[slot.itemId].name : 'Empty slot',
      count: slot?.count ?? 0,
      // Keep the terminal action surface honest: resources such as scrap and
      // fuel are transfer-only, while these are the items Game.useSlot can
      // actually consume or fit.
      usable:
        !!slot &&
        !!this.source.actions.useItem &&
        (slot.itemId === 'water' ||
          slot.itemId === 'rations' ||
          slot.itemId === 'repair-kit' ||
          ITEMS[slot.itemId].category === 'mod' ||
          ITEMS[slot.itemId].category === 'ammo'),
    }));
  }

  private stationEndpoints(): OnboardStationEndpoint[] {
    const out: OnboardStationEndpoint[] = [];
    for (const piece of this.source.build.serialise()) {
      if (!['workbench', 'refinery', 'stove'].includes(piece.definitionId)) continue;
      const kind = piece.definitionId as StationId;
      const role = powerRoleOf(piece.definitionId);
      out.push({
        id: piece.instanceId,
        kind,
        powered: role?.kind !== 'consumer' || this.source.machine.power.isPowered(piece.instanceId),
        healthy: piece.health > 0,
        unlocked: this.source.build.canBuildPiece(piece.definitionId),
      });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  private view(): TerminalView {
    const stores = this.storageViews();
    const profile = this.source.profile();
    const weapon = this.source.combat.current;
    const character: TerminalCharacterView = {
      health: this.source.player.stats.health,
      maxHealth: this.source.player.stats.maxHealth,
      stamina: this.source.player.stats.stamina,
      maxStamina: this.source.player.stats.maxStamina,
      hydration: this.source.player.needs.hydration,
      nourishment: this.source.player.needs.nourishment,
      profile,
      weapon: {
        id: weapon.def.id,
        name: weapon.def.name,
        ammoInMagazine: weapon.ammoInMag,
        reserveAmmo: weapon.reserveAmmo,
        infiniteReserve: weapon.infiniteReserve,
        attachments: weapon.installedAttachment ? [weapon.installedAttachment] : [],
      },
    };
    const workshop = this.workshop();
    const machine = this.machineView();
    return {
      activeTab: this.activeTab,
      inventory: {
        carried: stores.carried,
        storage: stores.storage,
        canManage: this.source.isPlayerAboard(),
        canEat: this.source.inventory.count('rations') > 0,
        canDrink: this.source.inventory.count('water') > 0,
      },
      character,
      workshop,
      machine,
      signal: {
        scanner: this.source.scanner?.() ?? {
          installed: false,
          powered: false,
          progress: 0,
          canStart: false,
          refusal: 'Scanner controls are unavailable.',
        },
        records: this.source.records?.() ?? [],
        objective: this.source.objective?.(),
        radioMessages: this.source.radioMessages?.() ?? [],
      },
      build: this.buildView(),
      paused: this.source.state.paused,
    };
  }

  private workshop(): TerminalWorkshopView {
    const stations = this.stationEndpoints().map((entry): TerminalStationView => ({
      id: entry.id,
      label: BUILD_PIECES[entry.kind].name,
      kind: entry.kind,
      powered: entry.powered,
      healthy: entry.healthy,
      unlocked: entry.unlocked,
    }));
    const selectedStationId = stations.some((entry) => entry.id === this.selectedStationId)
      ? this.selectedStationId
      : (stations[0]?.id ?? null);
    this.selectedStationId = selectedStationId;
    const station = this.stationEndpoints().find((entry) => entry.id === selectedStationId);
    const destinations = this.outputDestinations();
    const destinationId = this.craftDestinationId(destinations);
    const recipes: TerminalRecipeView[] = RECIPES.filter(
      (recipe) => recipe.station === station?.kind,
    ).map((recipe) => {
      const specialRefusal = this.recipeRefusal(recipe);
      const canCraft =
        !!station &&
        station.powered &&
        station.healthy &&
        station.unlocked &&
        !specialRefusal &&
        this.canCraftRecipe(recipe, destinationId);
      return {
        recipe,
        canCraft,
        refusal:
          specialRefusal ??
          (!station
            ? 'Install this station aboard.'
            : !station.powered
              ? 'Station is unpowered.'
              : !station.healthy
                ? 'Station requires repair.'
                : !station.unlocked
                  ? 'Station is locked.'
                  : canCraft
                    ? undefined
                    : 'Missing inputs or destination space.'),
      };
    });
    return {
      stations,
      selectedStationId,
      recipes,
      selectedDestinationId: destinationId,
      outputDestinations: destinations,
      fieldwork: this.source.fieldwork?.(),
    };
  }

  private canCraftRecipe(recipe: Recipe, destinationId: string): boolean {
    const context = this.context();
    const destination =
      destinationId === 'carried'
        ? context.carried
        : context.storage.find(
            (entry) => entry.id === destinationId && entry.kind === 'crate' && entry.online,
          )?.container;
    if (!destination) return false;
    const sources = [
      { id: 'carried', container: context.carried },
      ...context.storage
        .filter((entry) => entry.kind === 'crate' && entry.online)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((entry) => ({ id: entry.id, container: entry.container })),
    ];
    const clones = new Map(
      sources.map((entry) => {
        const clone = new Container(entry.container.capacity);
        clone.restore(entry.container.serialise());
        return [entry.id, clone] as const;
      }),
    );
    for (const [itemId, amount] of Object.entries(recipe.inputs) as [ItemId, number][]) {
      let remaining = amount;
      for (const source of sources) {
        remaining -= clones.get(source.id)!.remove(itemId, remaining);
        if (remaining <= 0) break;
      }
      if (remaining > 0) return false;
    }
    const destinationClone =
      destinationId === 'carried' ? clones.get('carried')! : clones.get(destinationId);
    return (
      !!destinationClone && destinationClone.add(recipe.output.itemId, recipe.output.count) === 0
    );
  }

  private outputDestinations(): TerminalOutputDestinationView[] {
    const context = this.context();
    const destinations: TerminalOutputDestinationView[] = [
      { id: 'carried', label: 'Carried inventory' },
    ];
    for (const entry of context.storage
      .filter((candidate) => candidate.kind === 'crate' && candidate.online)
      .sort((a, b) => a.id.localeCompare(b.id))) {
      destinations.push({ id: entry.id, label: `${entry.label} (${entry.id})` });
    }
    if (!destinations.some((entry) => entry.id === this.selectedOutputId))
      this.selectedOutputId = 'carried';
    return destinations;
  }

  private craftDestinationId(destinations = this.outputDestinations()): OnboardContainerId {
    return destinations.some((entry) => entry.id === this.selectedOutputId)
      ? this.selectedOutputId
      : 'carried';
  }

  private recipeRefusal(recipe: Recipe): string | null {
    return (
      this.source.actions.recipeAllowed?.(recipe.id) ??
      this.source.actions.canCraftRecipe?.(recipe.id) ??
      null
    );
  }

  private machineView(): TerminalMachineView {
    const caretaker = this.source.caretaker.snapshot();
    const damaged = this.source.machine.damage.damaged();
    const destinations = this.outputDestinations();
    const destinationId = this.craftDestinationId(destinations);
    const context = this.context();
    const destination =
      destinationId === 'carried'
        ? context.carried
        : context.storage.find((entry) => entry.id === destinationId)?.container;
    const pieces = this.source.build.serialise();
    const producerPieces = new Map(
      pieces
        .filter((piece) => ['condenser', 'planter'].includes(piece.definitionId))
        .map((piece) => [piece.instanceId, piece]),
    );
    const producers = this.source.build
      .producersNear(this.source.player.worldPosition, Number.POSITIVE_INFINITY)
      .map((producer) => {
        const piece = producerPieces.get(producer.instanceId);
        const role = piece ? powerRoleOf(piece.definitionId) : null;
        const powered =
          role?.kind !== 'consumer' || this.source.machine.power.isPowered(producer.instanceId);
        const room = destination?.roomFor(producer.itemId) ?? 0;
        const canCollect =
          !!this.source.actions.collectOutput &&
          !!piece &&
          piece.health > 0 &&
          producer.stored > 0 &&
          room > 0;
        return {
          id: producer.instanceId,
          label: piece ? BUILD_PIECES[piece.definitionId].name : 'Output station',
          stored: producer.stored,
          capacity: producer.capacity,
          powered,
          health: piece?.health ?? 0,
          canCollect,
          refusal:
            !piece || piece.health <= 0
              ? 'Station is damaged.'
              : producer.stored <= 0
                ? 'No output stored.'
                : room <= 0
                  ? 'Selected destination is full.'
                  : undefined,
        };
      });
    const waterSource = this.waterSourceId();
    const gardens = pieces
      .filter((piece) => piece.definitionId === 'seed-garden')
      .flatMap((piece) => {
        const snapshot = this.source.build.gardenSnapshot(piece.instanceId);
        if (!snapshot) return [];
        const room = destination?.roomFor('greens') ?? 0;
        const canWater =
          !!this.source.actions.waterGarden &&
          !!waterSource &&
          piece.health > 0 &&
          snapshot.water < 2;
        const canHarvest =
          !!this.source.actions.harvestGarden &&
          piece.health > 0 &&
          snapshot.greens > 0 &&
          room > 0;
        return [
          {
            id: piece.instanceId,
            label: BUILD_PIECES['seed-garden'].name,
            water: snapshot.water,
            maxWater: 2,
            greens: snapshot.greens,
            canWater,
            canHarvest,
            refusal:
              piece.health <= 0
                ? 'Garden is damaged.'
                : snapshot.water >= 2
                  ? 'Water reservoir full.'
                  : !waterSource
                    ? 'No water in onboard storage.'
                    : snapshot.greens > 0 && room <= 0
                      ? 'Selected destination is full.'
                      : undefined,
          },
        ];
      });
    return {
      operations: this.source.operations?.(),
      status: [
        ...(this.source.machineStatus?.() ?? ['Fuel and station state are live from the machine.']),
        `${damaged.length} damaged subsystem${damaged.length === 1 ? '' : 's'}.`,
      ],
      caretaker: {
        recruited: caretaker.recruited,
        mode: caretaker.mode,
        priority: caretaker.priority,
        activeJob: caretaker.job ? caretaker.job.kind : null,
        decision: caretaker.refusal ?? (caretaker.job ? 'ready' : 'no-work'),
        canChangePriority:
          caretaker.recruited &&
          caretaker.mode === 'steward' &&
          pieces.some(
            (piece) =>
              piece.definitionId === 'caretaker-dock' &&
              piece.health > 0 &&
              this.source.machine.power.isPowered(piece.instanceId),
          ),
      },
      physicalNotes: [
        'Helm control remains physical.',
        'Fuel deposit and repair hold remain physical interactions.',
      ],
      repairs: damaged.map((entry) => ({
        id: entry.id,
        label: entry.id,
        condition: `${Math.round(entry.fraction * 100)}% condition`,
        canRepair: !!this.source.actions.repair,
        refusal: this.source.actions.repair ? undefined : 'Use the physical repair hold.',
      })),
      producers,
      gardens,
      outputDestinationId: destinationId,
      outputDestinations: destinations,
    };
  }

  private waterSourceId(): string {
    const context = this.context();
    if (context.carried.count('water') > 0) return 'carried';
    return (
      context.storage.find(
        (entry) => entry.kind === 'crate' && entry.online && entry.container.count('water') > 0,
      )?.id ?? ''
    );
  }

  private buildView(): TerminalBuildView {
    return {
      categories: PIECE_CATEGORIES.map((category: PieceCategory) => ({
        id: category,
        label: category[0]!.toUpperCase() + category.slice(1),
        pieces: piecesInCategory(category).map((id) => {
          const piece = BUILD_PIECES[id];
          const unlocked = this.source.build.canBuildPiece(id);
          return {
            id,
            label: piece.name,
            cost: piece.cost,
            unlocked,
            canBuild: unlocked && this.source.resources.canAfford(piece.cost),
          };
        }),
      })),
    };
  }
}

/** Compile-time assurance that the production Game still exposes its public seam. */
export type GameTerminalGame = Pick<
  Game,
  'state' | 'inventory' | 'resources' | 'machine' | 'build' | 'player' | 'combat' | 'caretaker'
>;
