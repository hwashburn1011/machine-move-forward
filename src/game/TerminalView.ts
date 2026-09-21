import type { ItemId } from '@/data/items';
import type { Recipe, StationId } from '@/data/recipes';
import type { MachineOperationsView, MachineOperationsPin } from './MachineOperations';
import type { OnboardContainerId, OnboardStorageKind } from './OnboardTransactions';
import type { FieldworkView, AttachmentId } from '@/ui/FieldworkUI';

export type TerminalTab = 'inventory' | 'character' | 'workshop' | 'machine' | 'signal' | 'build';

export interface TerminalSlotView {
  readonly slot: number;
  readonly itemId: ItemId | null;
  readonly label: string;
  readonly count: number;
  readonly usable: boolean;
}

export interface TerminalStorageView {
  readonly id: string;
  readonly label: string;
  readonly kind: OnboardStorageKind | 'carried';
  readonly capacity: number;
  readonly slots: readonly TerminalSlotView[];
  readonly online: boolean;
  readonly selected: boolean;
  readonly transferEnabled: boolean;
  readonly canTakeAll: boolean;
  readonly canDeposit: boolean;
  readonly canSort: boolean;
}

export interface TerminalInventoryView {
  readonly carried: TerminalStorageView;
  readonly storage: readonly TerminalStorageView[];
  readonly canManage: boolean;
  readonly canEat: boolean;
  readonly canDrink: boolean;
  readonly refusal?: string;
}

export interface TerminalCharacterView {
  readonly health: number;
  readonly maxHealth: number;
  readonly stamina: number;
  readonly maxStamina: number;
  readonly hydration: number;
  readonly nourishment: number;
  readonly profile: 'story';
  readonly weapon: {
    readonly id: string;
    readonly name: string;
    readonly ammoInMagazine: number;
    readonly reserveAmmo: number;
    readonly infiniteReserve: boolean;
    readonly attachments: readonly string[];
  };
}

export interface TerminalStationView {
  readonly id: string;
  readonly label: string;
  readonly kind: StationId;
  readonly powered: boolean;
  readonly healthy: boolean;
  readonly unlocked: boolean;
}

export interface TerminalRecipeView {
  readonly recipe: Recipe;
  readonly canCraft: boolean;
  readonly refusal?: string;
}

export interface TerminalOutputDestinationView {
  readonly id: OnboardContainerId;
  readonly label: string;
}

export interface TerminalWorkshopView {
  readonly stations: readonly TerminalStationView[];
  readonly selectedStationId: string | null;
  readonly recipes: readonly TerminalRecipeView[];
  readonly selectedDestinationId: OnboardContainerId;
  readonly outputDestinations: readonly TerminalOutputDestinationView[];
  readonly fieldwork?: readonly FieldworkView[];
}

export interface TerminalMachineView {
  readonly operations?: MachineOperationsView;
  readonly status: readonly string[];
  readonly caretaker: {
    readonly recruited: boolean;
    readonly mode: string;
    readonly priority: string;
    readonly activeJob: string | null;
    readonly decision: string;
    readonly globalBlock?: string;
    readonly canChangePriority?: boolean;
  };
  readonly physicalNotes: readonly string[];
  readonly repairs: readonly {
    readonly id: string;
    readonly label: string;
    readonly condition: string;
    readonly canRepair: boolean;
    readonly refusal?: string;
  }[];
  readonly producers: readonly {
    readonly id: string;
    readonly label: string;
    readonly stored: number;
    readonly capacity: number;
    readonly powered: boolean;
    readonly health: number;
    readonly canCollect: boolean;
    readonly refusal?: string;
  }[];
  readonly gardens: readonly {
    readonly id: string;
    readonly label: string;
    readonly water: number;
    readonly maxWater: number;
    readonly greens: number;
    readonly canWater: boolean;
    readonly canHarvest: boolean;
    readonly refusal?: string;
  }[];
  readonly outputDestinationId: OnboardContainerId;
  readonly outputDestinations: readonly TerminalOutputDestinationView[];
}

export interface TerminalSignalView {
  readonly scanner: {
    readonly installed: boolean;
    readonly powered: boolean;
    readonly progress: number;
    readonly canStart: boolean;
    readonly refusal?: string;
  };
  readonly records: readonly {
    readonly id: string;
    readonly title: string;
    readonly text: string;
  }[];
  readonly objective?: {
    readonly title: string;
    readonly text: string;
    readonly progress?: string;
  };
  readonly radioMessages?: readonly {
    readonly id: string;
    readonly title: string;
    readonly text: string;
  }[];
}

export interface TerminalBuildView {
  readonly categories: readonly {
    readonly id: string;
    readonly label: string;
    readonly pieces: readonly {
      readonly id: string;
      readonly label: string;
      readonly cost: Readonly<Partial<Record<ItemId, number>>>;
      readonly unlocked: boolean;
      readonly canBuild: boolean;
    }[];
  }[];
}

export interface TerminalView {
  readonly activeTab: TerminalTab;
  readonly inventory: TerminalInventoryView;
  readonly character: TerminalCharacterView;
  readonly workshop: TerminalWorkshopView;
  readonly machine: TerminalMachineView;
  readonly signal: TerminalSignalView;
  readonly build: TerminalBuildView;
  readonly paused: boolean;
  readonly busy?: boolean;
}

export type TerminalCommand =
  | { readonly kind: 'select-tab'; readonly tab: TerminalTab }
  | { readonly kind: 'select-station'; readonly id: string }
  | { readonly kind: 'eat' }
  | { readonly kind: 'drink' }
  | { readonly kind: 'use-item'; readonly slot: number }
  | { readonly kind: 'take-all'; readonly sourceId: string }
  | { readonly kind: 'deposit-matching'; readonly sourceId: string }
  | { readonly kind: 'sort-storage'; readonly sourceId: string }
  | { readonly kind: 'select-storage'; readonly id: string }
  | { readonly kind: 'select-output'; readonly id: OnboardContainerId }
  | {
      readonly kind: 'transfer';
      readonly sourceId: OnboardContainerId;
      readonly destinationId: OnboardContainerId;
      readonly slot: number;
      readonly count?: number;
    }
  | {
      readonly kind: 'craft';
      readonly stationId: string;
      readonly recipeId: string;
      readonly destinationId: OnboardContainerId;
    }
  | {
      readonly kind: 'collect-output';
      readonly sourceId: string;
      readonly destinationId: OnboardContainerId;
      readonly amount?: number;
    }
  | {
      readonly kind: 'water-garden';
      readonly gardenId: string;
      readonly sourceId: OnboardContainerId;
      readonly amount?: number;
    }
  | {
      readonly kind: 'harvest-garden';
      readonly gardenId: string;
      readonly destinationId: OnboardContainerId;
      readonly amount?: number;
    }
  | { readonly kind: 'repair'; readonly id: string }
  | { readonly kind: 'caretaker-priority'; readonly priority: 'auto' | 'gardens' | 'outputs' }
  | { readonly kind: 'pin-task'; readonly pin: MachineOperationsPin | null }
  | { readonly kind: 'start-scanner' }
  | { readonly kind: 'select-build-piece'; readonly id: string }
  | {
      readonly kind: 'fieldwork';
      readonly action: 'research' | 'equip';
      readonly weaponId: string;
      readonly attachmentId: AttachmentId | null;
    }
  | { readonly kind: 'close' };

export function terminalViewSignature(view: TerminalView): string {
  return JSON.stringify(view);
}
