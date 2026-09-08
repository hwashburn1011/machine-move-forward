import type * as THREE from 'three';

/**
 * Anything the player can walk up to and press E on.
 *
 * Deliberately not a station type: later milestones register turrets, doors,
 * and loot containers here without this file learning what any of them are.
 */
export interface Interactable {
  id: string;
  label: string;
  position: THREE.Vector3;
  kind:
    | 'crate'
    | 'workbench'
    | 'refinery'
    | 'generator'
    | 'stove'
    | 'turret'
    | 'turret-auto'
    | 'collector'
    | 'radio'
    | 'helm'
    | 'journal'
    | 'unique'
    | 'departure'
    // Every timed device — the condenser, the planter — under one kind, so
    // collecting an output is one branch rather than one per machine. What
    // came out is the build system's business, not this file's.
    | 'producer'
    | 'repair';
}

/** Metres. Shorter than the 6m resource reach: you must stand at the thing. */
export const INTERACT_REACH = 3;

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Picks the one interactable the E key applies to.
 *
 * Pure: it is handed candidates rather than finding them, so it can be
 * reasoned about without a scene graph.
 */
export class InteractionSystem {
  private active: Interactable | null = null;

  constructor(private readonly reach: number = INTERACT_REACH) {}

  get current(): Interactable | null {
    return this.active;
  }

  /**
   * Nearest candidate within reach, ties broken by id.
   *
   * The tiebreak is not cosmetic: two crates placed the same distance away
   * would otherwise swap the prompt every frame as float noise reorders them.
   */
  update(playerPos: Vec3Like, candidates: readonly Interactable[]): Interactable | null {
    let best: Interactable | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      const d = Math.hypot(
        candidate.position.x - playerPos.x,
        candidate.position.y - playerPos.y,
        candidate.position.z - playerPos.z,
      );
      if (d > this.reach) continue;

      if (d < bestDistance || (d === bestDistance && best !== null && candidate.id < best.id)) {
        best = candidate;
        bestDistance = d;
      }
    }

    this.active = best;
    return best;
  }

  clear(): void {
    this.active = null;
  }
}
