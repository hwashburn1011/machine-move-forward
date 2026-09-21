import type { BuildPieceInstance } from '@/building/BuildSystem';
import type { ScannerSave } from '@/progression/ScannerSetup';
import { SCANNER_ACTIVE_SECONDS, SCANNER_SAFE_DELAY_SECONDS } from '@/progression/ScannerSetup';
import type { SaveGameV1, Vec3 } from './SaveSchema';

export const NOMAD_LAYOUT_V1 = 'iron-nomad-v1' as const;
export const NOMAD_LAYOUT_V2 = 'iron-nomad-v2' as const;
export const NOMAD_LAYOUT_V3 = 'iron-nomad-v3' as const;
export type NomadLayout = typeof NOMAD_LAYOUT_V1 | typeof NOMAD_LAYOUT_V2 | typeof NOMAD_LAYOUT_V3;

const V1_DECKS = [8.83, 11.83, 14.83] as const;
const V2_DECKS = [8.83, 12.43, 16.03] as const;

export interface NomadFoundationMigrationInput {
  /** Absent is the published pre-tag/v1 hull. Validation rejects every other value. */
  layout?: NomadLayout;
  /** Machine-local pose only. Game owns destination/opening coordinate selection. */
  playerPosition: Vec3;
  structures: readonly BuildPieceInstance[];
  recoveryPieces?: readonly BuildPieceInstance[];
}

export interface NomadFoundationMigrationResult {
  layout: typeof NOMAD_LAYOUT_V3;
  playerPosition: Vec3;
  structures: BuildPieceInstance[];
  recoveryPieces: BuildPieceInstance[];
  /** True exactly once for absent/v1 input. */
  migrated: boolean;
  /** Game should allow deterministic same-deck relocation on this restore. */
  relocateStructures: boolean;
}

function clonePieces(pieces: readonly BuildPieceInstance[] | undefined): BuildPieceInstance[] {
  return structuredClone([...(pieces ?? [])]);
}

/** Preserve relative height on the nearest authored deck while retaining local X/Z. */
export function remapNomadLocalPose(position: Vec3, sourceLayout?: NomadLayout): Vec3 {
  const source = sourceLayout ?? NOMAD_LAYOUT_V1;
  if (source === NOMAD_LAYOUT_V3) return { ...position };
  let deck = 0;
  for (let index = 1; index < V1_DECKS.length; index++)
    if (Math.abs(position.y - V1_DECKS[index]!) < Math.abs(position.y - V1_DECKS[deck]!))
      deck = index;
  if (source === NOMAD_LAYOUT_V2) return { ...position, y: position.y };
  return {
    x: position.x,
    y: V2_DECKS[deck]! + (position.y - V1_DECKS[deck]!),
    z: position.z,
  };
}

/**
 * Pure pre-restore projection. It never decides placement or mutates the source save.
 * Grid coordinates remain authoritative; BuildSystem performs bounded relocation.
 */
export function migrateNomadFoundation(
  input: NomadFoundationMigrationInput,
): NomadFoundationMigrationResult {
  const source = input.layout ?? NOMAD_LAYOUT_V1;
  const migrated = source !== NOMAD_LAYOUT_V3;
  return {
    layout: NOMAD_LAYOUT_V3,
    playerPosition: remapNomadLocalPose(input.playerPosition, source),
    structures: clonePieces(input.structures),
    recoveryPieces: clonePieces(input.recoveryPieces),
    migrated,
    relocateStructures: migrated,
  };
}

type OpeningAuthority = 'locked' | 'signal' | 'crossfire' | 'later';

function storyAuthority(save: SaveGameV1): OpeningAuthority {
  const story = save.world.story as unknown as Record<string, unknown> | undefined;
  if (!story) return 'locked';
  if (story.format === 2) {
    const completed = Array.isArray(story.completed) ? story.completed : [];
    const active = story.active as Record<string, unknown> | null | undefined;
    if (active?.expeditionId === 'wreck-one') {
      if (active.phase === 'signal' || active.phase === 'crossfire') return active.phase;
      return 'later';
    }
    return completed.includes('wreck-one') || active ? 'later' : 'locked';
  }
  if (story.phase === 'locked' || story.phase === 'signal' || story.phase === 'crossfire')
    return story.phase;
  return 'later';
}

function foundReceiver(save: SaveGameV1): boolean {
  return (save.progression.radio ?? save.progression.radioDrop)?.status === 'found';
}

function signalOrigin(save: SaveGameV1): number | undefined {
  const story = save.world.story as unknown as Record<string, unknown> | undefined;
  if (story?.format !== 2 || !story.active || typeof story.active !== 'object') return undefined;
  const origin = (story.active as Record<string, unknown>).signalStartedAt;
  return typeof origin === 'number' && Number.isFinite(origin) ? origin : undefined;
}

const consumedScanner = (): ScannerSave => ({
  format: 1,
  phase: 'consumed',
  elapsedS: SCANNER_ACTIVE_SECONDS,
  pendingDelayS: 0,
});

/**
 * Project an absent legacy scanner from durable Story. For current scanner saves, Story
 * remains authoritative over crossfire/later phases and the validated state is cloned.
 */
export function reconcileOpeningScanner(save: SaveGameV1): ScannerSave {
  const authority = storyAuthority(save);
  const current = save.progression.scanner;
  if (authority === 'later') return consumedScanner();
  if (authority === 'crossfire')
    return {
      format: 1,
      phase: 'contact-ready',
      elapsedS: SCANNER_ACTIVE_SECONDS,
      pendingDelayS: 0,
    };
  if (current) return structuredClone(current);
  // Saves older than the durable guide are mature campaigns even when they lack Story.
  if (!save.progression.firstRun) return consumedScanner();
  if (authority === 'signal') {
    const origin = signalOrigin(save);
    const raw = origin === undefined ? 0 : (save.distanceTraveled - origin) / 2200;
    const progress = Math.max(0, Math.min(1, raw));
    return progress >= 1
      ? {
          format: 1,
          phase: 'contact-ready',
          elapsedS: SCANNER_ACTIVE_SECONDS,
          pendingDelayS: SCANNER_SAFE_DELAY_SECONDS,
        }
      : {
          format: 1,
          phase: 'scanning',
          elapsedS: progress * SCANNER_ACTIVE_SECONDS,
          pendingDelayS: 0,
        };
  }
  return {
    format: 1,
    phase: foundReceiver(save) ? 'awaiting-module' : 'awaiting-receiver',
    elapsedS: 0,
    pendingDelayS: 0,
  };
}
