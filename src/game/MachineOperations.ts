import { BUILD_PIECES, type PieceId } from '@/data/build-pieces';
import { ITEMS } from '@/data/items';
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';
import {
  DECK_PLATE_HALF,
  DECK_SURFACE_Y,
  LEVEL_HEIGHT,
  MACHINE_TILES_X,
  MACHINE_TILES_Z,
} from './constants';
import type { BuildPieceInstance } from '@/building/BuildSystem';
import {
  evaluateCaretakerWork,
  type CaretakerPriority,
  type CaretakerWorkResult,
  type CaretakerWorkSnapshot,
} from '@/companion/CaretakerWork';
import type {
  CaretakerJobPhase,
  CaretakerMode,
  CaretakerSnapshot,
} from '@/companion/CaretakerDirector';

export type MachineDeckId = 'lower' | 'middle' | 'upper';
export const MACHINE_DECKS: readonly MachineDeckId[] = ['lower', 'middle', 'upper'];

export interface MachineOperationsPin {
  kind: 'subsystem' | 'structure';
  id: string;
}
export type OperationsPin = MachineOperationsPin;
export type OperationsGlobalBlock =
  'unsafe' | 'dock-missing' | 'dock-unpowered' | 'companion-mode' | 'busy';
export interface MachineOperationsSave {
  format: 1;
  pin?: OperationsPin;
}

export type OperationsNodeKind = 'subsystem' | 'storage' | 'producer' | 'garden' | 'equipment';
export type MachineOperationsNodeKind = OperationsNodeKind;

export interface MachineOperationsNode {
  id: string;
  source: MachineOperationsPin;
  kind: MachineOperationsNodeKind;
  label: string;
  deck: MachineDeckId;
  /** Normalized machine-space coordinates, clamped to 0..1. */
  x: number;
  z: number;
  detail?: string;
  condition?: number;
  reachable: boolean;
  task?: { label: string; blockedReason?: string };
  pin?: MachineOperationsPin;
}

export interface MachineOperationsDeck {
  readonly id: MachineDeckId;
  readonly label: string;
  readonly nodes: readonly MachineOperationsNode[];
}

export interface MachineOperationsView {
  readonly decks: readonly MachineOperationsDeck[];
  readonly pin: MachineOperationsPin | null;
  readonly pinnedNode: MachineOperationsNode | null;
  readonly pinnedTask: MachineOperationsPin | null;
  readonly caretakerPriority: CaretakerPriority;
  readonly caretakerWork: CaretakerWorkResult;
  readonly caretaker: {
    readonly recruited: boolean;
    readonly mode: CaretakerMode;
    readonly priority: CaretakerPriority;
    readonly phase: CaretakerJobPhase;
    readonly decision: CaretakerWorkResult;
    readonly globalBlock?: OperationsGlobalBlock;
  };
}

export interface MachineOperationsSubsystemState {
  id: SubsystemId;
  health: number;
}

export interface MachineOperationsLocation {
  readonly id: string;
  readonly deck: MachineDeckId;
  readonly x: number;
  readonly z: number;
}
export interface MachineOperationsRepairAnchor extends MachineOperationsLocation {
  readonly id: SubsystemId;
}

export interface MachineOperationsProjectionInput {
  readonly structures?: readonly BuildPieceInstance[];
  readonly subsystems?: readonly MachineOperationsSubsystemState[];
  readonly work?: CaretakerWorkSnapshot;
  readonly caretakerPriority?: CaretakerPriority;
  readonly pinnedTask?: MachineOperationsPin | null;
  readonly caretaker?: CaretakerSnapshot;
  readonly globalBlock?: OperationsGlobalBlock;
  /** Explicit live coordinates for work items without a corresponding build cell. */
  readonly locations?: readonly MachineOperationsLocation[];
  /** Authored repair anchors, when Game supplies them. */
  readonly repairAnchors?: readonly MachineOperationsRepairAnchor[];
}
export type MachineOperationsInput = MachineOperationsProjectionInput;

const labels: Record<MachineDeckId, string> = {
  lower: 'Lower deck',
  middle: 'Middle deck',
  upper: 'Upper deck',
};
const kindRank: Record<MachineOperationsNodeKind, number> = {
  subsystem: 0,
  equipment: 1,
  storage: 2,
  producer: 3,
  garden: 4,
};

