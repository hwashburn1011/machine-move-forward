import { TURRETS, type TurretDefinition } from '@/data/turrets';
import { angleToTurret, clampTurretAim } from './TurretAim';

export type AutomaticTargetKind =
  'infantry' | 'gunboat-hull' | 'gunboat-weapon' | 'gunboat-engine' | 'vehicle';
export interface AutomaticDefenseTarget {
  id: string;
  kind: string;
  part?: 'hull' | 'weapon' | 'engine';
  vehicleId?: 'gunboat' | 'skiff';
  position: { x: number; y: number; z: number };
  alive?: boolean;
}
export interface AutomaticDefenseSave {
  instanceId: string;
  yaw: number;
  pitch: number;
}
export interface AutomaticDefenseCallbacks {
  isPowered(instanceId: string): boolean;
  getHealth(instanceId: string): number;
  getPosition(instanceId: string): { x: number; y: number; z: number };
  getTargets(): readonly AutomaticDefenseTarget[];
  hasLineOfSight?(instanceId: string, targetId: string): boolean;
  raycast?(instanceId: string, targetId: string): boolean;
  damageTarget(targetId: string, amount: number): void;
  onAim?(instanceId: string, yaw: number, pitch: number): void;
  onFired?(instanceId: string, targetId: string): void;
  onTargetAcquired?(instanceId: string, targetId: string): void;
}
interface Runtime extends AutomaticDefenseSave {
  lock: number;
  cooldown: number;
  targetId: string | null;
}

const legalTarget = (target: AutomaticDefenseTarget): boolean =>
  target.kind === 'infantry' ||
  target.kind === 'gunboat-hull' ||
  target.kind === 'gunboat-weapon' ||
  target.kind === 'gunboat-engine' ||
  (target.kind === 'vehicle' &&
    target.vehicleId === 'gunboat' &&
    (target.part === 'hull' || target.part === 'weapon' || target.part === 'engine'));

export function selectAutomaticTarget(
  origin: { x: number; y: number; z: number },
  targets: readonly AutomaticDefenseTarget[],
  range = TURRETS['automatic-turret'].range,
  visible: (target: AutomaticDefenseTarget) => boolean = () => true,
): AutomaticDefenseTarget | null {
  return (
    targets
      .filter((t) => t.alive !== false && legalTarget(t) && visible(t))
      .map((t) => ({
        t,
        d: Math.hypot(t.position.x - origin.x, t.position.y - origin.y, t.position.z - origin.z),
      }))
      .filter((x) => x.d <= range)
      .sort((a, b) => a.d - b.d || a.t.id.localeCompare(b.t.id))[0]?.t ?? null
  );
}

export class AutomaticDefenseSystem {
  private readonly turrets = new Map<string, Runtime>();
  readonly definition: TurretDefinition = TURRETS['automatic-turret'];
  constructor(private readonly callbacks: AutomaticDefenseCallbacks) {}
  register(instanceId: string, saved?: Partial<AutomaticDefenseSave>): void {
    const safe = (n: unknown, fallback: number) =>
      typeof n === 'number' && Number.isFinite(n) ? n : fallback;
    const clamped = clampTurretAim(
      { yaw: safe(saved?.yaw, 0), pitch: safe(saved?.pitch, 0) },
      this.definition,
    );
    this.turrets.set(instanceId, {
      instanceId,
      yaw: clamped.yaw,
      pitch: clamped.pitch,
      lock: 0,
      cooldown: 0,
      targetId: null,
    });
  }
  unregister(id: string): void {
    this.turrets.delete(id);
  }
  clear(): void {
    this.turrets.clear();
  }
  get size(): number {
    return this.turrets.size;
  }
  toSave(): AutomaticDefenseSave[] {
    return [...this.turrets.values()].map(({ instanceId, yaw, pitch }) => ({
      instanceId,
      yaw,
      pitch,
    }));
  }
  restore(saves: readonly AutomaticDefenseSave[] = []): void {
    this.clear();
    for (const save of saves) this.register(save.instanceId, save);
  }
  update(dt: number): void {
    const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
    for (const t of this.turrets.values()) {
      t.cooldown = Math.max(0, t.cooldown - step);
      if (!this.callbacks.isPowered(t.instanceId) || this.callbacks.getHealth(t.instanceId) <= 0) {
        t.targetId = null;
        t.lock = 0;
        continue;
      }
      const origin = this.callbacks.getPosition(t.instanceId);
      const candidates = this.callbacks.getTargets();
      let target = t.targetId
        ? (candidates.find((c) => c.id === t.targetId && c.alive !== false && legalTarget(c)) ??
          null)
        : null;
      if (target) {
        const d = Math.hypot(
          target.position.x - origin.x,
          target.position.y - origin.y,
          target.position.z - origin.z,
        );
        if (
          d > this.definition.range ||
          (this.callbacks.hasLineOfSight && !this.callbacks.hasLineOfSight(t.instanceId, target.id))
        )
          target = null;
      }
      if (!target) {
        t.lock = 0;
        target = selectAutomaticTarget(origin, candidates, this.definition.range, (candidate) =>
          this.callbacks.hasLineOfSight
            ? this.callbacks.hasLineOfSight(t.instanceId, candidate.id)
            : true,
        );
        if (target) {
          t.targetId = target.id;
          this.callbacks.onTargetAcquired?.(t.instanceId, target.id);
        }
      }
      if (!target) {
        t.targetId = null;
        continue;
      }
      const wanted = angleToTurret(origin, target.position);
      const yawDelta = wrapAngle(wanted.yaw - t.yaw);
      const pitchDelta = wanted.pitch - t.pitch;
      const yawStep = Math.max(
        -this.definition.yawSpeed! * step,
        Math.min(this.definition.yawSpeed! * step, yawDelta),
      );
      const pitchStep = Math.max(
        -this.definition.pitchSpeed! * step,
        Math.min(this.definition.pitchSpeed! * step, pitchDelta),
      );
      const next = clampTurretAim(
        // Full rotation crosses the rear seam. Clamping the accumulated yaw
        // there strands a turret when its next target is on the other side.
        { yaw: wrapAngle(t.yaw + yawStep), pitch: t.pitch + pitchStep },
        this.definition,
      );
      t.yaw = next.yaw;
      t.pitch = next.pitch;
      this.callbacks.onAim?.(t.instanceId, t.yaw, t.pitch);
      const aimed =
        Math.abs(yawDelta) <= this.definition.aimTolerance &&
        Math.abs(pitchDelta) <= this.definition.aimTolerance;
      const visible = this.callbacks.hasLineOfSight
        ? this.callbacks.hasLineOfSight(t.instanceId, target.id)
        : true;
      if (!visible) {
        t.lock = 0;
        continue;
      }
      t.lock += step;
      if (aimed && t.lock >= this.definition.lockDelay! && t.cooldown <= 0) {
        const confirmed = this.callbacks.raycast
          ? this.callbacks.raycast(t.instanceId, target.id)
          : true;
        if (confirmed) {
          this.callbacks.damageTarget(target.id, this.definition.damage);
          this.callbacks.onFired?.(t.instanceId, target.id);
          t.cooldown = 1 / this.definition.fireRate;
        }
      }
    }
  }
}

function wrapAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
