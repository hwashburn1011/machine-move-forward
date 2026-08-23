import * as THREE from 'three';
import type { EventBus } from '@/core/events/EventBus';
import type { InputManager } from '@/core/input/InputManager';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { PlayerCamera } from './PlayerCamera';
import { Weapon, type WeaponSave } from '@/combat/Weapon';
import { computeDamage } from '@/combat/DamageSystem';
import { DEFAULT_WEAPON_ORDER, WEAPONS } from '@/data/weapons';
import { AMMO_FOR_WEAPON, type ItemId } from '@/data/items';
import { Rng } from '@/core/math/Random';
import type RAPIER from '@dimforge/rapier3d-compat';

/** Anything a shot can hurt. Enemies register themselves as collider userData. */
export interface Damageable {
  kind: 'enemy';
  id: string;
  armor: number;
  takeDamage(amount: number): void;
}

function isDamageable(v: unknown): v is Damageable {
  return typeof v === 'object' && v !== null && (v as Damageable).kind === 'enemy';
}

/**
 * Player firing, aiming, and reloading (handoff section 18).
 *
 * Shots are hitscan raycasts from the camera, so where the crosshair is IS
 * where the bullet goes — no muzzle-to-crosshair parallax to explain away.
 */
export class PlayerCombat {
  private readonly weapons = new Map<string, Weapon>();
  private currentId: string;
  private time = 0;

  /** Seeded so recoil and spread patterns are reproducible in tests. */
  private readonly rng = new Rng(0xc0ffee);

  private readonly origin = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  /**
   * The shooter's own collider. Shots originate at the camera, which sits
   * behind the player in third person, so without this every bullet stops in
   * the player's own back.
   */
  private ignoreCollider: RAPIER.Collider | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly physics: PhysicsWorld,
  ) {
    for (const id of DEFAULT_WEAPON_ORDER) {
      const def = WEAPONS[id];
      if (def) this.weapons.set(id, new Weapon(def));
    }
    this.currentId = DEFAULT_WEAPON_ORDER[0];
  }

  setShooterCollider(collider: RAPIER.Collider): void {
    this.ignoreCollider = collider;
  }

  get current(): Weapon {
    return this.weapons.get(this.currentId) as Weapon;
  }

  /** Current cone half-angle in degrees, accounting for aim. */
  currentSpread(aiming: boolean): number {
    return aiming ? this.current.def.aimSpread : this.current.def.spread;
  }

  equip(id: string): void {
    if (!this.weapons.has(id) || id === this.currentId) return;
    this.current.cancelReload();
    this.currentId = id;
    this.bus.emit('weapon:equipped', { weaponId: id });
  }

  giveAmmo(amount: number): void {
    this.current.addReserve(amount);
  }

  /** Every weapon the player owns, for saving and for the mod lookup. */
  get all(): Weapon[] {
    return [...this.weapons.values()];
  }

  weapon(id: string): Weapon | undefined {
    return this.weapons.get(id);
  }

  /**
   * Route crafted rounds to the gun that fires them, rather than to whatever
   * happens to be equipped — crafting shotgun shells while holding the rifle
   * should still fill the shotgun.
   */
  addAmmoFor(itemId: ItemId, count: number): boolean {
    const weaponId = Object.keys(AMMO_FOR_WEAPON).find((id) => AMMO_FOR_WEAPON[id] === itemId);
    const weapon = weaponId ? this.weapons.get(weaponId) : undefined;
    if (!weapon || count <= 0) return false;
    weapon.addReserve(count);
    return true;
  }

  /** Fit a mod to the equipped weapon. False if it does not apply or is already fitted. */
  applyMod(itemId: ItemId): boolean {
    if (itemId !== 'extended-mag') return false;
    return this.current.applyMagazineMod();
  }

  serialise(): WeaponSave[] {
    return this.all.map((weapon) => weapon.serialise());
  }

  restore(saves: WeaponSave[]): void {
    for (const save of saves) this.weapons.get(save.id)?.restore(save);
  }

  fixedUpdate(dt: number, input: InputManager, camera: PlayerCamera): void {
    this.time += dt;
    const weapon = this.current;

    if (weapon.fixedUpdate(this.time)) {
      this.bus.emit('weapon:reload-finished', {
        weaponId: weapon.def.id,
        ammoRemaining: weapon.ammoInMag,
      });
    }

    if (input.consumePressed('slot1')) this.equip('rifle');
    if (input.consumePressed('slot2')) this.equip('shotgun');

    if (input.consumePressed('reload') && weapon.startReload(this.time)) {
      this.bus.emit('weapon:reload-started', {
        weaponId: weapon.def.id,
        durationMs: weapon.def.reloadTime * 1000,
      });
    }

    if (!input.isDown('fire')) return;

    if (weapon.isEmpty && !weapon.reloading) {
      // Dry fire once, then auto-reload — hunting for R mid-fight is friction
      // with no upside.
      if (input.consumePressed('fire')) {
        this.bus.emit('weapon:dry-fire', { weaponId: weapon.def.id });
      }
      if (weapon.startReload(this.time)) {
        this.bus.emit('weapon:reload-started', {
          weaponId: weapon.def.id,
          durationMs: weapon.def.reloadTime * 1000,
        });
      }
      return;
    }

    if (!weapon.tryFire(this.time)) return;
    this.fireShot(weapon, camera);
  }

  private fireShot(weapon: Weapon, camera: PlayerCamera): void {
    const def = weapon.def;
    const spreadDeg = this.currentSpread(camera.isAiming);
    const spreadRad = THREE.MathUtils.degToRad(spreadDeg);

    this.origin.copy(camera.muzzleOrigin);
    const forward = camera.forward;

    // Build a basis around the aim direction so spread is a proper cone.
    this.right.set(forward.z, 0, -forward.x).normalize();
    if (this.right.lengthSq() < 1e-6) this.right.set(1, 0, 0);
    this.up.crossVectors(this.right, forward).normalize();

    for (let pellet = 0; pellet < def.pellets; pellet++) {
      // Uniform over the disc, not the radius — sampling the radius linearly
      // clusters pellets in the centre.
      const angle = this.rng.next() * Math.PI * 2;
      const radius = Math.sqrt(this.rng.next()) * spreadRad;

      this.direction
        .copy(forward)
        .addScaledVector(this.right, Math.cos(angle) * radius)
        .addScaledVector(this.up, Math.sin(angle) * radius)
        .normalize();

      const hit = this.physics.raycast(
        this.origin,
        this.direction,
        def.range,
        this.ignoreCollider ?? undefined,
      );
      if (!hit) continue;

      const target = hit.userData;
      const damageable = isDamageable(target) ? target : null;
      const damage = computeDamage(
        def.damage,
        hit.distance,
        def.range,
        def.falloffStart,
        damageable?.armor ?? 0,
      );
      if (damageable && damage > 0) damageable.takeDamage(damage);

      this.bus.emit('combat:hit', {
        position: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
        targetId: damageable?.id ?? null,
        onMetal: !damageable,
      });
    }

    // Recoil: mostly vertical, with a smaller random horizontal component.
    camera.addRecoil(
      THREE.MathUtils.degToRad(def.recoil),
      THREE.MathUtils.degToRad(def.recoil * this.rng.signed(0.35)),
    );

    this.bus.emit('weapon:fired', {
      weaponId: def.id,
      ammoRemaining: weapon.ammoInMag,
    });
  }
}
