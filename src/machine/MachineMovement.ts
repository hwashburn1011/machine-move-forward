import { BASE_MACHINE_SPEED, REFERENCE_WEIGHT } from '@/game/constants';

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
    const ratio = Math.max(this.totalWeight, 1) / REFERENCE_WEIGHT;
    return (BASE_MACHINE_SPEED * this.enginePower * this.legScale) / Math.sqrt(ratio);
  }

  get targetSpeed(): number {
    return this.maxSpeed * this.throttle;
  }

  setThrottle(value: number): void {
    this.throttle = Math.max(0, Math.min(1, value));
  }

  fixedUpdate(dt: number): void {
    const target = this.targetSpeed;
    // Frame-rate independent exponential approach.
    const t = 1 - Math.exp(-this.responsiveness * dt * 6);
    this.speed += (target - this.speed) * t;
    if (this.speed < 1e-4 && target === 0) this.speed = 0;
  }
}
