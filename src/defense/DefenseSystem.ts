import type { TurretFilter, TurretDefinition } from '@/data/turrets';
import { TURRETS } from '@/data/turrets';
import { angleToTurret, clampTurretAim, type TurretAim } from './TurretAim';

export interface DefenseTarget {
  id: string;
  kind: 'infantry' | 'vehicle' | 'structure' | 'hook';
  position: { x: number; y: number; z: number };
  alive?: boolean;
}

export interface TurretRuntimeSave {
  instanceId: string;
  yaw: number;
  pitch: number;
  filter: TurretFilter;
}

export interface TurretInput {
  dt: number;
  lookX: number;
  lookY: number;
  fireHeld: boolean;
  powered: boolean;
  occupied: boolean;
}

export interface TurretView {
  instanceId: string;
  powered: boolean;
  occupied: boolean;
  yaw: number;
  pitch: number;
  cooldownFraction: number;
}

export interface TurretRuntimeCallbacks {
  isPowered(instanceId: string): boolean;
  getHealth(instanceId: string): number;
  getPosition(instanceId: string): { x: number; y: number; z: number };
  getTargets(): readonly DefenseTarget[];
  /** One raycast from the muzzle. Returning null is an occlusion or a miss. */
  raycast(
    instanceId: string,
    yaw: number,
    pitch: number,
    range: number,
  ): { targetId: string; distance: number } | null;
  damageTarget(targetId: string, amount: number): void;
  onMounted(instanceId: string): void;
  onDismounted(instanceId: string): void;
  onFired(instanceId: string, targetId: string | null): void;
  onAim?(instanceId: string, yaw: number, pitch: number): void;
  /** Active upgrade adapter; absent means the base turret stats. */
  getModifiers?(): DefenseModifiers;
}

export interface DefenseModifiers {
  damageMultiplier?: number;
  fireRateMultiplier?: number;
  powerDrawBonus?: number;
}

interface TurretRuntimeState extends TurretRuntimeSave {
  nextFireAt: number;
}

export class DefenseSystem {
  private readonly turrets = new Map<string, TurretRuntimeState>();
  private mountedId: string | null = null;
  private readonly def: TurretDefinition = TURRETS['manual-turret'];
  private runtimeModifiers: DefenseModifiers | null = null;

  constructor(private readonly callbacks: TurretRuntimeCallbacks) {}

  register(instanceId: string, saved?: Partial<TurretRuntimeSave>): void {
    this.turrets.set(instanceId, {
      instanceId,
      yaw: saved?.yaw ?? 0,
      pitch: saved?.pitch ?? 0,
      filter: saved?.filter ?? 'all',
      nextFireAt: 0,
    });
  }

  unregister(instanceId: string): void {
    if (this.mountedId === instanceId) this.exit();
    this.turrets.delete(instanceId);
  }

  clear(): void {
    this.exit();
    this.turrets.clear();
  }

  get mounted(): string | null {
    return this.mountedId;
  }
  get definition(): TurretDefinition {
    return this.def;
  }

  get effectiveDamage(): number {
    return this.def.damage * this.modifiers().damageMultiplier;
  }

  get effectiveFireRate(): number {
    return this.def.fireRate * this.modifiers().fireRateMultiplier;
  }

  get effectivePowerDraw(): number {
    return this.def.powerDraw + this.modifiers().powerDrawBonus;
  }

  /** Apply the active defense upgrade without changing the base blueprint. */
  setModifiers(next?: Partial<DefenseModifiers>): void {
    this.runtimeModifiers = {
      damageMultiplier: finitePositive(next?.damageMultiplier, 1),
      fireRateMultiplier: finitePositive(next?.fireRateMultiplier, 1),
      powerDrawBonus: Number.isFinite(next?.powerDrawBonus)
        ? Math.max(0, next?.powerDrawBonus as number)
        : 0,
    };
  }

