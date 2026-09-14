import * as THREE from 'three';
import type { BuildSystem } from '@/building/BuildSystem';
import { cellCenter, cellKey } from '@/building/BuildGrid';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { ResourceAccess } from '@/items/ResourceAccess';
import type { MachineDamage } from '@/machine/MachineDamage';
import type { VehicleManager } from '@/vehicles/VehicleManager';
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';
import type { Enemy } from './Enemy';
import type { EnemyManager } from './EnemyManager';
import { CAPSULE_FOOT_OFFSET } from './EnemyMesh';
import { findPath } from './NavGraph';
import {
  RaidObjectiveController,
  pickRaidObjective,
  type RaidCargo,
  type RaidObjective,
} from './RaidObjectives';

const STOCK = [
  ['scrap', 6],
  ['components', 2],
  ['fuel', 2],
] as const;

/** Live raid objectives. Containers remain authoritative until a carrier reaches one. */
export class RaidMissionSystem {
  readonly ledger = new RaidObjectiveController();
  private kind: RaidObjective | null = null;
  private assigned = false;
  private elapsed = 0;
  private actionTime = 0;
  private extractionLost = false;
  private readonly target = new THREE.Vector3();
  private approachCache: { key: string; at: THREE.Vector3; expires: number } | null = null;

  constructor(
    private readonly enemies: EnemyManager,
    private readonly build: BuildSystem,
    private readonly physics: PhysicsWorld,
    private readonly resources: ResourceAccess,
    private readonly damage: MachineDamage,
    private readonly ship: VehicleManager,
    private readonly announce: (message: string) => void,
    private readonly changed: () => void,
  ) {}

  start(seed: number | string, wave: number): RaidObjective {
    this.finish();
    this.kind = pickRaidObjective(seed, wave);
    if (this.kind === 'theft' && !this.storageIds().length) this.kind = 'assault';
    this.ship.setExtractionHold(this.kind === 'theft');
    return this.kind;
  }

  onBoarder(enemy: Enemy): void {
    if (this.assigned || !this.kind || this.kind === 'assault' || enemy.aiState === 'dead') return;
    if (this.kind === 'sabotage') {
      const id = (Object.keys(SUBSYSTEMS) as SubsystemId[]).find(
        (key) => this.damage.health(key) > 0,
      );
      if (!id) return;
      this.assigned = true;
      this.ledger.assign('sabotage', enemy.id, id, enemy.worldPosition);
      this.announce(`Saboteur aboard — protect the ${SUBSYSTEMS[id].name.toLowerCase()}!`);
      return;
    }
    const id = this.storageIds()
      .sort((a, b) => {
        const va = this.build.visual(a)!,
          vb = this.build.visual(b)!;
        return (
          va.position.distanceToSquared(enemy.worldPosition) -
          vb.position.distanceToSquared(enemy.worldPosition)
        );
      })
      .find((key) => this.storageApproach(key, enemy) !== null);
    if (!id) {
      this.ship.setExtractionHold(false);
      this.kind = 'assault';
      return;
    }
    this.assigned = true;
    this.ledger.assign('theft', enemy.id, id, enemy.worldPosition);
    this.announce('Supply raider aboard — stop the carrier or cut its extraction grapple.');
  }

  get status(): string | null {
    if (!this.kind) return null;
    const mission = this.ledger.snapshot;
    if (mission?.objective === 'sabotage') return 'SABOTAGE · Protect machine service panels';
    if (mission?.state === 'carrying') {
      const cargo = mission.cargo!;
      return `SUPPLIES STOLEN · ${cargo.count} ${cargo.itemId} · Stop the marked carrier${this.extractionLost ? ' (escape blocked)' : ''}`;
    }
    if (mission?.state === 'escaped') return 'CARRIER ESCAPED · Clear the remaining boarders';
    if (mission?.state === 'recovered') return 'SUPPLIES RECOVERED · Clear the remaining boarders';
    return this.kind === 'theft'
      ? 'SUPPLY RAID · Defend storage or cut the grapple'
      : this.kind === 'sabotage'
        ? 'SABOTAGE RAID · Protect machinery'
        : 'ASSAULT · Hold the deck';
  }

