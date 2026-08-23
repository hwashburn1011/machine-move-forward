import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import type { Machine } from '@/machine/Machine';
import type { Resources } from '@/progression/Resources';
import { BUILD_PIECES, type PieceId } from '@/data/build-pieces';
import {
  BuildGrid,
  cellCenter,
  cellKey,
  cellsOfEdge,
  edgeCenter,
  edgeKey,
  neighbour,
  SIDES,
  type Cell,
  type Edge,
} from './BuildGrid';
import {
  stairsCells,
  validatePlacement,
  type Placement,
  type Validation,
} from './BuildValidation';
import { countEnclosed, detectRooms, type RoomGraph } from './RoomDetector';
import { buildPieceGeometry, pieceColliders, pieceMaterial } from './BuildPieceGeometry';

export interface BuildPieceInstance {
  instanceId: string;
  definitionId: PieceId;
  cell: Cell;
  edge?: Edge;
  rotation: number;
  health: number;
}

interface LiveInstance {
  data: BuildPieceInstance;
  mesh: THREE.Mesh;
  colliders: RAPIER.Collider[];
}

/**
 * Owns everything the player builds.
 *
 * Binds the pure grid, validation, and room modules to meshes, colliders,
 * machine weight, and events. Rooms are recomputed once per operation, after
 * any cascade completes — not once per affected piece.
 */
export class BuildSystem {
  readonly group = new THREE.Group();

  private readonly grid = new BuildGrid<PieceId>();
  private readonly instances = new Map<string, LiveInstance>();
  /** Grid key -> instance id, so demolition can find what is at a location. */
  private readonly cellOwner = new Map<string, string>();
  private readonly roofOwner = new Map<string, string>();
  private readonly edgeOwner = new Map<string, string>();

  private graph: RoomGraph = { rooms: [], byCell: new Map(), links: [] };
  private nextId = 0;
  private weight = 0;

  constructor(
    scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly bus: EventBus,
    private readonly materials: Materials,
    private readonly machine: Machine,
    private readonly resources: Resources,
  ) {
    this.group.name = 'built-structures';
    scene.add(this.group);

    for (const cell of machine.equipmentCells) this.grid.blockCell(cell);
    this.recomputeRooms();
  }

  get rooms(): RoomGraph {
    return this.graph;
  }

  get pieceCount(): number {
    return this.instances.size;
  }

  get totalWeight(): number {
    return this.weight;
  }

  /** Read-only view, for the preview's validation. */
  get gridView(): BuildGrid<PieceId> {
    return this.grid;
  }

  canPlace(placement: Placement): Validation {
    return validatePlacement(this.grid, placement, this.resources.scrap);
  }

  /**
   * Place a piece. Returns the instance, or null if placement was refused.
   * `free` skips cost checking and deduction — used when replaying a save.
   */
  place(placement: Placement, free = false): BuildPieceInstance | null {
    const def = BUILD_PIECES[placement.piece];
    const validation = validatePlacement(
      this.grid,
      placement,
      free ? Number.POSITIVE_INFINITY : this.resources.scrap,
    );
    if (!validation.ok) return null;

    if (!free && !this.resources.spend(def.cost)) return null;

    const data: BuildPieceInstance = {
      instanceId: `bp-${this.nextId++}`,
      definitionId: placement.piece,
      cell: { ...placement.cell },
      edge: placement.edge ? { ...placement.edge } : undefined,
      rotation: placement.rotation,
      health: def.maxHealth,
    };

    this.occupy(data);
    this.instances.set(data.instanceId, {
      data,
      mesh: this.createMesh(data),
      colliders: this.createColliders(data),
    });

    this.weight += def.weight;
    this.machine.movement.totalWeight += def.weight;

    this.bus.emit('build:placed', {
      instanceId: data.instanceId,
      definitionId: data.definitionId,
      scrapSpent: free ? 0 : def.cost,
    });
    this.recomputeRooms();

    return data;
  }

  /** Demolish whatever a placement targets. Returns total scrap refunded. */
  demolishAt(placement: Placement): number {
    const id = this.idAt(placement);
    if (!id) return 0;

    const refunded = this.removeCascade(id);
    if (refunded > 0) this.recomputeRooms();
    return refunded;
  }

