import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { BUILD_PIECES, type PieceId } from '@/data/build-pieces';
import { GRID_TILE } from '@/game/constants';
import {
  canonicalEdge,
  cellCenter,
  worldToCell,
  type Cell,
  type Side,
} from './BuildGrid';
import type { Placement, Validation } from './BuildValidation';
import { buildPieceGeometry } from './BuildPieceGeometry';
import { BuildSystem } from './BuildSystem';

const MAX_REACH = 9;
/** Where the target lands when the ray hits nothing, so the player can still
 *  extend a floor out over empty space at the deck edge. */
const FALLBACK_DISTANCE = 5;

const VALID_COLOR = new THREE.Color(0x5ad86a);
const INVALID_COLOR = new THREE.Color(0xd6483b);

/**
 * Targeting and ghost rendering for build mode.
 *
 * Raycasts from the camera through the crosshair, snaps to a cell or the
 * nearest edge of that cell, and shows a translucent preview coloured by
 * whether the placement would be accepted.
 */
export class BuildPreview {
  readonly mesh: THREE.Mesh;

  private readonly material: THREE.MeshBasicMaterial;
  private readonly hitPoint = new THREE.Vector3();
  private current: Placement | null = null;
  private currentValidation: Validation = { ok: false };
  private currentPiece: PieceId | null = null;

  constructor(scene: THREE.Scene) {
    this.material = new THREE.MeshBasicMaterial({
      color: VALID_COLOR,
      transparent: true,
      opacity: 0.42,
      // The ghost must read on top of whatever it overlaps, or it disappears
      // inside existing geometry exactly when the player needs to see it.
      depthTest: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(buildPieceGeometry('floor'), this.material);
    this.mesh.visible = false;
    this.mesh.renderOrder = 999;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  get placement(): Placement | null {
    return this.current;
  }

  get validation(): Validation {
    return this.currentValidation;
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
    if (!visible) this.current = null;
  }

  update(
    camera: THREE.Camera,
    physics: PhysicsWorld,
    system: BuildSystem,
    level: number,
    piece: PieceId,
    rotation: number,
    ignore?: RAPIER.Collider,
  ): void {
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();
    camera.getWorldPosition(origin);
    camera.getWorldDirection(direction);

    const hit = physics.raycast(origin, direction, MAX_REACH, ignore);
    if (hit) {
      this.hitPoint.copy(hit.point);
      // Nudge inward along the surface normal so a hit exactly on a boundary
      // resolves to the cell the player is looking AT, not the one behind it.
      this.hitPoint.addScaledVector(hit.normal, -0.02);
    } else {
      this.hitPoint.copy(origin).addScaledVector(direction, FALLBACK_DISTANCE);
    }

    const cell = worldToCell(this.hitPoint.x, this.hitPoint.z, level);
    const def = BUILD_PIECES[piece];

    this.current =
      def.anchor === 'edge'
        ? { piece, cell, edge: canonicalEdge(cell, nearestSide(this.hitPoint, cell)), rotation }
        : { piece, cell, rotation };

    this.currentValidation = system.canPlace(this.current);
    this.applyGhost(piece, this.current);
  }

  private applyGhost(piece: PieceId, placement: Placement): void {
    if (this.currentPiece !== piece) {
      this.mesh.geometry = buildPieceGeometry(piece);
      this.currentPiece = piece;
    }

    const { position, rotationY } = BuildSystem.transformFor(
      piece,
      placement.cell,
      placement.edge,
      placement.rotation,
    );
    this.mesh.position.copy(position);
    this.mesh.rotation.y = rotationY;
    this.material.color.copy(this.currentValidation.ok ? VALID_COLOR : INVALID_COLOR);
  }

  dispose(): void {
    this.material.dispose();
  }
}

/** Which side of a cell a world point is closest to. */
function nearestSide(point: THREE.Vector3, cell: Cell): Side {
  const center = cellCenter(cell);
  const dx = point.x - center.x;
  const dz = point.z - center.z;

  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'east' : 'west';
  return dz > 0 ? 'south' : 'north';
}

/** Exported for the harness: half a tile, used to reason about snapping. */
export const HALF_TILE = GRID_TILE / 2;
