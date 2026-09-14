import * as THREE from 'three';

export type TacticKind = 'revenant' | 'bastion' | 'warden' | 'sovereign';
export type RevenantPhase = 'idle' | 'telegraph' | 'lunge' | 'recovery';
export type BastionPhase = 'burst' | 'vent';
export interface EnemyTacticalSnapshot {
  kind: TacticKind;
  phase: string;
  strike: boolean;
  lungeDirection: THREE.Vector3;
  ventOpen: boolean;
  ventAnchor: THREE.Vector3;
  droneAlive: boolean;
  droneHealth: number;
  droneAnchor: THREE.Vector3;
  missionTarget: THREE.Vector3 | null;
  missionMode: 'travel' | 'sabotage' | null;
  subsystemId?: string;
}
export interface TacticalDecision {
  move: THREE.Vector3;
  strike: boolean;
  ventOpen: boolean;
}

export interface FlankCandidate {
  cell: { x: number; y: number; z: number };
  distance: number;
  covered: boolean;
  clearShot: boolean;
  reachable: boolean;
}
export function chooseWardenFlank(
  candidates: readonly FlankCandidate[],
  maxDistance = 8,
): FlankCandidate | null {
  return (
    candidates
      .filter(
        (candidate) =>
          candidate.distance <= maxDistance &&
          candidate.covered &&
          candidate.clearShot &&
          candidate.reachable,
      )
      .sort((a, b) => a.distance - b.distance || a.cell.x - b.cell.x || a.cell.z - b.cell.z)[0] ??
    null
  );
}

const finite = (n: number, fallback = 0): number => (Number.isFinite(n) ? n : fallback);

export class EnemyTactics {
  readonly kind: TacticKind;
  private phase: RevenantPhase | BastionPhase | 'blocked' | 'flank' | 'support' = 'idle';
  private timer = 0;
  private strike = false;
  private droneHealthValue = 35;
  private mission: THREE.Vector3 | null = null;
  private missionModeValue: 'travel' | 'sabotage' | null = null;
  private subsystem: string | undefined;
  private readonly lungeDirection = new THREE.Vector3();
  private readonly vent = new THREE.Vector3();
  private readonly drone = new THREE.Vector3();

  constructor(kind: TacticKind) {
    this.kind = kind;
    this.reset();
  }
  reset(): void {
    this.phase = this.kind === 'bastion' ? 'burst' : 'idle';
    this.timer = 0;
    this.strike = false;
    this.droneHealthValue = 35;
    this.mission = null;
    this.missionModeValue = null;
    this.subsystem = undefined;
    this.lungeDirection.set(0, 0, 0);
  }
  setMissionTarget(
    point: THREE.Vector3 | null,
    mode: 'travel' | 'sabotage',
    subsystemId?: string,
  ): void {
    this.mission = point?.clone() ?? null;
    this.missionModeValue = point ? mode : null;
    this.subsystem = subsystemId;
  }
  damageDrone(amount: number): number {
    if (this.kind !== 'sovereign' || this.droneHealthValue <= 0) return 0;
    const applied = Math.max(0, finite(amount));
    this.droneHealthValue = Math.max(0, this.droneHealthValue - applied);
    return applied;
  }
  get droneAlive(): boolean {
    return this.kind === 'sovereign' && this.droneHealthValue > 0;
  }
  /** Advance only with fixed simulation time. */
  update(
    dt: number,
    input: { target?: THREE.Vector3; blockedLos?: number; lungeDirection?: THREE.Vector3 } = {},
  ): TacticalDecision {
    dt = Math.max(0, finite(dt));
    this.timer += dt;
    this.strike = false;
    if (this.kind === 'revenant') {
      if (this.phase === 'idle' && input.lungeDirection) {
        this.lungeDirection.copy(input.lungeDirection).setY(0).normalize();
        this.phase = 'telegraph';
        this.timer = 0;
      }
      if (this.phase === 'telegraph' && this.timer >= 0.55) {
        this.phase = 'lunge';
        this.timer = 0;
      }
      if (this.phase === 'lunge' && this.timer >= 0.38) {
        this.strike = true;
        this.phase = 'recovery';
        this.timer = 0;
      }
      if (this.phase === 'recovery' && this.timer >= 0.75) {
        this.phase = 'idle';
        this.timer = 0;
      }
      return {
        move:
          this.phase === 'lunge'
            ? this.lungeDirection.clone().multiplyScalar(4.5 / 0.38)
            : new THREE.Vector3(),
        strike: this.strike,
        ventOpen: false,
      };
    }
    if (this.kind === 'bastion' && this.phase === 'vent' && this.timer >= 1.8) {
      this.phase = 'burst';
      this.timer = 0;
    }
    if (this.kind === 'warden' && finite(input.blockedLos ?? 0) >= 1.25) this.phase = 'flank';
    return {
      move: new THREE.Vector3(),
      strike: this.strike,
      ventOpen: this.kind === 'bastion' && this.phase === 'vent',
    };
  }
  beginBastionVent(): void {
    if (this.kind === 'bastion') {
      this.phase = 'vent';
      this.timer = 0;
    }
  }
  clearWardenFlank(): void {
    if (this.kind === 'warden' && this.phase === 'flank') this.phase = 'idle';
  }
  setVentAnchor(anchor: THREE.Vector3): void {
    this.vent.copy(anchor);
  }
  setDroneAnchor(anchor: THREE.Vector3): void {
    this.drone.copy(anchor);
  }
  snapshot(): EnemyTacticalSnapshot {
    return {
      kind: this.kind,
      phase: this.phase,
      strike: this.strike,
      lungeDirection: this.lungeDirection.clone(),
      ventOpen: this.kind === 'bastion' && this.phase === 'vent',
      ventAnchor: this.vent.clone(),
      droneAlive: this.droneAlive,
      droneHealth: this.droneHealthValue,
      droneAnchor: this.drone.clone(),
      missionTarget: this.mission?.clone() ?? null,
      missionMode: this.missionModeValue,
      subsystemId: this.subsystem,
    };
  }
}
