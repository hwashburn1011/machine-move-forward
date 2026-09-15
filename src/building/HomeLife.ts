import type { Cell } from './BuildGrid';
import type { RoomGraph } from './RoomDetector';

/** The small immutable portion of a placed piece needed by HomeLife. */
export interface HomeLifePiece {
  readonly instanceId: string;
  readonly definitionId: string;
  readonly cell: Cell;
}

export interface HomeLifeRestContext {
  readonly chairId: string;
  readonly playerCell: Cell;
  readonly sameRoom: boolean;
  readonly rangeM: number;
  readonly alive: boolean;
  readonly health: number;
  readonly maxHealth: number;
  readonly safe: boolean;
  readonly busy: boolean;
  readonly moving: boolean;
  readonly firing: boolean;
}

export type HomeLifeCancelReason =
  | 'chair-missing'
  | 'room-not-enclosed'
  | 'no-comfort'
  | 'out-of-range'
  | 'unsafe'
  | 'busy'
  | 'moving'
  | 'firing'
  | 'dead'
  | 'full-health';

export type HomeLifeTick =
  | { readonly healAmount: number; readonly cancelReason?: undefined }
  | { readonly healAmount: 0; readonly cancelReason: HomeLifeCancelReason };

export interface KeepsakeState {
  readonly factId?: string;
}

const MAX_ID_LENGTH = 128;
const REST_RATE_HP_PER_SECOND = 2;
const REST_RANGE_M = 2.8;

/** Returns only a known, bounded keepsake fact from untrusted saved state. */
export function sanitizeKeepsakeState(
  raw: unknown,
  knownChoices: readonly string[],
): Readonly<KeepsakeState> {
  if (!raw || typeof raw !== 'object') return Object.freeze({});
  const factId = (raw as { factId?: unknown }).factId;
  if (
    typeof factId !== 'string' ||
    factId.length === 0 ||
    factId.length > MAX_ID_LENGTH ||
    !knownChoices.some((choice) => choice === factId)
  )
    return Object.freeze({});
  return Object.freeze({ factId });
}

function key(cell: Cell): string {
  return `${cell.x},${cell.y},${cell.z}`;
}

/** Pure rest and comfort rules. Player stats and nourishment remain external. */
export class HomeLife {
  private chairId: string | null = null;

  constructor(
    private graph: RoomGraph,
    private pieces: readonly HomeLifePiece[],
  ) {}

  /** Replace the live layout after a build, relocation, or destruction. */
  updateLayout(graph: RoomGraph, pieces: readonly HomeLifePiece[]): void {
    this.graph = graph;
    this.pieces = pieces;
    if (
      this.chairId !== null &&
      !this.pieces.some(
        (piece) => piece.instanceId === this.chairId && piece.definitionId === 'chair',
      )
    )
      this.chairId = null;
  }

  inspect(chairId: string, context: HomeLifeRestContext): HomeLifeCancelReason | null {
    return this.reason(chairId, context);
  }

  get activeChairId(): string | null {
    return this.chairId;
  }

  start(
    chairId: string,
    context: HomeLifeRestContext,
  ): { ok: true } | { ok: false; reason: HomeLifeCancelReason } {
    const reason = this.reason(chairId, context);
    if (reason) {
      this.chairId = null;
      return { ok: false, reason };
    }
    this.chairId = chairId;
    return { ok: true };
  }

  tick(dt: number, context: HomeLifeRestContext): HomeLifeTick {
    if (this.chairId === null) return { healAmount: 0, cancelReason: 'chair-missing' };
    const reason = this.reason(this.chairId, context);
    if (reason) {
      this.chairId = null;
      return { healAmount: 0, cancelReason: reason };
    }
    if (!Number.isFinite(dt) || dt <= 0) return { healAmount: 0 };
    // Return the raw restorative effect. The authoritative PlayerStats.heal
    // applies nourishment scaling and the final health cap exactly once.
    return { healAmount: dt * REST_RATE_HP_PER_SECOND };
  }

  cancel(): void {
    this.chairId = null;
  }

  get active(): boolean {
    return this.chairId !== null;
  }

  private reason(chairId: string, context: HomeLifeRestContext): HomeLifeCancelReason | null {
    const chair = this.pieces.find(
      (piece) => piece.instanceId === chairId && piece.definitionId === 'chair',
    );
    if (!chair) return 'chair-missing';
    const roomId = this.graph.byCell.get(key(chair.cell));
    const room =
      roomId === undefined
        ? undefined
        : this.graph.rooms.find((candidate) => candidate.id === roomId);
    const playerRoomId = this.graph.byCell.get(key(context.playerCell));
    if (!room?.enclosed || playerRoomId !== roomId) return 'room-not-enclosed';
    const comfortable = this.pieces.some(
      (piece) =>
        (piece.definitionId === 'table' || piece.definitionId === 'rug') &&
        this.graph.byCell.get(key(piece.cell)) === roomId,
    );
    if (!comfortable) return 'no-comfort';
    if (!Number.isFinite(context.rangeM) || context.rangeM > REST_RANGE_M || context.rangeM < 0)
      return 'out-of-range';
    if (!context.alive) return 'dead';
    if (!context.safe) return 'unsafe';
    if (context.busy) return 'busy';
    if (context.moving) return 'moving';
    if (context.firing) return 'firing';
    if (
      !Number.isFinite(context.health) ||
      !Number.isFinite(context.maxHealth) ||
      context.health >= context.maxHealth
    )
      return 'full-health';
    return null;
  }
}