  /**
   * Remove a piece and anything that depended on it.
   *
   * Pulling a floor must take its roof and any edge piece left with a floor on
   * neither side, or the player is left with walls hanging in mid-air.
   */
  private removeCascade(rootId: string): number {
    let refunded = this.removeOne(rootId);
    if (refunded < 0) return 0;

    // Iterate to a fixed point: removing an orphaned wall can orphan nothing
    // else today, but the loop keeps the rule honest as pieces are added.
    for (;;) {
      const orphan = this.findOrphan();
      if (!orphan) break;
      const amount = this.removeOne(orphan);
      if (amount < 0) break;
      refunded += amount;
    }

    return refunded;
  }

  private findOrphan(): string | null {
    for (const [, live] of this.instances) {
      const { data } = live;

      if (data.definitionId === 'roof' && this.grid.getCell(data.cell) !== 'floor') {
        return data.instanceId;
      }

      if (data.edge) {
        const [a, b] = cellsOfEdge(data.edge);
        if (this.grid.getCell(a) !== 'floor' && this.grid.getCell(b) !== 'floor') {
          return data.instanceId;
        }
      }

      // Stairs are stored in their run cell, but they depend on the floor in
      // their base cell — which is the cell the placement was anchored to.
      if (data.definitionId === 'stairs' && this.grid.getCell(data.cell) !== 'floor') {
        return data.instanceId;
      }
    }
    return null;
  }

  /** Remove one instance. Returns refund, or -1 if it did not exist. */
  private removeOne(id: string): number {
    const live = this.instances.get(id);
    if (!live) return -1;

    const def = BUILD_PIECES[live.data.definitionId];

    this.vacate(live.data);
    for (const collider of live.colliders) this.physics.removeCollider(collider);
    this.group.remove(live.mesh);
    this.instances.delete(id);

    this.weight -= def.weight;
    this.machine.movement.totalWeight -= def.weight;

    const refunded = this.resources.refund(def.cost);
    this.bus.emit('build:removed', {
      instanceId: id,
      definitionId: live.data.definitionId,
      scrapRefunded: refunded,
    });
    return refunded;
  }

  /** Which instance a placement would target for demolition. */
  private idAt(placement: Placement): string | undefined {
    if (placement.edge) return this.edgeOwner.get(edgeKey(placement.edge));
    // Prefer the roof: it is on top, so it is what the player is looking at.
    return (
      this.roofOwner.get(cellKey(placement.cell)) ?? this.cellOwner.get(cellKey(placement.cell))
    );
  }

  private occupy(data: BuildPieceInstance): void {
    if (data.edge) {
      this.grid.setEdge(data.edge, data.definitionId);
      this.edgeOwner.set(edgeKey(data.edge), data.instanceId);
      return;
    }
    if (data.definitionId === 'roof') {
      this.grid.setRoof(data.cell, 'roof');
      this.roofOwner.set(cellKey(data.cell), data.instanceId);
      return;
    }
    if (data.definitionId === 'stairs') {
      const { run } = stairsCells(data.cell, data.rotation);
      this.grid.setCell(run, 'stairs');
      this.cellOwner.set(cellKey(run), data.instanceId);
      return;
    }
    this.grid.setCell(data.cell, data.definitionId);
    this.cellOwner.set(cellKey(data.cell), data.instanceId);
  }

  private vacate(data: BuildPieceInstance): void {
    if (data.edge) {
      this.grid.clearEdge(data.edge);
      this.edgeOwner.delete(edgeKey(data.edge));
      return;
    }
    if (data.definitionId === 'roof') {
      this.grid.clearRoof(data.cell);
      this.roofOwner.delete(cellKey(data.cell));
      return;
    }
    if (data.definitionId === 'stairs') {
      const { run } = stairsCells(data.cell, data.rotation);
      this.grid.clearCell(run);
      this.cellOwner.delete(cellKey(run));
      return;
    }
    this.grid.clearCell(data.cell);
    this.cellOwner.delete(cellKey(data.cell));
  }

  // -------------------------------------------------------------------------
  // Rendering and physics
  // -------------------------------------------------------------------------

