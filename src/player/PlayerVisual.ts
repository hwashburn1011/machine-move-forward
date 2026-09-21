import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import { fitToCapsule } from '@/enemies/EnemyVisual';
import {
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_WALK_SPEED,
  PLAYER_SPRINT_SPEED,
} from '@/game/constants';
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
import {
  directionalBlend,
  directionalMotion,
  MOTION_DEADZONE,
  playerGait,
  type DirectionalMotion,
  type Gait,
} from './PlayerGait';
import { authoredLocomotionSpeed, footContactWeight } from './AnimationProfile';
import { PlayerFootPlacement, type GroundSampler } from './PlayerFootPlacement';
import { playerCombatSnapshot, type PlayerCombatClock } from './WeaponPresentation';
import { ReloadPresentation } from './ReloadPresentation';

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
  private gait: string | null = null;
  private readonly isS07: boolean = false;
  /**
   * The hand the weapon hangs off, or null when there is no rig to hang it on.
   *
   * A bone, not a socket on the group: a weapon parented to the body would
   * float beside the character while the arm swings. Parented to the wrist it
   * inherits the whole animation for free, which is the only way a held object
   * ever looks held.
   */
  private hand: THREE.Object3D | null = null;
  private leftHand: THREE.Object3D | null = null;
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
  private forearm: THREE.Object3D | null = null;
  private terminalMount: THREE.Group | null = null;
  private terminalOpen = false;
  private terminalPose = 0;
  private appliedTerminalPose = 0;
  private reducedMotion = false;
  private refuelMount: THREE.Group | null = null;
  private refuelActive = false;
  private refuelElapsed = 0;
  private static readonly REFUEL_DURATION = 0.9;
  private muzzle: THREE.Object3D | null = null;
  private attachment: THREE.Object3D | null = null;
  private attachmentId: string | null = null;
  private recoilNode: THREE.Group | null = null;
  private recoilRecovery = 18;
  private readonly recoilOffset = new THREE.Vector3();
  private readonly recoilRotation = new THREE.Euler();
  private footPlacement: PlayerFootPlacement | null = null;
  private pendingFeet: { left: THREE.Object3D; right: THREE.Object3D } | null = null;
  private footRig: import('./PlayerFootPlacement').FootRig = {};
  private reloadLayer: ReloadPresentation | null = null;
  private readonly activeDirectional: THREE.AnimationAction[] = [];
  private readonly directionalTargets = new Map<THREE.AnimationAction, number>();
  private directionalGait: 'walk' | 'run' | 'crouch_walk' | null = null;
  private grounded = false;
  private readonly stance = { left: 1, right: 1 };
  private readonly aimBones: THREE.Object3D[] = [];
  private aimPitch = 0;
  private aimYaw = 0;
  private readonly appliedAim = { pitch: 0, yaw: 0 };

  constructor(model: LoadedModel | null, materials: Materials) {
    if (!model) {
      const mesh = buildPlayerMesh(materials);
      mesh.position.y = -FOOT_OFFSET;
      this.object3D.add(mesh);
      return;
    }

    // SkeletonUtils, never Object3D.clone — the skeleton would be shared.
    const scene = cloneSkinned(model.scene);
    this.isS07 = scene.getObjectByName('S07_Rig') !== undefined;

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
    scene.rotation.y = this.isS07 || scene.getObjectByName('MMF_Player') ? 0 : Math.PI;
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const leftFoot = scene.getObjectByName('foot_l') ?? scene.getObjectByName('Foot.L');
    const rightFoot = scene.getObjectByName('foot_r') ?? scene.getObjectByName('Foot.R');
    if (leftFoot && rightFoot) this.pendingFeet = { left: leftFoot, right: rightFoot };
    const bone = (name: string) => scene.getObjectByName(name) ?? undefined;
    this.footRig = {
      pelvis: bone('pelvis'),
      leftThigh: bone('thigh_l'),
      rightThigh: bone('thigh_r'),
      leftCalf: bone('calf_l'),
      rightCalf: bone('calf_r'),
    };
    for (const name of ['spine', 'chest']) {
      const bone = scene.getObjectByName(name) ?? scene.getObjectByName(name.replace('_', '.'));
      if (bone) this.aimBones.push(bone);
    }
    this.object3D.add(scene);
    scene.updateWorldMatrix(true, true);
    if (leftFoot && rightFoot) {
      // The ankle joint is above the boot sole; probing it directly into the
      // deck would bury the boots. Derive clearance from this fitted rig once.
      this.footRig.soleHeight = Math.max(
        0,
        Math.min(
          0.2,
          (leftFoot.getWorldPosition(new THREE.Vector3()).y +
            rightFoot.getWorldPosition(new THREE.Vector3()).y) /
            2 +
            FOOT_OFFSET,
        ),
      );
    }

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
    this.hand =
      scene.getObjectByName('WeaponSocket') ?? (handName ? (bones.get(handName) ?? null) : null);
    const leftHandName = this.findHandName(boneNames, false);
    this.leftHand = leftHandName ? (bones.get(leftHandName) ?? null) : null;
    this.forearm = this.resolveForearm(scene, this.hand);

    // Rest offsets, which are pose-independent — so unlike the world-rotation
    // measurement this replaced, it does not matter that the mixer has not run.
    if (this.hand && !this.isS07) {
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
    this.reloadLayer = new ReloadPresentation(scene, model.clips);
  }

  setGroundSampler(sampler: GroundSampler | null): void {
    this.footPlacement =
      sampler && this.pendingFeet
        ? new PlayerFootPlacement(
            this.pendingFeet.left,
            this.pendingFeet.right,
            sampler,
            this.footRig,
          )
        : null;
  }

  setCombatPresentation(clock: PlayerCombatClock): void {
    const state = playerCombatSnapshot(clock);
    if (state.aiming || state.reloading) this.cancelRefuel();
    this.aimPitch = Math.max(-1.1, Math.min(1.1, state.aimPitch));
    this.aimYaw = Math.max(-0.8, Math.min(0.8, state.aimYaw));
    this.reloadLayer?.setState(state.weaponId, state.reloading, state.reloadProgress);
  }

  /** True when the player is drawn as the character model. */
  get isAnimated(): boolean {
    return this.mixer !== null;
  }

  /** Pick the gait from how fast the body is actually moving. */
  setMotion(
    speed: number,
    grounded: boolean,
    crouching = false,
    selfVelocity?: THREE.Vector3,
    cinematicGait?: 'walk' | 'run',
  ): void {
    this.grounded = grounded;
    if (!this.mixer) return;
    const next = playerGait(speed, grounded);
    const local = selfVelocity;
    const key =
      this.isS07 && local
        ? `${this.held !== null ? 'armed' : 'unarmed'}_${directionalMotion(local.x, local.z, crouching, grounded)}`
        : this.isS07
          ? s07MotionClip(speed, grounded, crouching, this.held !== null)
          : next;
    if (
      this.isS07 &&
      local &&
      this.held &&
      grounded &&
      Math.hypot(local.x, local.z) > MOTION_DEADZONE
    ) {
      const blend = directionalBlend(local.x, local.z);
      const gait = crouching
        ? 'crouch_walk'
        : (cinematicGait ??
          (speed >= (PLAYER_WALK_SPEED + PLAYER_SPRINT_SPEED) / 2 ? 'run' : 'walk'));
      const primary = this.actions.get(`armed_${gait}_${blend.primary}`);
      if (primary) {
        if (this.directionalGait !== gait) this.enterDirectionalGait(gait);
        const weights = directionalWeights(blend);
        const cadence = locomotionCadence(speed, gait, weights);
        for (const direction of DIRECTIONS) {
          const action = this.actions.get(`armed_${gait}_${direction}`);
          if (!action) continue;
          this.directionalTargets.set(action, weights[direction]);
          action.setEffectiveTimeScale(cadence);
        }
        this.gait = key;
        this.current = primary;
        return;
      }
    }
    if (this.activeDirectional.length) {
      for (const active of this.activeDirectional) active.fadeOut(CROSS_FADE);
      this.activeDirectional.length = 0;
      this.directionalTargets.clear();
      this.directionalGait = null;
      this.current = null;
    }
    if (key === this.gait) return;
    this.gait = key;

    const name = this.isS07
      ? this.clipNames.find((n) => n === key)
      : CLIPS[next]
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
    this.attachment = null;
    this.attachmentId = null;
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

  /** Mount the authored terminal to the resolved forearm, if this rig exposes one. */
  setWristTerminal(model: LoadedModel | null): void {
    this.terminalMount?.removeFromParent();
    this.terminalMount = null;
    if (!model || !this.forearm) return;
    const terminal = cloneSkinned(model.scene);
    terminal.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(terminal, true);
    const size = new THREE.Vector3();
    box.getSize(size);
    const width = Math.max(size.x, size.z, 1e-4);
    const scale = Math.min(0.15 / width, 0.22 / Math.max(size.y, 1e-4));
    terminal.scale.setScalar(scale);
    terminal.position.set(0, -0.01, 0);
    terminal.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    const mount = new THREE.Group();
    mount.name = 'wrist-terminal';
    mount.position.set(0, -0.015, 0.035);
    mount.rotation.set(0, 0, 0);
    mount.visible = this.terminalOpen;
    mount.add(terminal);
    this.forearm.add(mount);
    this.terminalMount = mount;
  }

  /** Render-time presentation state; simulation and input remain Game-owned. */
  setTerminalOpen(open: boolean): void {
    this.terminalOpen = open;
    if (this.terminalMount) this.terminalMount.visible = open;
    if (this.held) this.held.visible = !open && !this.refuelActive;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  /** Presentation-only refuel gesture. Gameplay fuel transfer remains immediate. */
  playRefuel(model: LoadedModel | null): void {
    this.cancelRefuel();
    const mountPoint = this.leftHand ?? this.hand;
    if (!model || !mountPoint) return;
    const canister = cloneSkinned(model.scene);
    canister.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(canister, true);
    const size = new THREE.Vector3();
    box.getSize(size);
    const longest = Math.max(size.x, size.y, size.z, 1e-4);
    canister.scale.setScalar(0.28 / longest);
    canister.position.set(0, -0.04, 0.035);
    canister.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    const mount = new THREE.Group();
    mount.name = 'refuel-canister';
    mount.position.set(0, -0.02, 0.03);
    mount.add(canister);
    mountPoint.add(mount);
    this.refuelMount = mount;
    this.refuelActive = true;
    this.refuelElapsed = 0;
    if (this.held) this.held.visible = false;
  }

  cancelRefuel(): void {
    this.refuelMount?.removeFromParent();
    this.refuelMount = null;
    this.refuelActive = false;
    this.refuelElapsed = 0;
    if (this.held) this.held.visible = !this.terminalOpen;
  }

  /** Add the authored attachment after fitting the gun, preserving its grip and scale. */
  setAttachment(id: string | null, source: THREE.Object3D | null): void {
    if (id === this.attachmentId) return;
    this.attachment?.removeFromParent();
    this.attachment = null;
    this.attachmentId = null;
    if (!id || !source || !this.recoilNode || !this.muzzle) return;
    const node = source.clone(true);
    node.name = 'weapon-attachment';
    this.held?.updateWorldMatrix(true, true);
    const at = this.muzzle.getWorldPosition(new THREE.Vector3());
    this.recoilNode.worldToLocal(at);
    node.position.copy(at);
    node.rotation.set(0, Math.PI, 0);
    if (id === 'rifle-burst-cam') node.position.add(new THREE.Vector3(0.125, 0, -0.57));
    else node.position.z += 0.045;
    this.recoilNode.add(node);
    this.attachment = node;
    this.attachmentId = id;
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
  update(dt: number, uiDt = dt): void {
    // Remove only the pose this presentation layer applied last frame. The
    // mixer (when present) then owns the base animation, so paused UI frames
    // cannot accumulate an arm rotation.
    if (this.forearm && this.appliedTerminalPose > 0) {
      this.forearm.rotation.x += 0.72 * this.appliedTerminalPose;
      this.forearm.rotation.y -= 0.18 * this.appliedTerminalPose;
      this.appliedTerminalPose = 0;
    }
    if (this.appliedAim.pitch !== 0 || this.appliedAim.yaw !== 0)
      for (const bone of this.aimBones) {
        bone.rotation.x -= this.appliedAim.pitch / this.aimBones.length;
        bone.rotation.y -= this.appliedAim.yaw / this.aimBones.length;
      }
    this.footPlacement?.resetApplied();
    this.reloadLayer?.resetApplied();
    const weightBlend = 1 - Math.exp(-Math.max(0, dt) / CROSS_FADE);
    for (const [action, target] of this.directionalTargets)
      action.setEffectiveWeight(
        THREE.MathUtils.lerp(action.getEffectiveWeight(), target, weightBlend),
      );
    this.mixer?.update(dt);
    if (this.refuelActive && this.refuelMount) {
      this.refuelElapsed += Math.max(0, dt);
      const progress = Math.min(1, this.refuelElapsed / PlayerVisual.REFUEL_DURATION);
      const gesture = Math.sin(progress * Math.PI);
      this.refuelMount.rotation.z = -0.85 * gesture;
      this.refuelMount.position.y = -0.02 + 0.025 * gesture;
      if (progress >= 1) this.cancelRefuel();
    }
    const terminalTarget = this.terminalOpen ? 1 : 0;
    const terminalBlend = 1 - Math.exp(-Math.max(0, uiDt) * 12);
    this.terminalPose = this.reducedMotion
      ? terminalTarget
      : this.terminalPose + (terminalTarget - this.terminalPose) * terminalBlend;
    if (this.forearm && this.terminalPose > 1e-4) {
      // Additive after the mixer: the authored gait remains the base pose and
      // closing the panel naturally restores it as the blend reaches zero.
      this.forearm.rotation.x -= 0.72 * this.terminalPose;
      this.forearm.rotation.y += 0.18 * this.terminalPose;
      this.appliedTerminalPose = this.terminalPose;
    }
    this.reloadLayer?.apply();
    if (this.aimBones.length) {
      const pitch = Math.max(-0.32, Math.min(0.32, this.aimPitch * 0.3));
      const yaw = Math.max(-0.24, Math.min(0.24, this.aimYaw * 0.3));
      for (const bone of this.aimBones) {
        bone.rotation.x += pitch / this.aimBones.length;
        bone.rotation.y += yaw / this.aimBones.length;
      }
      this.appliedAim.pitch = pitch;
      this.appliedAim.yaw = yaw;
    }
    const cycle = this.activeDirectional[0];
    const phase = cycle ? (cycle.time / cycle.getClip().duration) % 1 : 0;
    this.stance.right = this.directionalGait ? footContactWeight(phase, this.directionalGait) : 1;
    this.stance.left = this.directionalGait
      ? footContactWeight((phase + 0.5) % 1, this.directionalGait)
      : 1;
    this.footPlacement?.update(this.object3D.position, this.grounded, 1, this.stance);
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
    this.cancelRefuel();
    this.terminalMount?.removeFromParent();
    this.terminalMount = null;
    this.terminalOpen = false;
    this.terminalPose = 0;
    this.appliedTerminalPose = 0;
    if (this.held) this.held.visible = true;
    this.actions.clear();
  }

  private resolveForearm(
    scene: THREE.Object3D,
    hand: THREE.Object3D | null,
  ): THREE.Object3D | null {
    const candidates = [
      'LeftForeArm',
      'ForeArm.L',
      'forearm_l',
      'forearm.L',
      'arm_l',
      'RightForeArm',
      'ForeArm.R',
      'forearm_r',
      'forearm.R',
      'arm_r',
    ];
    for (const name of candidates) {
      const found = scene.getObjectByName(name);
      if (found) return found;
    }
    const parent = hand?.parent;
    return parent && ((parent as THREE.Bone).isBone || /forearm|arm/i.test(parent.name))
      ? parent
      : null;
  }

  private findHandName(names: readonly string[], right: boolean): string | null {
    const wants = right
      ? ['righthand', 'hand.r', 'hand_r', 'r_hand']
      : ['lefthand', 'hand.l', 'hand_l', 'l_hand'];
    const strip = (value: string) => value.toLowerCase().replace(/[:_\s.-]/g, '');
    for (const wanted of wants) {
      const key = strip(wanted);
      const match = names
        .filter((name) => strip(name).includes(key))
        .sort((a, b) => a.length - b.length)[0];
      if (match) return match;
    }
    return null;
  }

  private enterDirectionalGait(gait: 'walk' | 'run' | 'crouch_walk'): void {
    let phase = 0;
    const reference = this.activeDirectional[0];
    if (reference) phase = (reference.time / Math.max(reference.getClip().duration, 1e-6)) % 1;
    for (const active of this.activeDirectional) active.fadeOut(CROSS_FADE);
    this.activeDirectional.length = 0;
    this.directionalTargets.clear();
    this.current?.fadeOut(CROSS_FADE);
    for (const direction of DIRECTIONS) {
      const action = this.actions.get(`armed_${gait}_${direction}`);
      if (!action) continue;
      action.reset().play();
      action.time = phase * action.getClip().duration;
      action.setEffectiveWeight(0);
      this.activeDirectional.push(action);
      this.directionalTargets.set(action, 0);
    }
    this.directionalGait = gait;
  }
}

const DIRECTIONS: readonly DirectionalMotion[] = ['fwd', 'back', 'left', 'right'];
export function directionalWeights(
  blend: ReturnType<typeof directionalBlend>,
): Record<DirectionalMotion, number> {
  const weights = { fwd: 0, back: 0, left: 0, right: 0 };
  weights[blend.primary] = blend.secondary ? blend.primaryWeight : 1;
  if (blend.secondary) weights[blend.secondary] = blend.secondaryWeight;
  return weights;
}
export function locomotionCadence(
  speed: number,
  gait: 'walk' | 'run' | 'crouch_walk',
  weights: Record<DirectionalMotion, number>,
): number {
  const reference = DIRECTIONS.reduce(
    (sum, direction) => sum + weights[direction] * authoredLocomotionSpeed(gait, direction),
    0,
  );
  return THREE.MathUtils.clamp(
    Number.isFinite(speed) && reference > 1e-6 ? Math.abs(speed) / reference : 1,
    0.1,
    2.5,
  );
}

/** Exact names avoid matching an unarmed clip through the substring "armed". */
export function s07MotionClip(
  speed: number,
  grounded: boolean,
  crouching: boolean,
  armed: boolean,
): string {
  const gait =
    playerGait(speed, grounded) === 'idle'
      ? 'idle'
      : speed >= (PLAYER_WALK_SPEED + PLAYER_SPRINT_SPEED) / 2
        ? 'run'
        : 'walk';
  const motion = !grounded
    ? 'jump'
    : crouching
      ? `crouch_${gait === 'idle' ? 'idle' : 'walk'}`
      : gait;
  return `${armed ? 'armed' : 'unarmed'}_${motion}`;
}
