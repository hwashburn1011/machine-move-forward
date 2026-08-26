import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import type { Machine } from '@/machine/Machine';
import type { ResourceAccess, CrateRef } from '@/items/ResourceAccess';
import { Container } from '@/items/Container';
import {
  BUILD_PIECES,
  CRATE_SLOTS,
  isStation,
  REFUND_FRACTION,
  type PieceId,
} from '@/data/build-pieces';
import type { ItemCost, ItemId, ItemStack } from '@/data/items';
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
import { buildNavGraph, type FixedLink, type NavGraph } from '@/enemies/NavGraph';
import { buildPieceGeometry, pieceColliders, pieceMaterial } from './BuildPieceGeometry';

export interface BuildPieceInstance {
  instanceId: string;
  definitionId: PieceId;
  cell: Cell;
  edge?: Edge;
  rotation: number;
  health: number;
  /**
   * Per-instance payload. Reserved in the foundation pass; a storage crate
   * uses it to carry its contents through a save.
   */
  state?: Record<string, unknown>;
}

/** What a storage crate writes into `state`. */
export interface CrateState {
  slots: (ItemStack | null)[];
  /** `state` is an open bag, so this shape has to be assignable to it. */
  [key: string]: unknown;
}

/** A built station near the player, for the interaction system. */
export interface StationRef {
  instanceId: string;
  piece: PieceId;
  position: THREE.Vector3;
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
  private readonly stationOwner = new Map<string, string>();
  private readonly stairsOwner = new Map<string, string>();
  /** Contents of every built storage crate, keyed by instance id. */
  private readonly crateContainers = new Map<string, Container>();

  private graph: RoomGraph = { rooms: [], byCell: new Map(), links: [] };
  private nav: NavGraph = { links: new Map() };
  private nextId = 0;
  private weight = 0;

  constructor(
    scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly bus: EventBus,
    private readonly materials: Materials,
    private readonly machine: Machine,
    private readonly resources: ResourceAccess,
  ) {
    this.group.name = 'built-structures';
    scene.add(this.group);

    for (const cell of machine.equipmentCells) this.grid.blockCell(cell);
    this.recomputeRooms();
  }

  get rooms(): RoomGraph {
    return this.graph;
  }

  /** The graph enemies path over. Rebuilt with the rooms. */
  get navGraph(): NavGraph {
    return this.nav;
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
    return validatePlacement(this.grid, placement, this.affordable);
  }

  /** Bound once, so the validator gets a stable predicate rather than a fresh closure. */
  private readonly affordable = (cost: ItemCost): boolean => this.resources.canAfford(cost);