  update(dt: number): void {
    const mission = this.ledger.snapshot;
    if (!mission || !['intent', 'carrying'].includes(mission.state) || this.extractionLost) return;
    const enemy = this.enemies.active.find(
      (e) => e.id === mission.carrierId && e.aiState !== 'dead',
    );
    if (!enemy) {
      this.onKilled(mission.carrierId);
      this.ship.setExtractionHold(false);
      return;
    }
    this.elapsed += dt;
    if (mission.objective === 'sabotage') {
      const id = mission.targetId as SubsystemId;
      if (this.damage.health(id) <= 0) {
        enemy.setMissionTarget(null, 'travel');
        this.ledger.reset();
        return;
      }
      const point = SUBSYSTEMS[id].repairAt;
      this.target.set(point.x, point.y + CAPSULE_FOOT_OFFSET, point.z);
      enemy.setMissionTarget(this.target, 'sabotage', id);
      return;
    }
    if (mission.objective !== 'theft') return;
    const ship = this.ship.snapshot;
    if (
      this.elapsed > 90 ||
      !ship ||
      ship.hookHealth <= 0 ||
      ship.hullHealth <= 0 ||
      ship.phase === 'retreat'
    ) {
      this.extractionLost = true;
      this.ship.setExtractionHold(false);
      enemy.setMissionTarget(null, 'travel');
      if (mission.state === 'intent') this.ledger.reset();
      else this.kind = 'assault'; // carrier remains killable; cargo stays recoverable
      return;
    }
    if (mission.state === 'intent') {
      const source = this.build.instance(mission.targetId);
      // Stable IDs are resolved every step: moved/destroyed storage cannot strand an intent.
      if (!source || !this.hasStock(mission.targetId)) {
        this.cancel(enemy);
        return;
      }
      const approach = this.storageApproach(mission.targetId, enemy);
      if (!approach) {
        this.cancel(enemy);
        return;
      }
      enemy.setMissionTarget(approach, 'travel');
      const visual = this.build.visual(mission.targetId)!;
      const point = visual.getWorldPosition(this.target).add(new THREE.Vector3(0, 0.4, 0));
      const delta = point.clone().sub(enemy.worldPosition),
        distance = delta.length();
      const hit =
        distance > 0.01
          ? this.physics.raycast(
              enemy.worldPosition,
              delta.multiplyScalar(1 / distance),
              distance,
              enemy.physicsCollider ?? undefined,
            )
          : null;
      const visible =
        !hit || (hit.userData as { id?: string } | undefined)?.id === mission.targetId;
      if (distance <= 2.5 && Math.abs(point.y - enemy.worldPosition.y) < 1.25 && visible)
        this.actionTime += dt;
      else this.actionTime = 0;
      if (this.actionTime >= 1.2) {
        const cargo = this.ledger.pickup(mission.targetId, (id) => this.pickup(id));
        this.actionTime = 0;
        if (cargo) {
          this.changed();
          this.announce(
            `Carrier took ${cargo.count} ${cargo.itemId}! Stop it before it reaches the grapple.`,
          );
        } else this.cancel(enemy);
      }
    } else {
      this.target.copy(mission.entry);
      enemy.setMissionTarget(this.target, 'travel');
      if (enemy.worldPosition.distanceTo(this.target) < 1.5) this.actionTime += dt;
      else this.actionTime = 0;
      if (this.actionTime >= 3) {
        const cargo = this.ledger.escape(enemy.id);
        enemy.despawn();
        this.ship.setExtractionHold(false);
        if (cargo) this.announce(`Carrier escaped with ${cargo.count} ${cargo.itemId}.`);
      }
    }
  }

  onKilled(enemyId: string): void {
    const mission = this.ledger.snapshot;
    if (mission?.carrierId !== enemyId) return;
    const cargo = this.ledger.takeCargoOnKill(enemyId, (stack) => {
      const source = this.build.crateContainer(mission.targetId);
      const remaining = this.resources.deposit(
        stack.itemId,
        source ? source.add(stack.itemId, stack.count) : stack.count,
      );
      return remaining ? { ...stack, count: remaining } : null;
    });
    this.ship.setExtractionHold(false);
    if (cargo) {
      this.changed();
      this.announce(
        `Recovered ${cargo.count} ${cargo.itemId}.${this.ledger.recoveredLedger.length ? ' Overflow is held at the radio.' : ''}`,
      );
    } else this.ledger.reset();
  }