  /** World transform for a piece, shared by the real mesh and the ghost. */
  static transformFor(
    piece: PieceId,
    cell: Cell,
    edge: Edge | undefined,
    rotation: number,
  ): { position: THREE.Vector3; rotationY: number } {
    if (edge) {
      const c = edgeCenter(edge);
      return {
        position: new THREE.Vector3(c.x, c.y, c.z),
        // An 'x' edge separates cells side by side, so the panel faces along X.
        rotationY: edge.axis === 'x' ? Math.PI / 2 : 0,
      };
    }

    if (piece === 'stairs') {
      const { base, run } = stairsCells(cell, rotation);
      const a = cellCenter(base);
      const b = cellCenter(run);
      return {
        position: new THREE.Vector3((a.x + b.x) / 2, a.y, (a.z + b.z) / 2),
        rotationY: rotation * (Math.PI / 2),
      };
    }

    const c = cellCenter(cell);
    return { position: new THREE.Vector3(c.x, c.y, c.z), rotationY: 0 };
  }

  private createMesh(data: BuildPieceInstance): THREE.Mesh {
    const { position, rotationY } = BuildSystem.transformFor(
      data.definitionId,
      data.cell,
      data.edge,
      data.rotation,
    );

    const mesh = new THREE.Mesh(
      buildPieceGeometry(data.definitionId),
      pieceMaterial(data.definitionId, this.materials),
    );
    mesh.position.copy(position);
    mesh.rotation.y = rotationY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = data.instanceId;
    this.group.add(mesh);
    return mesh;
  }

  private createColliders(data: BuildPieceInstance): RAPIER.Collider[] {
    const { position, rotationY } = BuildSystem.transformFor(
      data.definitionId,
      data.cell,
      data.edge,
      data.rotation,
    );

    const out: RAPIER.Collider[] = [];
    const offset = new THREE.Vector3();

    for (const spec of pieceColliders(data.definitionId)) {
      offset.copy(spec.offset).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
      const center = position.clone().add(offset);

      // Rotated shapes (the stair ramp) need a quaternion, so they take the
      // general path; everything else is an axis-aligned box.
      const collider =
        spec.rotX !== undefined
          ? this.physics.addFixedBoxRotated(
              spec.half,
              center,
              new THREE.Quaternion().setFromEuler(new THREE.Euler(spec.rotX, rotationY, 0)),
              { kind: 'machine' },
            )
          : this.physics.addFixedBox(spec.half, center, rotationY, { kind: 'machine' });

      out.push(collider);
    }

    return out;
  }

  private recomputeRooms(): void {
    this.graph = detectRooms(this.grid);
    this.bus.emit('build:rooms-changed', {
      roomCount: this.graph.rooms.length,
      enclosedCount: countEnclosed(this.graph),
    });
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  serialise(): BuildPieceInstance[] {
    return [...this.instances.values()].map((live) => ({
      ...live.data,
      cell: { ...live.data.cell },
      edge: live.data.edge ? { ...live.data.edge } : undefined,
    }));
  }

  /**
   * Rebuild from saved data.
   *
   * Replays through the same placement path used at runtime, so a save can
   * never reconstruct a structure the live rules would reject. Order matters:
   * floors must land before the walls and roofs that depend on them.
   */
  restore(pieces: BuildPieceInstance[]): void {
    this.clear();

    const rank: Record<PieceId, number> = {
      floor: 0,
      stairs: 1,
      wall: 2,
      doorway: 2,
      railing: 2,
      roof: 3,
    };
    const ordered = [...pieces].sort(
      (a, b) => a.cell.y - b.cell.y || rank[a.definitionId] - rank[b.definitionId],
    );

    for (const piece of ordered) {
      this.place(
        {
          piece: piece.definitionId,
          cell: piece.cell,
          edge: piece.edge,
          rotation: piece.rotation,
        },
        true,
      );
    }
  }

  clear(): void {
    for (const id of [...this.instances.keys()]) {
      const live = this.instances.get(id);
      if (!live) continue;
      for (const collider of live.colliders) this.physics.removeCollider(collider);
      this.group.remove(live.mesh);
    }
    this.instances.clear();
    this.cellOwner.clear();
    this.roofOwner.clear();
    this.edgeOwner.clear();
    this.grid.clear();

    this.machine.movement.totalWeight -= this.weight;
    this.weight = 0;

    this.recomputeRooms();
  }

  /** Cells reachable on foot from a level, for later navmesh work. */
  neighbouringCells(cell: Cell): Cell[] {
    return SIDES.map((s) => neighbour(cell, s)).filter(
      (n) => this.grid.getCell(n) === 'floor',
    );
  }
}
