import * as THREE from 'three';
import type { CharacterHandle, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { GRAVITY } from '@/game/constants';
import type { Machine } from '@/machine/Machine';
import {
  FAN_OFFSETS,
  PROBE_RANGE,
  shoulderOrigins,
  steerAround,
  type FanProbe,
} from '@/enemies/EnemySteering';

export type CaretakerActorStatus = 'despawned' | 'waiting' | 'moving' | 'reached';
export interface CaretakerMotion {
  moving: boolean;
  grounded: boolean;
  speed: number;
}
export interface CaretakerActorDependencies {
  physics: PhysicsWorld;
  machine: Pick<Machine, 'carryFor'>;
  routeFor(from: THREE.Vector3, target: THREE.Vector3): readonly THREE.Vector3[] | null;
  routeVersion?: () => number;
  onMotion?(motion: Readonly<CaretakerMotion>): void;
}

const RADIUS = 0.28;
const HALF_HEIGHT = 0.22;
const FOOT_OFFSET = RADIUS + HALF_HEIGHT;
const SPEED = 1.35;
const REACH = 0.55;
const TARGET_EPSILON = 0.04;
const TERMINAL_FALL_SPEED = -35;
const PARKED = new THREE.Vector3(0, -100, 0);
const PROBE_HEIGHT = 0.5;

/** Noncombat physics-backed L-12. Public positions and route points are world feet. */
export class CaretakerActor {
  readonly position = new THREE.Vector3();
  readonly root: THREE.Group;
  private readonly handle: CharacterHandle;
  private readonly physicsPosition = new THREE.Vector3();
  private readonly own = new THREE.Vector3();
  private readonly carry = new THREE.Vector3();
  private readonly heading = new THREE.Vector3();
  private readonly probeOrigin = new THREE.Vector3();
  private readonly probeDirection = new THREE.Vector3();
  private readonly fan: FanProbe[] = FAN_OFFSETS.map((angle) => ({ angle, distance: null }));
  private readonly deps: CaretakerActorDependencies;
  private readonly wheels: THREE.Object3D[] = [];
  private route: THREE.Vector3[] | null = null;
  private target: THREE.Vector3 | null = null;
  private waypoint = 0;
  private active = false;
  private routeVersion = -1;
  private grounded = false;
  private verticalVelocity = 0;
  private lastTurn = 0;
  private disposed = false;

  constructor(deps: CaretakerActorDependencies, model?: THREE.Group) {
    this.deps = deps;
    this.root = model ?? new THREE.Group();
    this.root.name ||= 'L12';
    this.root.visible = false;
    this.root.traverse((node) => {
      if (node.name.startsWith('L12Wheel')) this.wheels.push(node);
    });
    const contact = this.root.getObjectByName('L12');
    if (contact) contact.userData.contactPlane = 0;
    this.handle = deps.physics.addCharacter(RADIUS, HALF_HEIGHT, PARKED);
    this.handle.collider.setEnabled(false);
  }

  get status(): CaretakerActorStatus {
    if (!this.active) return 'despawned';
    if (!this.target || !this.route) return 'waiting';
    return this.waypoint >= this.route.length && this.reached(this.target) ? 'reached' : 'moving';
  }

  /** Runtime clearance queries exclude the actor's own capsule through this handle. */
  get collider() {
    return this.handle.collider;
  }

  spawn(position: THREE.Vector3): void {
    if (!finitePoint(position)) return;
    this.position.copy(position);
    this.physicsPosition.set(position.x, position.y + FOOT_OFFSET, position.z);
    this.handle.collider.setEnabled(true);
    this.handle.body.setTranslation(this.physicsPosition, true);
    this.handle.body.setNextKinematicTranslation(this.physicsPosition);
    this.root.position.copy(position);
    this.root.visible = true;
    this.active = true;
    this.grounded = false;
    this.verticalVelocity = 0;
    this.lastTurn = 0;
    this.clearRoute();
  }

  reset(): void {
    this.active = false;
    this.grounded = false;
    this.verticalVelocity = 0;
    this.clearRoute();
    this.handle.collider.setEnabled(false);
    this.root.visible = false;
  }

  canReach(target: THREE.Vector3): boolean {
    if (!this.active || !finitePoint(target)) return false;
    return validCompleteRoute(this.deps.routeFor(this.position, target), target);
  }

  reached(target: THREE.Vector3): boolean {
    return this.active && finitePoint(target) && this.position.distanceTo(target) <= REACH;
  }

  fixedUpdate(dt: number, target: THREE.Vector3 | null): void {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return;

    const carried = this.deps.machine.carryFor(this.position);
    this.carry.set(
      Number.isFinite(carried?.x) ? carried!.x : 0,
      Number.isFinite(carried?.y) ? carried!.y : 0,
      Number.isFinite(carried?.z) ? carried!.z : 0,
    );
    if (this.target) this.carryPoint(this.target);
    if (this.route) for (const point of this.route) this.carryPoint(point);

    if (!target || !finitePoint(target)) this.clearRoute();
    else {
      const version = this.deps.routeVersion?.() ?? 0;
      if (
        !this.target ||
        this.target.distanceToSquared(target) > TARGET_EPSILON ** 2 ||
        version !== this.routeVersion
      ) {
        this.target = target.clone();
        const proposed = this.deps.routeFor(this.position, target);
        this.route = validCompleteRoute(proposed, target)
          ? proposed.map((point) => point.clone())
          : null;
        this.routeVersion = version;
        this.waypoint = 0;
      }
    }

    while (
      this.route &&
      this.waypoint < this.route.length &&
      this.position.distanceTo(this.route[this.waypoint]!) <= REACH
    )
      this.waypoint++;

    const next = this.route?.[this.waypoint];
    this.own.set(0, 0, 0);
    if (next) {
      this.heading.subVectors(next, this.position).setY(0);
      const distance = this.heading.length();
      if (distance > 1e-6) {
        const requestedSpeed = Math.min(SPEED, distance / dt);
        this.heading.divideScalar(distance);
        const steered = this.steer(
          this.heading.x,
          this.heading.z,
          Math.min(PROBE_RANGE, distance + 0.03),
        );
        this.own.set(steered.x * requestedSpeed * dt, 0, steered.z * requestedSpeed * dt);
        this.root.rotation.y = Math.atan2(steered.x, steered.z);
      }
    }

    this.verticalVelocity =
      this.grounded && this.verticalVelocity <= 0
        ? -2
        : Math.max(TERMINAL_FALL_SPEED, this.verticalVelocity + GRAVITY * dt);
    this.own.y = this.verticalVelocity * dt;
    const beforeX = this.position.x;
    const beforeZ = this.position.z;
    this.grounded = this.deps.physics.moveCharacter(
      this.handle,
      this.physicsPosition,
      this.own,
      this.carry,
    );
    if (this.grounded && this.verticalVelocity < 0) this.verticalVelocity = 0;
    this.position.set(
      this.physicsPosition.x,
      this.physicsPosition.y - FOOT_OFFSET,
      this.physicsPosition.z,
    );
    this.root.position.copy(this.position);
    const travelled = Math.hypot(
      this.position.x - beforeX - this.carry.x,
      this.position.z - beforeZ - this.carry.z,
    );
    for (const wheel of this.wheels) wheel.rotation.x += travelled / 0.143;
    this.deps.onMotion?.({
      moving: travelled > 1e-4,
      grounded: this.grounded,
      speed: travelled / dt,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
    this.deps.physics.removeCharacter(this.handle);
    this.root.removeFromParent();
  }

  private carryPoint(point: THREE.Vector3): void {
    const delta = this.deps.machine.carryFor(point);
    if (delta && [delta.x, delta.y, delta.z].every(Number.isFinite))
      point.add(delta as THREE.Vector3Like);
  }

  private clearRoute(): void {
    this.target = null;
    this.route = null;
    this.waypoint = 0;
    this.routeVersion = -1;
    this.lastTurn = 0;
  }

  private steer(desiredX: number, desiredZ: number, probeRange: number): { x: number; z: number } {
    const base = Math.atan2(desiredX, desiredZ);
    for (const probe of this.fan) {
      const angle = base + probe.angle;
      const x = Math.sin(angle);
      const z = Math.cos(angle);
      let nearest: number | null = null;
      for (const shoulder of shoulderOrigins(x, z, RADIUS + 0.03)) {
        this.probeOrigin.set(
          this.physicsPosition.x + shoulder.x,
          this.position.y + PROBE_HEIGHT,
          this.physicsPosition.z + shoulder.z,
        );
        this.probeDirection.set(x, 0, z);
        const hit = this.deps.physics.raycast(
          this.probeOrigin,
          this.probeDirection,
          probeRange,
          this.handle.collider,
        );
        if (hit && (nearest === null || hit.distance < nearest)) nearest = hit.distance;
      }
      probe.distance = nearest;
    }
    const heading = steerAround(desiredX, desiredZ, this.fan, {
      probeRange,
      previousTurn: this.lastTurn,
    });
    this.lastTurn = heading.turn;
    return heading;
  }
}

function finitePoint(point: THREE.Vector3): boolean {
  return [point.x, point.y, point.z].every(Number.isFinite);
}

function validCompleteRoute(
  route: readonly THREE.Vector3[] | null,
  target: THREE.Vector3,
): route is readonly THREE.Vector3[] {
  return Boolean(
    route &&
    route.length > 0 &&
    route.every(finitePoint) &&
    route.at(-1)!.distanceTo(target) <= 1.2,
  );
}
