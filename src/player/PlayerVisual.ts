import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import { fitToCapsule } from '@/enemies/EnemyVisual';
import { PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS } from '@/game/constants';
import { buildPlayerMesh } from './PlayerMesh';
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
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.object3D.add(scene);

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

  /** Advance the animation. Render step: `dt` is a frame delta, not a tick. */
  update(dt: number): void {
    this.mixer?.update(dt);
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.actions.clear();
  }
}
