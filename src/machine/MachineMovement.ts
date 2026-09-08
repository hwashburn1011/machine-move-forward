import { BASE_MACHINE_SPEED, REFERENCE_WEIGHT } from '@/game/constants';

export interface MachineMovementModifiers {
  speedMultiplier: number;
  effectiveWeightMultiplier: number;
  accelerationMultiplier: number;
}

/**
 * Machine speed model (handoff section 14).
 *
 * Weight is deliberately gentle here. Its job at this stage is to make the
 * tradeoff legible — more armour is safer but slower — not to punish the
 * player for building. Tuning it into a real constraint is later-milestone
 * work, once there is enough to build that the choice actually bites.
 */
export class MachineMovement {
  /** Total machine mass in kg, summed from structure and equipment. */
  totalWeight = REFERENCE_WEIGHT;

  /** Engine output. 1.0 is the starting engine, 0 is a wrecked one. */
  enginePower = 1;

  /**
   * Speed retained given the legs' condition. 1.0 is four sound legs.
   *
   * Separate from `enginePower` because they fail differently: a dead engine
   * is a halt the player has to fix, and dead legs are a crawl they can limp
   * home on. Multiplying one number by another would lose that distinction.
   */
  legScale = 1;

  private throttle = 1;
  private modifiers: MachineMovementModifiers = {
    speedMultiplier: 1,
    effectiveWeightMultiplier: 1,
    accelerationMultiplier: 1,
  };
  /** A story or other scripted controller can cap speed without losing input. */
  private scriptedSpeedLimit: number | null = null;
  private speed = 0;

  /** How fast the machine converges on its target speed, per second. */
  private readonly responsiveness = 0.55;

  get currentSpeed(): number {
    return this.speed;
  }

  /**
   * Speed at full throttle. Sub-linear in the weight ratio so that even a
   * wildly overloaded machine still crawls rather than stopping dead — a
   * stalled machine would strand the player with no way to recover.
   */
  get maxSpeed(): number {
    // The torque clutch changes the carried payload's effective mass. The
    // machine itself remains a fixed base load, so an empty machine still pays
    // the small propulsion speed tradeoff while a heavily loaded one benefits
    // from the reduced payload. Applying the multiplier to all mass would
    // accidentally make the upgrade a universal speed boost at every weight.
    const baseWeight = Math.min(this.totalWeight, REFERENCE_WEIGHT);
    const payloadWeight = Math.max(0, this.totalWeight - REFERENCE_WEIGHT);
    const effectiveWeight = baseWeight + payloadWeight * this.modifiers.effectiveWeightMultiplier;
    const ratio = Math.max(effectiveWeight, 1) / REFERENCE_WEIGHT;
    return (BASE_MACHINE_SPEED * this.enginePower * this.legScale * this.modifiers.speedMultiplier) / Math.sqrt(ratio);
  }

  get targetSpeed(): number {
    const playerTarget = this.maxSpeed * this.throttle;
    return this.scriptedSpeedLimit === null
      ? playerTarget
      : Math.min(playerTarget, Math.max(0, this.scriptedSpeedLimit));
  }

  setThrottle(value: number): void {
    this.throttle = Math.max(0, Math.min(1, value));
  }

  setModifiers(modifiers: MachineMovementModifiers): void {
    this.modifiers = {
      speedMultiplier: Math.max(0, modifiers.speedMultiplier),
      effectiveWeightMultiplier: Math.max(0.01, modifiers.effectiveWeightMultiplier),
      accelerationMultiplier: Math.max(0, modifiers.accelerationMultiplier),
    };
  }

  /**
   * Cap the physical target speed while preserving the player's throttle.
   * Passing null releases the cap and restores the target implied by the
   * player's current input.  This is used for exact expedition docking: a
   * throttle-zero command alone would stop short forever as the machine's
   * speed asymptotically approaches zero.
   */
  setScriptedSpeedLimit(value: number | null): void {
    this.scriptedSpeedLimit = value === null ? null : Math.max(0, value);
  }

  /** Compatibility alias for callers that express a scripted throttle. */
  setScriptedThrottle(value: number | null): void {
    this.setScriptedSpeedLimit(value === null ? null : this.maxSpeed * Math.max(0, Math.min(1, value)));
  }

  get currentScriptedSpeedLimit(): number | null {
    return this.scriptedSpeedLimit;
  }

  fixedUpdate(dt: number): void {
    const target = this.targetSpeed;
    // Frame-rate independent exponential approach.
    const t = 1 - Math.exp(-this.responsiveness * this.modifiers.accelerationMultiplier * dt * 6);
    this.speed += (target - this.speed) * t;
    if (this.speed < 1e-4 && target === 0) this.speed = 0;
  }
}
