import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import { fitToCapsule } from '@/enemies/EnemyVisual';
import { PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS } from '@/game/constants';
import { buildPlayerMesh } from './PlayerMesh';
import { findHandBone, fitHeldItem, heldItemRotation } from '@/art/HeldItem';
import { WEAPON_MODELS } from '@/data/weapon-models';
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
   * Rotation that cancels the hand bone's own resting orientation and leaves a
   * held item facing the way the character does.
   *
   * Captured in the constructor, which is the ONLY moment the rig is in its
   * bind pose — the mixer has not run yet. Measured at any later moment it
   * would instead cancel whatever the idle animation happened to be doing that
   * frame, and a weapon's resting angle would then depend on when the player
   * pressed 1 or 2. That is precisely the bug this replaced.
   */
  private readonly handAlign = new THREE.Quaternion();
  /** What is currently in that hand, so swapping weapons can take it out. */
  private held: THREE.Object3D | null = null;
  private heldId: string | null = null;

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
    scene.rotation.y = Math.PI;
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

    // Bind pose, before the mixer below exists. See `handAlign`.
    if (this.hand) {
      this.object3D.updateMatrixWorld(true);
      const boneWorld = new THREE.Quaternion();
      this.hand.getWorldQuaternion(boneWorld);
      const bodyWorld = new THREE.Quaternion();
      this.object3D.getWorldQuaternion(bodyWorld);
      this.handAlign.copy(boneWorld.invert().multiply(bodyWorld));
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
    if (!id || !model || !this.hand) return;

    const def = WEAPON_MODELS[id];
    if (!def) return;

    const item = model.clone(true);
    item.updateMatrixWorld(true);
    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(item, true).getSize(size);
    const fit = fitHeldItem(size, def.length);

    // A wrapper, so the measured alignment and the hand-tuned offset stay
    // separate. Writing both onto one node means that every time the model is
    // swapped the taste numbers have to be re-derived along with the maths.
    const mount = new THREE.Group();
    mount.name = 'held-weapon';

    // ALIGNMENT, MEASURED RATHER THAN TYPED IN. A hand bone's local axes are
    // whatever the rigger felt like: the Mixamo player and the Blender-export
    // scavenger disagree, and a hand-tuned Euler that suits one puts the other
    // through its own leg -- which is exactly what the first attempt did, and
    // it looked like a rifle carried muzzle-down through the hip.
    //
    // The gun still inherits the hand's MOTION, because it is still parented
    // to the bone; what it stops inheriting is the bone's arbitrary resting
    // orientation. See `handAlign` for why that is captured at construction.
    mount.quaternion.copy(this.handAlign);

    // Then the per-weapon tweak, in a frame a person can reason about: after
    // the alignment above, +Z is the way the character faces and +Y is up.
    mount.quaternion.multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(def.rotate.x, def.rotate.y, def.rotate.z),
      ),
    );

    item.scale.multiplyScalar(fit.scale);
    const aim = heldItemRotation(fit.longAxis);
    item.rotation.set(aim.x, aim.y, aim.z);
    item.position.set(def.grip.x, def.grip.y, def.grip.z);
    mount.add(item);

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
  }

  /** Advance the animation. Render step: `dt` is a frame delta, not a tick. */
  update(dt: number): void {
    this.mixer?.update(dt);
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.actions.clear();
  }
}
