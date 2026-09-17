import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import {
  authoredEnemyModel,
  buildSkiffCrewModel,
  disposeSkiffCrewModel,
  resetSkiffCrewModel,
} from '@/art/DefenseModels';
import { EnemyVisual } from '@/enemies/EnemyVisual';

export const BOARDING_MECH_IDS = ['bastion', 'revenant', 'warden', 'sovereign'] as const;
export type BoardingMechId = (typeof BOARDING_MECH_IDS)[number];
const PERSISTENT_CAPACITY = 2;

type PoolKey = BoardingMechId | 'generic';
export interface BoardingCrewSlot {
  readonly key: PoolKey;
  readonly model: THREE.Group;
  readonly visual: EnemyVisual | null;
  readonly gripGeometry: THREE.BufferGeometry[];
  persistent: boolean;
}

/** Bounded reusable presentation slots; physics and enemy gameplay stay external. */
export class BoardingCrewVisualPool {
  private readonly idle = new Map<PoolKey, BoardingCrewSlot[]>();
  private readonly persistentCreated = new Map<PoolKey, number>();
  private readonly inUse = new Set<BoardingCrewSlot>();
  private readonly rollerGeometry = new THREE.TorusGeometry(0.13, 0.035, 6, 12);
  private readonly tetherGeometry = new THREE.CylinderGeometry(
    0.024,
    0.024,
    Math.hypot(0.9, 0.6),
    6,
  );
  private disposed = false;

  constructor(private readonly materials: Materials) {}

  acquire(id: BoardingMechId | null): BoardingCrewSlot {
    if (this.disposed) throw new Error('boarding crew visual pool is disposed');
    const key: PoolKey = id ?? 'generic';
    const available = this.idle.get(key);
    const slot = available?.pop() ?? this.create(key);
    slot.model.visible = true;
    slot.visual?.reset();
    slot.visual?.setState('idle');
    slot.visual?.setPresentationOnly();
    if (slot.visual) slot.visual.object3D.visible = true;
    this.inUse.add(slot);
    return slot;
  }

  release(slot: BoardingCrewSlot): void {
    if (!this.inUse.delete(slot)) return;
    slot.model.removeFromParent();
    slot.model.visible = false;
    slot.model.position.set(0, 0, 0);
    slot.model.rotation.set(0, 0, 0);
    slot.visual?.reset();
    resetSkiffCrewModel(slot.model);
    if (!slot.persistent) {
      this.disposeSlot(slot);
      return;
    }
    const available = this.idle.get(slot.key) ?? [];
    available.push(slot);
    this.idle.set(slot.key, available);
  }

  /** Stage two reusable slots for every supported mech and generic crew. */
  prepareForWarmup(): readonly THREE.Group[] {
    const staged: THREE.Group[] = [];
    for (const key of [...BOARDING_MECH_IDS, 'generic' as const]) {
      for (let i = 0; i < PERSISTENT_CAPACITY; i += 1)
        staged.push(this.acquire(key === 'generic' ? null : key).model);
    }
    return staged;
  }

  finishWarmup(groups: readonly THREE.Group[]): void {
    for (const group of groups) {
      const slot = [...this.inUse].find((candidate) => candidate.model === group);
      if (slot) this.release(slot);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of [...this.inUse]) this.release(slot);
    for (const slots of this.idle.values()) for (const slot of slots) this.disposeSlot(slot);
    this.idle.clear();
    this.persistentCreated.clear();
    this.rollerGeometry.dispose();
    this.tetherGeometry.dispose();
  }

  /** Persistent slots remain bounded at two per key; overflow is short-lived and disposed on release. */
  get persistentSlotCount(): number {
    let count = 0;
    for (const value of this.persistentCreated.values()) count += value;
    return count;
  }

  private create(key: PoolKey): BoardingCrewSlot {
    const created = this.persistentCreated.get(key) ?? 0;
    const persistent = created < PERSISTENT_CAPACITY;
    if (persistent) this.persistentCreated.set(key, created + 1);
    if (key === 'generic') {
      return {
        key,
        model: buildSkiffCrewModel(this.materials),
        visual: null,
        gripGeometry: [],
        persistent,
      };
    }
    const model = new THREE.Group();
    model.name = `Boarding-${key}`;
    model.userData.mechId = key;
    const visual = new EnemyVisual(authoredEnemyModel(key), this.materials);
    visual.setPresentationOnly();
    visual.object3D.position.y = 0.96;
    model.add(visual.object3D);
    const grip = new THREE.Group();
    grip.name = 'BoardingGrip';
    grip.position.set(0, 2.2, 0.6);
    const roller = new THREE.Mesh(this.rollerGeometry, this.materials.bareSteel);
    roller.rotation.y = Math.PI / 2;
    grip.add(roller);
    model.add(grip);
    const tether = new THREE.Mesh(this.tetherGeometry, this.materials.bareSteel);
    tether.position.set(0, 1.72, 0.3);
    tether.rotation.x = Math.atan2(0.6, 0.9);
    model.add(tether);
    return { key, model, visual, gripGeometry: [], persistent };
  }

  private disposeSlot(slot: BoardingCrewSlot): void {
    slot.visual?.dispose();
    if (slot.key === 'generic') {
      disposeSkiffCrewModel(slot.model);
    }
  }
}
