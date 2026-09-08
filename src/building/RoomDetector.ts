import { BUILD_PIECES, type PieceId } from '@/data/build-pieces';
import { GRID_TILE, LEVEL_HEIGHT } from '@/game/constants';
import {
  BuildGrid,
  canonicalEdge,
  cellKey,
  edgeKey,
  neighbour,
  SIDES,
  type Cell,
  type Edge,
} from './BuildGrid';

/**
 * Room detection (handoff section 11).
 *
 * Pure flood fill plus an enclosure test. This is where Milestone 3's
 * acceptance criterion actually lives, so it carries no rendering or physics
 * dependency and is exhaustively testable in node.
 */

export interface Room {
  id: number;
  level: number;
  cells: Cell[];
  /** Cubic metres. */
  interiorVolume: number;
  enclosed: boolean;
  /** Edges separating this room from anything that is not this room. */
  boundaryEdges: Edge[];
  /** The subset of boundary edges that are doorways. */
  doorways: Edge[];
}

export interface RoomLink {
  doorway: Edge;
  rooms: [number, number];
}

export interface RoomGraph {
  rooms: Room[];
  /** cellKey -> room id. */
  byCell: Map<string, number>;
  links: RoomLink[];
}

/** Does this piece form a room boundary? Railings deliberately do not. */
function bounds(piece: PieceId | undefined): boolean {
  return piece !== undefined && BUILD_PIECES[piece].boundsRoom;
}

export function detectRooms(grid: BuildGrid<PieceId>): RoomGraph {
  const floors = grid
    .cellEntries()
    .filter((e) => e.value === 'floor')
    // Sorted so room ids are stable across runs rather than depending on Map
    // insertion order. Callers compare room counts across frames.
    .sort((a, b) => cellKey(a.cell).localeCompare(cellKey(b.cell)));

  const byCell = new Map<string, number>();
  const rooms: Room[] = [];

  for (const entry of floors) {
    if (byCell.has(cellKey(entry.cell))) continue;
    const room = floodFill(grid, entry.cell, rooms.length, byCell);
    rooms.push(room);
  }

  for (const room of rooms) {
    room.enclosed = isEnclosed(grid, room, byCell);
  }

  return { rooms, byCell, links: buildLinks(grid, rooms, byCell) };
}

function floodFill(
  grid: BuildGrid<PieceId>,
  start: Cell,
  id: number,
  byCell: Map<string, number>,
): Room {
  const cells: Cell[] = [];
  const queue: Cell[] = [start];
  byCell.set(cellKey(start), id);

  while (queue.length > 0) {
    const cell = queue.pop() as Cell;
    cells.push(cell);

    for (const side of SIDES) {
      const next = neighbour(cell, side);
      const key = cellKey(next);
      if (byCell.has(key)) continue;
      if (grid.getCell(next) !== 'floor') continue;
      // A wall or doorway between the two stops the fill; a railing does not.
      if (bounds(grid.getEdge(canonicalEdge(cell, side)))) continue;

      byCell.set(key, id);
      queue.push(next);
    }
  }

  const boundaryEdges: Edge[] = [];
  const doorways: Edge[] = [];
  const seen = new Set<string>();

  for (const cell of cells) {
    for (const side of SIDES) {
      const next = neighbour(cell, side);
      // An edge is a boundary when the far side is not part of this room —
      // which includes edges facing the void, not just edges facing another
      // floored cell.
      if (byCell.get(cellKey(next)) === id) continue;

      const edge = canonicalEdge(cell, side);
      const key = edgeKey(edge);
      if (seen.has(key)) continue;
      seen.add(key);

      boundaryEdges.push(edge);
      if (grid.getEdge(edge) === 'doorway') doorways.push(edge);
    }
  }

  return {
    id,
    level: start.y,
    cells,
    interiorVolume: cells.length * GRID_TILE * GRID_TILE * LEVEL_HEIGHT,
    enclosed: false,
    boundaryEdges,
    doorways,
  };
}

function isEnclosed(
  grid: BuildGrid<PieceId>,
  room: Room,
  byCell: Map<string, number>,
): boolean {
  for (const cell of room.cells) {
    for (const side of SIDES) {
      const next = neighbour(cell, side);
      if (byCell.get(cellKey(next)) === room.id) continue;

      // Every boundary edge needs a room-bounding piece. A railing here is not
      // enough: a railed platform is fenced, not enclosed.
      if (!bounds(grid.getEdge(canonicalEdge(cell, side)))) return false;
    }

    // A ceiling is either a roof panel or the floor of the storey above.
    const above: Cell = { x: cell.x, y: cell.y + 1, z: cell.z };
    if (!grid.hasRoof(cell) && grid.getCell(above) !== 'floor') return false;
  }

  return true;
}

function buildLinks(
  grid: BuildGrid<PieceId>,
  rooms: Room[],
  byCell: Map<string, number>,
): RoomLink[] {
  const links: RoomLink[] = [];
  const seen = new Set<string>();

  for (const room of rooms) {
    for (const edge of room.doorways) {
      const key = edgeKey(edge);
      if (seen.has(key)) continue;

      const [a, b] = [
        { x: edge.x, y: edge.y, z: edge.z },
        edge.axis === 'x'
          ? { x: edge.x + 1, y: edge.y, z: edge.z }
          : { x: edge.x, y: edge.y, z: edge.z + 1 },
      ];

      const roomA = byCell.get(cellKey(a));
      const roomB = byCell.get(cellKey(b));
      // A doorway onto open air links nothing; only record real connections.
      if (roomA === undefined || roomB === undefined || roomA === roomB) continue;

      seen.add(key);
      links.push({ doorway: edge, rooms: [roomA, roomB] });
    }
  }

  void grid;
  return links;
}

export function countEnclosed(graph: RoomGraph): number {
  return graph.rooms.filter((r) => r.enclosed).length;
}

/**
 * Is this cell inside an ENCLOSED room?
 *
 * The question the interior audio duck asks every frame, and it lives here
 * rather than in the audio because "indoors" is a fact about the room model.
 * A cell in no room at all answers no, which is the common case — most of the
 * deck is open — so the lookup is one map hit and a boolean.
 *
 * Enclosed, not merely in a room: a railed platform is fenced, not sheltered,
 * and ducking the engine on one would tell the player they had walked inside
 * something when they had not.
 */
export function insideEnclosed(graph: RoomGraph, cell: Cell): boolean {
  const id = graph.byCell.get(cellKey(cell));
  if (id === undefined) return false;
  return graph.rooms[id]?.enclosed ?? false;
}