function deckForLevel(level: number): MachineDeckId {
  if (level <= -2) return 'lower';
  if (level === -1) return 'middle';
  return 'upper';
}
function deckForY(y: number): MachineDeckId {
  const nominalDeckHeight = DECK_SURFACE_Y - DECK_PLATE_HALF;
  return deckForLevel(Math.round((y - nominalDeckHeight) / LEVEL_HEIGHT));
}
function point(x: number, z: number): { x: number; z: number } {
  const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
  return {
    x: clamp(x / (MACHINE_TILES_X * 2) + 0.5),
    z: clamp(z / (MACHINE_TILES_Z * 2) + 0.5),
  };
}
function structurePoint(piece: BuildPieceInstance): { x: number; z: number } {
  return point(piece.cell.x * 2, piece.cell.z * 2);
}
function subsystemPoint(id: SubsystemId): { x: number; z: number } {
  const at = SUBSYSTEMS[id].repairAt;
  return point(at.x, at.z);
}
function itemLabel(itemId: string): string {
  return ITEMS[itemId as keyof typeof ITEMS]?.name ?? 'Item';
}
function detailForStructure(piece: BuildPieceInstance): string | undefined {
  const slots = piece.state?.slots;
  if (!Array.isArray(slots)) return undefined;
  const contents = slots.filter(
    (slot): slot is { itemId: string; count: number } =>
      !!slot &&
      typeof slot === 'object' &&
      typeof (slot as { itemId?: unknown }).itemId === 'string' &&
      typeof (slot as { count?: unknown }).count === 'number',
  );
  return contents.length
    ? contents.map((slot) => `${itemLabel(slot.itemId)} ×${slot.count}`).join(' · ')
    : 'Empty';
}

