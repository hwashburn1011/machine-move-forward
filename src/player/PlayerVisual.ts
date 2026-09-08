import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import { fitToCapsule } from '@/enemies/EnemyVisual';
import { PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS } from '@/game/constants';
import { buildPlayerMesh } from './PlayerMesh';
import {
  findHandBone,
  fitHeldItem,
  handGripAlign,
  handGripAxes,
  weaponAlign,
} from '@/art/HeldItem';
import { WEAPON_MODELS } from '@/data/weapon-models';
import { WEAPONS } from '@/data/weapons';
import { playerGait, type Gait } from './PlayerGait';

/**
 * How the player looks.
 *
 * The player is on screen from behind for the entire game, so this is the most
 * looked-at object in it. Same split as `EnemyVisual`: `Player` owns where it
 * is and what it is doing, this owns how it appears.
 */

/** Distance from the capsule's centre down to the ground it stands on. */
const FOOT_OFFSET = PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS;

/** Seconds to blend between gaits. */
const CROSS_FADE = 0.16;

/** Clip names to try for each gait, best first. */
const CLIPS: Record<Gait, readonly string[]> = {
  idle: ['idle'],
  walk: ['walk'],
  run: ['run', 'walk'],
};

export class PlayerVisual {
  readonly object3D = new THREE.Group();

  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly clipNames: string[] = [];
  private current: THREE.AnimationAction | null = null;
  private gait: Gait | null = null;
  /**
   * The hand the weapon hangs off, or null when there is no rig to hang it on.
   *
   * A bone, not a socket on the group: a weapon parented to the body would
   * float beside the character while the arm swings. Parented to the wrist it
   * inherits the whole animation for free, which is the only way a held object
   * ever looks held.
   */
  private hand: THREE.Object3D | null = null;
  /**
   * Where a weapon sits in this rig's fist, in the hand bone's OWN frame.
   *
   * A constant, and deliberately so: a held object does not move relative to
   * the hand holding it, so nothing here needs re-measuring per frame, per
   * clip, or per weapon swap. It is read off the finger bones' rest offsets,
   * which animation never touches — see `handGripAxes`.
   *
   * The field this replaces held the inverse of the hand's bind-pose WORLD
   * rotation, which sounds similar and is not: it made the weapon level with
   * the body in the bind pose and nowhere else, so a rifle sat correctly in a
   * T-pose the player never strikes and hung through the thigh in every pose
   * they do.
   */
  private readonly gripAlign = new THREE.Quaternion();
  /** What is currently in that hand, so swapping weapons can take it out. */
  private held: THREE.Object3D | null = null;
  private heldId: string | null = null;
  private muzzle: THREE.Object3D | null = null;
  private recoilNode: THREE.Group | null = null;
  private recoilRecovery = 18;
  private readonly recoilOffset = new THREE.Vector3();
  private readonly recoilRotation = new THREE.Euler();

  constructor(model: LoadedModel | null, materials: Materials) {
    if (!model) {
      const mesh = buildPlayerMesh(materials);
      mesh.position.y = -FOOT_OFFSET;
      this.object3D.add(mesh);
      return;
    }

    // SkeletonUtils, never Object3D.clone — the skeleton would be shared.
    const scene = cloneSkinned(model.scene);

    // Precise, and only once the matrices exist. The cheap path measures each
    // mesh's bind-pose bounding box, which for a skinned mesh is the
    // armature's whole reach rather than the body. That mistake shipped once
    // already and rendered every scavenger six centimetres tall.
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene, true);
    const size = new THREE.Vector3();
    box.getSize(size);
    const fit = fitToCapsule(size.y, box.min.y, FOOT_OFFSET * 2);

    scene.scale.setScalar(fit.scale);
    scene.position.y = fit.yOffset - FOOT_OFFSET;
    // The rest of the project points things with rotation.y = atan2(x, z),
    // which aims local +Z along the heading. This model is authored facing -Z,
    // the glTF convention, so without half a turn here it walks backwards
    // everywhere it goes.
    scene.rotation.y = scene.getObjectByName('MMF_Player') ? 0 : Math.PI;
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.object3D.add(scene);