  collectRecovered(): void {
    this.ledger.collectRecovered((cargo) => {
      const remaining = this.resources.deposit(cargo.itemId, cargo.count);
      return remaining ? { ...cargo, count: remaining } : null;
    });
    this.changed();
    this.announce(
      this.ledger.recoveredLedger.length
        ? 'Make room in inventory or nearby storage to collect the remaining supplies.'
        : 'Recovered supplies collected.',
    );
  }

  /** Cancel a transient runtime mission without treating it as a kill. */
  cancelTransient(): void {
    const mission = this.ledger.snapshot;
    if (mission)
      this.enemies.active.find((e) => e.id === mission.carrierId)?.setMissionTarget(null, 'travel');
    this.ledger.reset();
    this.kind = null;
    this.assigned = false;
    this.elapsed = 0;
    this.actionTime = 0;
    this.extractionLost = false;
    this.approachCache = null;
    this.ship.setExtractionHold(false);
  }

  reset(): void {
    this.cancelTransient();
  }

  finish(): void {
    const mission = this.ledger.snapshot;
    if (mission) {
      this.onKilled(mission.carrierId);
      this.enemies.active.find((e) => e.id === mission.carrierId)?.setMissionTarget(null, 'travel');
    }
    this.ledger.reset();
    this.kind = null;
    this.assigned = false;
    this.elapsed = 0;
    this.actionTime = 0;
    this.extractionLost = false;
    this.approachCache = null;
    this.ship.setExtractionHold(false);
  }

  private cancel(enemy: Enemy): void {
    enemy.setMissionTarget(null, 'travel');
    this.ledger.reset();
    this.ship.setExtractionHold(false);
    this.kind = 'assault';
  }
  private hasStock(id: string): boolean {
    const storage = this.build.crateContainer(id);
    return !!storage && STOCK.some(([item]) => storage.count(item) > 0);
  }
  private storageIds(): string[] {
    return this.build
      .serialise()
      .filter((p) => p.definitionId === 'crate' && this.hasStock(p.instanceId))
      .map((p) => p.instanceId);
  }
  private pickup(id: string): RaidCargo | null {
    const storage = this.build.crateContainer(id);
    if (!storage) return null;
    for (const [itemId, maximum] of STOCK) {
      const count = Math.min(maximum, storage.count(itemId));
      if (count > 0) return { itemId, count: storage.remove(itemId, count) };
    }
    return null;
  }
  private storageApproach(id: string, enemy: Enemy): THREE.Vector3 | null {
    const piece = this.build.instance(id);
    if (!piece) return null;
    const nav = this.build.navGraph;
    const pieceKey = `${piece.cell.x},${piece.cell.y},${piece.cell.z}`;
    const cacheKey = `${id}:${pieceKey}:${enemy.gridCell.x},${enemy.gridCell.y},${enemy.gridCell.z}`;
    const cached = this.approachCache;
    if (cached?.key === cacheKey && cached.expires > this.elapsed)
      return this.target.copy(cached.at);
    const candidates = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].map(([x, z]) => ({ x: piece.cell.x + x!, y: piece.cell.y, z: piece.cell.z + z! }));
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - enemy.gridCell.x, a.z - enemy.gridCell.z) -
        Math.hypot(b.x - enemy.gridCell.x, b.z - enemy.gridCell.z),
    );
    for (const cell of candidates) {
      if (!nav.links.has(cellKey(cell)) || !findPath(nav, enemy.gridCell, cell).length) continue;
      const at = cellCenter(cell);
      const result = new THREE.Vector3(at.x, at.y + CAPSULE_FOOT_OFFSET, at.z);
      this.approachCache = { key: cacheKey, at: result.clone(), expires: this.elapsed + 0.25 };
      return this.target.copy(result);
    }
    return null;
  }
}