  enter(instanceId: string): boolean {
    const turret = this.turrets.get(instanceId);
    if (!turret || this.callbacks.getHealth(instanceId) <= 0) return false;
    if (this.mountedId && this.mountedId !== instanceId) this.exit();
    this.mountedId = instanceId;
    this.callbacks.onAim?.(instanceId, turret.yaw, turret.pitch);
    this.callbacks.onMounted(instanceId);
    return true;
  }

  exit(): void {
    if (!this.mountedId) return;
    const id = this.mountedId;
    this.mountedId = null;
    this.callbacks.onDismounted(id);
  }

  aim(yawDelta: number, pitchDelta: number): TurretAim | null {
    if (!this.mountedId) return null;
    const turret = this.turrets.get(this.mountedId);
    if (!turret) return null;
    const next = clampTurretAim(
      { yaw: turret.yaw + yawDelta, pitch: turret.pitch + pitchDelta },
      this.def,
    );
    turret.yaw = next.yaw;
    turret.pitch = next.pitch;
    this.callbacks.onAim?.(turret.instanceId, turret.yaw, turret.pitch);
    return next;
  }

  setFilter(filter: TurretFilter): void {
    if (this.mountedId) this.turrets.get(this.mountedId)!.filter = filter;
  }

  fixedUpdate(now: number): void {
    if (!this.mountedId) return;
    const turret = this.turrets.get(this.mountedId);
    if (
      !turret ||
      this.callbacks.getHealth(turret.instanceId) <= 0 ||
      !this.callbacks.isPowered(turret.instanceId)
    )
      return;
    if (now < turret.nextFireAt) return;
    const modifiers = this.modifiers();
    const fireRate = this.def.fireRate * modifiers.fireRateMultiplier;
    turret.nextFireAt = now + 1 / fireRate;
    const hit = this.callbacks.raycast(turret.instanceId, turret.yaw, turret.pitch, this.def.range);
    if (!hit) {
      this.callbacks.onFired(turret.instanceId, null);
      return;
    }
    const target = this.callbacks.getTargets().find((candidate) => candidate.id === hit.targetId);
    if (target?.alive === false) {
      this.callbacks.onFired(turret.instanceId, null);
      return;
    }
    this.callbacks.damageTarget(hit.targetId, this.def.damage * modifiers.damageMultiplier);
    this.callbacks.onFired(turret.instanceId, hit.targetId);
  }

  /** Adapter-shaped update for Game's fixed loop and input layer. */
  update(now: number, input: TurretInput): TurretView | null {
    if (!this.mountedId) return null;
    const turret = this.turrets.get(this.mountedId);
    if (!turret) return null;
    if (input.occupied) this.aim(input.lookX, input.lookY);
    if (input.fireHeld && input.powered) this.fixedUpdate(now);
    return {
      instanceId: turret.instanceId,
      powered: input.powered && this.callbacks.isPowered(turret.instanceId),
      occupied: input.occupied,
      yaw: turret.yaw,
      pitch: turret.pitch,
      cooldownFraction: Math.max(
        0,
        Math.min(
          1,
          turret.nextFireAt <= now
            ? 0
            : (turret.nextFireAt - now) * this.effectiveFireRate,
        ),
      ),
    };
  }

  private modifiers(): Required<DefenseModifiers> {
    const raw = this.runtimeModifiers ?? this.callbacks.getModifiers?.() ?? {};
    return {
      damageMultiplier: finitePositive(raw.damageMultiplier, 1),
      fireRateMultiplier: finitePositive(raw.fireRateMultiplier, 1),
      powerDrawBonus: Number.isFinite(raw.powerDrawBonus) ? Math.max(0, raw.powerDrawBonus as number) : 0,
    };
  }

  serialise(): TurretRuntimeSave[] {
    return [...this.turrets.values()].map(({ nextFireAt: _nextFireAt, ...save }) => ({ ...save }));
  }

  restore(saves: readonly TurretRuntimeSave[]): void {
    for (const save of saves) this.register(save.instanceId, save);
  }
}

export { angleToTurret };

function finitePositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0.01, value as number) : fallback;
}