  /**
   * Place a piece. Returns the instance, or null if placement was refused.
   * `free` skips cost checking and deduction — used when replaying a save.
   */
  place(placement: Placement, free = false): BuildPieceInstance | null {
    const def = BUILD_PIECES[placement.piece];
    const validation = validatePlacement(
      this.grid,
      placement,
      free ? () => true : this.affordable,
    );
    if (!validation.ok) return null;

    if (!free && !this.resources.consume(def.cost)) return null;

    const data: BuildPieceInstance = {
      instanceId: `bp-${this.nextId++}`,
      definitionId: placement.piece,
      cell: { ...placement.cell },
      edge: placement.edge ? { ...placement.edge } : undefined,
      rotation: placement.rotation,
      health: def.maxHealth,
    };

    this.occupy(data);
    if (data.definitionId === 'crate') {
      this.crateContainers.set(data.instanceId, new Container(CRATE_SLOTS));
    }
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
      cost: free ? {} : def.cost,
    });
    this.recomputeRooms();

    return data;
  }

  /** Demolish whatever a placement targets. Returns total units refunded. */
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

      // A station stands on a floor. Pull the floor and the station goes with
      // it, rather than being left hovering over open deck.
      if (isStation(data.definitionId) && this.grid.getCell(data.cell) !== 'floor') {
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

    // Empty the crate BEFORE it stops being a deposit target, or part of the
    // contents lands straight back in the crate being destroyed.
    this.emptyCrate(id);

    this.vacate(live.data);
    for (const collider of live.colliders) this.physics.removeCollider(collider);
    this.group.remove(live.mesh);
    this.instances.delete(id);

    this.weight -= def.weight;
    this.machine.movement.totalWeight -= def.weight;

    const refunded = this.refund(def.cost);
    this.bus.emit('build:removed', {
      instanceId: id,
      definitionId: live.data.definitionId,
      refunded,
    });
    return refunded;
  }

  /**
   * Pay back 60% of every item in a cost, floored per item.
   *
   * Overflow that will not fit anywhere is dropped rather than blocking the
   * demolition: a player who cannot carry the refund should still be able to
   * tear the wall down.
   */
  private refund(cost: ItemCost): number {
    let total = 0;
    for (const [itemId, needed] of Object.entries(cost) as [ItemId, number][]) {
      const amount = Math.floor(Math.max(0, needed) * REFUND_FRACTION);
      if (amount <= 0) continue;
      total += amount - this.resources.deposit(itemId, amount);
    }
    return total;
  }

  /** Hand a demolished crate's contents back. Anything that will not fit is dropped. */
  private emptyCrate(id: string): void {
    const container = this.crateContainers.get(id);
    if (!container) return;
    // Deregister first, so `deposit` cannot route items back into this crate.
    this.crateContainers.delete(id);
    for (const slot of container.slots) {
      if (slot) this.resources.deposit(slot.itemId, slot.count);
    }
    container.clear();
  }

  /** Which instance a placement would target for demolition. */
  private idAt(placement: Placement): string | undefined {
    if (placement.edge) return this.edgeOwner.get(edgeKey(placement.edge));
    // Station, then roof, then stairs, then the cell itself: outermost first,
    // so a floor cannot be pulled out from under a crate — or from under the
    // flight of stairs crossing over it — that the player meant to remove.
    const key = cellKey(placement.cell);
    return (
      this.stationOwner.get(key) ??
      this.roofOwner.get(key) ??
      this.stairsOwner.get(key) ??
      this.cellOwner.get(key)
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
      // The run cell's own layer, not `cells`: the run very often crosses a
      // floor the player is standing on, and sharing the map would overwrite
      // it. See `BuildGrid.stairs`.
      const { run } = stairsCells(data.cell, data.rotation);
      this.grid.setStairs(run, 'stairs');
      this.stairsOwner.set(cellKey(run), data.instanceId);
      return;
    }
    if (isStation(data.definitionId)) {
      this.grid.setStation(data.cell, data.definitionId);
      this.stationOwner.set(cellKey(data.cell), data.instanceId);
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
      this.grid.clearStairs(run);
      this.stairsOwner.delete(cellKey(run));
      return;
    }
    if (isStation(data.definitionId)) {
      this.grid.clearStation(data.cell);
      this.stationOwner.delete(cellKey(data.cell));
      return;
    }
    this.grid.clearCell(data.cell);
    this.cellOwner.delete(cellKey(data.cell));
  }

  // -------------------------------------------------------------------------
  // Stations
  // -------------------------------------------------------------------------

  /** Every built crate, as the aggregate resource view wants them. */
  crates(): CrateRef[] {
    const out: CrateRef[] = [];
    for (const [id, container] of this.crateContainers) {
      const live = this.instances.get(id);
      if (!live) continue;
      out.push({ container, position: live.mesh.position });
    }
    return out;
  }

  crateContainer(instanceId: string): Container | undefined {
    return this.crateContainers.get(instanceId);
  }

  /** Built stations within `reach` metres, nearest first. */
  stationsNear(pos: THREE.Vector3, reach: number): StationRef[] {
    const found: { ref: StationRef; d: number }[] = [];
    for (const live of this.instances.values()) {
      if (!isStation(live.data.definitionId)) continue;
      const d = live.mesh.position.distanceTo(pos);
      if (d > reach) continue;
      found.push({
        ref: {
          instanceId: live.data.instanceId,
          piece: live.data.definitionId,
          position: live.mesh.position.clone(),
        },
        d,
      });
    }
    return found.sort((a, b) => a.d - b.d).map((entry) => entry.ref);
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

  /**
   * The vertical links the player's staircases provide.
   *
   * Computed HERE rather than in `NavGraph` because a staircase's direction
   * lives in its rotation, and the grid does not carry rotations — only which
   * cell holds which piece. `NavGraph` used to infer the link from the stairs
   * cell alone, which forced it to link the run cell to the landing DIRECTLY
   * ABOVE IT: same x, same z. An enemy that took that waypoint was then asked
   * to steer at a target whose XZ was its own, `Enemy`'s movement gate found
   * a heading of length zero, and it drove at zero velocity and parked at the
   * foot of the ramp for the rest of the run.
   *
   * The link is base -> landing, which is what a person actually does: you
   * step onto the flight from the base cell and arrive one level up and one
   * tile along. Those differ in XZ, so there is a real direction to walk in.
   */
  private stairLinks(): FixedLink[] {
    const links: FixedLink[] = [];
    for (const { data } of this.instances.values()) {
      if (data.definitionId !== 'stairs') continue;
      const { base, landing } = stairsCells(data.cell, data.rotation);
      links.push([base, landing]);
    }
    return links;
  }

  private recomputeRooms(): void {
    this.graph = detectRooms(this.grid);
    // Rebuilt wholesale rather than patched. The envelope is at most 324
    // cells, which is nothing next to the room flood fill directly above.
    this.nav = buildNavGraph(this.grid, this.machine.deckCells, [
      ...this.machine.fixedLinks,
      ...this.stairLinks(),
    ]);
    this.bus.emit('build:rooms-changed', {
      roomCount: this.graph.rooms.length,
      enclosedCount: countEnclosed(this.graph),
    });
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  serialise(): BuildPieceInstance[] {
    return [...this.instances.values()].map((live) => {
      const container = this.crateContainers.get(live.data.instanceId);
      const state: CrateState | undefined = container
        ? { slots: container.serialise() }
        : undefined;
      return {
        ...live.data,
        cell: { ...live.data.cell },
        edge: live.data.edge ? { ...live.data.edge } : undefined,
        state,
      };
    });
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

    // Floors first: everything else in the list depends on one existing.
    const rank: Record<PieceId, number> = {
      floor: 0,
      stairs: 1,
      wall: 2,
      doorway: 2,
      railing: 2,
      roof: 3,
      crate: 4,
      workbench: 4,
      refinery: 4,
    };
    const ordered = [...pieces].sort(
      (a, b) => a.cell.y - b.cell.y || rank[a.definitionId] - rank[b.definitionId],
    );

    for (const piece of ordered) {
      const created = this.place(
        {
          piece: piece.definitionId,
          cell: piece.cell,
          edge: piece.edge,
          rotation: piece.rotation,
        },
        true,
      );
      if (!created) continue;

      created.health = piece.health;
      const slots = (piece.state as CrateState | undefined)?.slots;
      if (slots) this.crateContainers.get(created.instanceId)?.restore(slots);
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
    this.stationOwner.clear();
    this.stairsOwner.clear();
    this.crateContainers.clear();
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