/** Projects live machine data into stable, render-agnostic operation decks. */
export function projectMachineOperations(
  input: MachineOperationsProjectionInput = {},
): MachineOperationsView {
  const structures = [...(input.structures ?? [])].sort((a, b) =>
    a.instanceId.localeCompare(b.instanceId),
  );
  const byId = new Map(structures.map((piece) => [piece.instanceId, piece]));
  const locations = new Map((input.locations ?? []).map((location) => [location.id, location]));
  const nodes: MachineOperationsNode[] = [];
  const nodeByStructure = new Map<string, MachineOperationsNode>();
  const add = (node: MachineOperationsNode) => nodes.push(node);
  const subsystemState = new Map((input.subsystems ?? []).map((state) => [state.id, state.health]));

  for (const id of (Object.keys(SUBSYSTEMS) as SubsystemId[]).sort()) {
    const state = subsystemState.get(id);
    if (state !== undefined && state >= SUBSYSTEMS[id].maxHealth) continue;
    const anchor = input.repairAnchors?.find((candidate) => candidate.id === id);
    const position = anchor ? { x: anchor.x, z: anchor.z } : subsystemPoint(id);
    const node: MachineOperationsNode = {
      id,
      source: { kind: 'subsystem', id },
      kind: 'subsystem',
      label: SUBSYSTEMS[id].name,
      deck: anchor?.deck ?? deckForY(SUBSYSTEMS[id].repairAt.y),
      ...position,
      detail: state === undefined ? 'Service panel' : `Health ${Math.max(0, Math.round(state))}`,
      condition:
        state === undefined
          ? undefined
          : Math.max(0, Math.min(1, state / SUBSYSTEMS[id].maxHealth)),
      reachable: true,
      pin: { kind: 'subsystem', id },
    };
    add(node);
  }

  for (const piece of structures) {
    const definition = BUILD_PIECES[piece.definitionId as PieceId];
    if (!definition || (definition.category !== 'station' && definition.category !== 'automation'))
      continue;
    const node: MachineOperationsNode = {
      id: piece.instanceId,
      source: { kind: 'structure', id: piece.instanceId },
      kind: 'equipment',
      label: definition.name,
      deck: deckForLevel(piece.cell.y),
      ...structurePoint(piece),
      detail: detailForStructure(piece),
      condition: definition.maxHealth
        ? Math.max(0, Math.min(1, piece.health / definition.maxHealth))
        : undefined,
      reachable: true,
      pin: { kind: 'structure', id: piece.instanceId },
    };
    add(node);
    nodeByStructure.set(piece.instanceId, node);
  }

  const work = input.work;
  const locate = (id: string): { deck: MachineDeckId; x: number; z: number } | null => {
    const piece = byId.get(id);
    if (piece) return { deck: deckForLevel(piece.cell.y), ...structurePoint(piece) };
    const location = locations.get(id);
    return location ? { deck: location.deck, x: location.x, z: location.z } : null;
  };
  const appendWork = (
    id: string,
    detail: string,
    reachable: boolean,
    label: string,
    kind: MachineOperationsNodeKind,
  ) => {
    const at = locate(id);
    if (!at) return;
    const existing = nodeByStructure.get(id);
    if (existing) {
      existing.detail = [existing.detail, detail].filter(Boolean).join(' · ');
      existing.reachable = reachable;
      return;
    }
    const node: MachineOperationsNode = {
      id,
      source: { kind: 'structure', id },
      kind,
      label,
      ...at,
      detail,
      reachable,
      pin: { kind: 'structure', id },
    };
    add(node);
    nodeByStructure.set(id, node);
  };
  for (const crate of [...(work?.crates ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    const detail = crate.items.length
      ? crate.items.map((item) => `${itemLabel(item.itemId)} ×${item.count}`).join(' · ')
      : 'Empty';
    appendWork(crate.id, `Storage: ${detail}`, crate.reachable, 'Storage', 'storage');
  }
  for (const producer of [...(work?.producers ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    if (producer.output.count <= 0) continue;
    appendWork(
      producer.id,
      `Output: ${itemLabel(producer.output.itemId)} ×${producer.output.count}`,
      producer.reachable,
      'Output station',
      'producer',
    );
  }
  for (const garden of [...(work?.gardens ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    if (garden.water >= 2) continue;
    appendWork(
      garden.id,
      `Garden water: ${garden.water}`,
      garden.reachable,
      'Seed garden',
      'garden',
    );
  }

  const decks = MACHINE_DECKS.map((id) => ({
    id,
    label: labels[id],
    nodes: nodes
      .filter((node) => node.deck === id)
      .sort(
        (a, b) =>
          a.z - b.z || a.x - b.x || kindRank[a.kind] - kindRank[b.kind] || a.id.localeCompare(b.id),
      ),
  }));
  const requestedPriority = input.caretakerPriority ?? input.caretaker?.priority;
  const priority: CaretakerPriority =
    requestedPriority === 'gardens' || requestedPriority === 'outputs' ? requestedPriority : 'auto';
  const caretakerWork = evaluateCaretakerWork(
    input.work ?? { crates: [], producers: [], gardens: [] },
    priority,
  );
  const taskNode =
    caretakerWork.kind === 'ready'
      ? caretakerWork.job.kind === 'water-garden'
        ? { id: caretakerWork.job.targetId, task: { label: 'Water garden' } }
        : { id: caretakerWork.job.sourceId, task: { label: 'Store output' } }
      : caretakerWork.kind === 'blocked' && caretakerWork.nodeId
        ? {
            id: caretakerWork.nodeId,
            task: { label: 'Caretaker work', blockedReason: caretakerWork.reason },
          }
        : null;
  if (taskNode) {
    const node = nodes.find(
      (candidate) => candidate.id === taskNode.id || candidate.source.id === taskNode.id,
    );
    if (node) Object.assign(node, { task: taskNode.task });
  }
  const projectedNodes = decks.flatMap((deck) => deck.nodes);
  const pin =
    input.pinnedTask &&
    projectedNodes.some(
      (node) =>
        node.source.kind === input.pinnedTask!.kind && node.source.id === input.pinnedTask!.id,
    )
      ? { ...input.pinnedTask }
      : null;
  const pinnedNode = pin
    ? (projectedNodes.find((node) => node.source.kind === pin.kind && node.source.id === pin.id) ??
      null)
    : null;
  const caretaker = input.caretaker ?? {
    recruited: false,
    mode: 'companion' as const,
    phase: 'idle' as const,
    job: null,
    token: null,
    serviceRemainingS: 0,
    refusal: null,
    priority,
  };
  return {
    decks,
    pin,
    pinnedNode,
    pinnedTask: pin,
    caretakerPriority: priority,
    caretakerWork,
    caretaker: {
      recruited: caretaker.recruited,
      mode: caretaker.mode,
      priority,
      phase: caretaker.phase,
      decision: caretakerWork,
      globalBlock: input.globalBlock,
    },
  };
}