    // Found once. Walking the graph per weapon swap would be wasteful, and the
    // rig does not change under us.
    const boneNames: string[] = [];
    const bones = new Map<string, THREE.Object3D>();
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        boneNames.push(o.name);
        if (!bones.has(o.name)) bones.set(o.name, o);
      }
    });
    const handName = findHandBone(boneNames);
    this.hand = handName ? (bones.get(handName) ?? null) : null;

    // Rest offsets, which are pose-independent — so unlike the world-rotation
    // measurement this replaced, it does not matter that the mixer has not run.
    if (this.hand) {
      this.gripAlign.copy(
        handGripAlign(
          handGripAxes(
            this.hand.children
              .filter((o) => (o as THREE.Bone).isBone)
              .map((o) => ({ name: o.name, offset: o.position })),
          ),
        ),
      );
    }

    this.mixer = new THREE.AnimationMixer(scene);
    for (const clip of model.clips) {
      this.clipNames.push(clip.name);
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
  }

  /** True when the player is drawn as the character model. */
  get isAnimated(): boolean {
    return this.mixer !== null;
  }

  /** Pick the gait from how fast the body is actually moving. */
  setMotion(speed: number, grounded: boolean): void {
    if (!this.mixer) return;
    const next = playerGait(speed, grounded);
    if (next === this.gait) return;
    this.gait = next;

    const name = CLIPS[next]
      .map((want) => this.clipNames.find((n) => n.toLowerCase().includes(want)))
      .find((n): n is string => n !== undefined);
    const action = name ? this.actions.get(name) : undefined;
    if (!action || action === this.current) return;

    action.reset().play();
    if (this.current) this.current.crossFadeTo(action, CROSS_FADE, false);
    this.current = action;
  }

  /** True when a weapon could actually be put in a hand. */
  get canHoldWeapon(): boolean {
    return this.hand !== null;
  }

  /**
   * Put a weapon in the player's hand, or take the current one out.
   *
   * The model is cloned per call rather than shared: `Object3D` has one parent,
   * so handing the same instance to two visuals would silently move it from
   * the first to the second — the bug `SkeletonUtils` exists to avoid one level
   * up. Cheap here, because a gun is a few hundred triangles and this fires
   * only on a weapon swap.
   */
  setHeldWeapon(id: string | null, model: THREE.Object3D | null): void {
    if (id === this.heldId) return;
    this.heldId = id;

    if (this.held) {
      this.held.removeFromParent();
      this.held = null;
    }
    this.muzzle = null;
    this.recoilNode = null;
    this.recoilOffset.set(0, 0, 0);
    this.recoilRotation.set(0, 0, 0);
    if (!id || !model || !this.hand) return;

    const def = WEAPON_MODELS[id];
    if (!def) return;
    this.recoilRecovery = WEAPONS[id]?.heldKick?.recovery ?? 18;

    const item = model.clone(true);
    item.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(item, true);
    const fit = fitHeldItem({ min: box.min, max: box.max }, def.length);

    // Three nested nodes, one job each, because collapsing any two of them
    // makes the other two impossible to reason about:
    //
    //   mount    where the fist is        — rig-derived, never hand-tuned
    //   aligned  which way the gun lies   — model-derived, never hand-tuned
    //   item     the author's file        — left exactly as it was measured
    //
    // In particular `item` keeps whatever transform it arrived with. Writing
    // the alignment onto the model's own root, as the previous version did,
    // silently invalidates the bounding box that alignment was derived from.
    const mount = new THREE.Group();
    mount.name = 'held-weapon';

    // The fist, plus the per-weapon roll about the barrel, which is the one
    // degree of freedom a fist does not pin. See `handGripAlign`.
    mount.quaternion
      .copy(this.gripAlign)
      .multiply(
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(def.rotate.x, def.rotate.y, def.rotate.z),
        ),
      );

    const aligned = new THREE.Group();
    aligned.name = 'held-weapon-aligned';
    aligned.quaternion.copy(weaponAlign(fit));
    aligned.scale.setScalar(fit.scale);
    // Children of `mount` are in the canonical weapon frame, so this offset
    // reads the way the data file describes it: +Z toward the muzzle, +Y up
    // through the sights, +X out of the shooter's right.
    aligned.position.set(def.grip.x, def.grip.y, def.grip.z);
    aligned.add(item);
    const recoil = new THREE.Group();
    recoil.name = 'held-weapon-recoil';
    recoil.add(aligned);
    mount.add(recoil);
    this.recoilNode = recoil;

    item.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    // The hand bone lives inside a scene that has been scaled to fit the
    // capsule, so anything parented to it inherits that scale. Undo it, or a
    // weapon sized in metres arrives at whatever fraction of a metre the
    // character happened to need.
    const inherited = new THREE.Vector3();
    this.hand.getWorldScale(inherited);
    const undo = inherited.x > 1e-6 ? 1 / inherited.x : 1;
    mount.scale.setScalar(undo);

    this.hand.add(mount);
    this.held = mount;
    this.muzzle = item.getObjectByName('Muzzle') ?? null;
    if (!this.muzzle) {
      // Authored models without a socket still get a finite, stable marker in
      // the canonical held-item frame. The model's fit axis is already mapped
      // to +Z by `weaponAlign`, so this is the only safe fallback.
      const marker = new THREE.Object3D();
      marker.name = 'MuzzleFallback';
      marker.position.set(0, 0, def.length * 0.5);
      aligned.add(marker);
      this.muzzle = marker;
    }
  }

  /** World-space origin for presentation effects; never used for hitscan. */
  getMuzzleWorldPosition(out = new THREE.Vector3()): THREE.Vector3 {
    if (this.muzzle) {
      this.object3D.updateMatrixWorld(true);
      return this.muzzle.getWorldPosition(out);
    }
    return out.copy(this.object3D.getWorldPosition(new THREE.Vector3()));
  }

  /** Apply bounded visual kick; camera recoil remains the aiming feedback. */
  kickHeldWeapon(distance: number, pitch: number, yaw: number): void {
    if (!this.held) return;
    this.recoilOffset.z = Math.max(-0.08, Math.min(0.08, this.recoilOffset.z - Math.abs(distance)));
    this.recoilRotation.x = Math.max(-0.25, Math.min(0.25, this.recoilRotation.x + pitch));
    this.recoilRotation.y = Math.max(-0.25, Math.min(0.25, this.recoilRotation.y + yaw));
  }

  /** Advance the animation. Render step: `dt` is a frame delta, not a tick. */
  update(dt: number): void {
    this.mixer?.update(dt);
    if (!this.recoilNode) return;
    const recovery = 1 - Math.exp(-Math.max(0, dt) * this.recoilRecovery);
    this.recoilOffset.multiplyScalar(1 - recovery);
    this.recoilRotation.x *= 1 - recovery;
    this.recoilRotation.y *= 1 - recovery;
    this.recoilNode.position.z = this.recoilOffset.z;
    this.recoilNode.rotation.x = this.recoilRotation.x;
    this.recoilNode.rotation.y = this.recoilRotation.y;
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.actions.clear();
  }
}
