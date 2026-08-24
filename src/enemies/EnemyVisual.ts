import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import type { EnemyAIState } from './EnemyAI';
import { CAPSULE_FOOT_OFFSET, buildEnemyMesh } from './EnemyMesh';
import { FLASH_SECONDS, flashIntensity } from './HitFlash';
import {
  BAR_HEIGHT,
  BAR_WIDTH,
  healthBarColour,
  healthFraction,
} from './HealthBar';
import { hostileTint } from './ThreatLook';

/**
 * How an enemy looks.
 *
 * The pure parts — which clip a state should play, and how to sit a model
 * inside the collider — are free of Three.js and Rapier so the rules are
 * testable in node, matching `EnemyAI` and `BuildValidation`. The class below
 * is the part that needs a scene graph.
 */

/**
 * Clip names to try for each AI state, best first.
 *
 * Ordered rather than exact because clip names vary between packs, and a pack
 * missing one should degrade to a worse-matching clip rather than freeze. A
 * pursuing enemy with no Run clip should walk, not stand still while sprinting
 * at you.
 */
const CLIP_PREFERENCES: Record<EnemyAIState, readonly string[]> = {
  idle: ['idle'],
  navigate: ['walk', 'run'],
  pursue: ['run', 'walk'],
  attack: ['attack', 'punch', 'hit'],
  dead: ['death', 'die'],
};

/**
 * The clip to play for a state, or null when the model has none at all.
 *
 * Matches on substring and ignores case: real packs ship names like
 * `Armature|CharacterArmature_Walk`, and an exact match would find nothing.
 */
export function resolveClip(names: readonly string[], state: EnemyAIState): string | null {
  if (names.length === 0) return null;

  for (const wanted of CLIP_PREFERENCES[state]) {
    const found = names.find((name) => name.toLowerCase().includes(wanted));
    if (found) return found;
  }

  // Something is better than a character frozen in its bind pose.
  return names[0] ?? null;
}

export interface CapsuleFit {
  /** Uniform scale to apply to the model. */
  scale: number;
  /** Local Y offset that puts the model's feet on the capsule's base. */
  yOffset: number;
}

/**
 * Scale and lift a model so it fills the collider and stands on its feet.
 *
 * Derived from the capsule rather than hard-coded, so the drawn character and
 * the solid one cannot drift apart — a mismatch between what is drawn and what
 * is solid is the class of bug that put enemies inside the prow.
 */
export function fitToCapsule(
  modelHeight: number,
  modelMinY: number,
  capsuleHeight: number,
): CapsuleFit {
  // A zero-height model means a failed import. Returning Infinity here would
  // poison every transform downstream, so refuse to scale instead.
  const scale = modelHeight > 1e-6 ? capsuleHeight / modelHeight : 1;
  return { scale, yOffset: -modelMinY * scale };
}

/** Seconds to blend between animation states. */
const CROSS_FADE = 0.18;

/** Radians per second the fallback box topples at once it is dead. */
const TOPPLE_RATE = 2.6;

/** Colour a scavenger is driven towards when shot. */
const FLASH_COLOUR = new THREE.Color(0xff3020);

/** Emissive intensity added at the peak of a hit flash. */
const FLASH_INTENSITY = 4.5;

/**
 * How far the base colour is dragged towards the flash colour at the peak.
 *
 * Emissive alone was not enough to read. The deck is lit by a low orange sun
 * and everything on it is already warm, so a red glow against a red-lit hull
 * barely registers -- the first version measured correctly, looked like
 * nothing, and would have shipped as a fix that did not fix anything. Moving
 * the albedo as well changes the silhouette rather than its shading, which
 * survives whatever the sun is doing.
 */
const FLASH_ALBEDO = 0.75;

/** Height above the capsule's centre the health bar floats at. */
const BAR_Y = CAPSULE_FOOT_OFFSET + 0.32;

/** Colour of the eye band burning on the front of a scavenger's head. */
const EYE_COLOUR = 0xff4322;

/**
 * How one enemy looks: a box, or an animated character.
 *
 * Split from `Enemy` so that class keeps owning only where the enemy is and
 * what it is doing. Everything here is presentation and none of it feeds back
 * into the simulation.
 *
 * `object3D` is placed at the capsule's *centre* by `Enemy` every frame, so
 * the drop to the capsule's base is applied to the child rather than to
 * `object3D` itself — anything written to `object3D.position` here would be
 * overwritten on the first render.
 */
export class EnemyVisual {
  readonly object3D = new THREE.Group();

  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly clipNames: string[] = [];
  /** The box, when there is no model. Toppled by hand in place of a clip. */
  private readonly fallback: THREE.Group | null = null;
  private current: THREE.AnimationAction | null = null;
  private currentState: EnemyAIState | null = null;
  private deadFor = 0;
  /**
   * This enemy's own materials, with the emissive each started with.
   *
   * Cloned per visual because `SkeletonUtils.clone` shares materials between
   * clones exactly as it would share a skeleton: without this, shooting one
   * scavenger lights up every scavenger on the deck.
   */
  private readonly flashMaterials: {
    mat: THREE.MeshStandardMaterial;
    emissive: THREE.Color;
    intensity: number;
    colour: THREE.Color;
  }[] = [];
  private flashElapsed = FLASH_SECONDS;
  private appliedFlash = 0;
  /** Floating health bar: a backing plate and the fill that sits on it. */
  private readonly bar = new THREE.Group();
  private readonly barFill: THREE.Sprite;
  private appliedFraction = -1;

  constructor(model: LoadedModel | null, materials: Materials) {
    this.barFill = EnemyVisual.buildBar(this.bar);

    if (!model) {
      // The fallback, and the path every harness runs on.
      const mesh = buildEnemyMesh(materials);
      mesh.position.y = -CAPSULE_FOOT_OFFSET;
      this.object3D.add(mesh);
      this.fallback = mesh;
      // The procedural body is already built to look like a threat -- rusted
      // plate, hunched proportions, a red eye slit. Tinting it would only
      // undo a palette that was chosen on purpose.
      this.adoptMaterials(false);
      // Added last, so children[0] is always the body. adoptMaterials must
      // also run before it, or it would clone the bar's sprite materials and
      // the flash would drag the bar's colour around with it.
      this.object3D.add(this.bar);
      return;
    }

    // SkeletonUtils, never Object3D.clone: a plain clone shares the skeleton,
    // and every pooled enemy then animates as one, holding whichever pose the
    // last mixer to run produced.
    const scene = cloneSkinned(model.scene);

    // Precise, and only once the clone's matrices exist. The cheap path
    // measures each mesh's bind-pose bounding box, which for a skinned mesh is
    // the armature's whole reach rather than the body: it reported this model
    // as 147 units tall when its vertices span about 4.3. Everything
    // downstream was faithful to that lie -- the fit scaled the model by
    // 0.0129, so every scavenger rendered roughly five centimetres tall and
    // was in practice invisible. Enemies boarded, crossed the deck and
    // attacked, and the player saw an empty deck and health draining for no
    // reason, which is exactly what they reported twice.
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene, true);
    const size = new THREE.Vector3();
    box.getSize(size);
    const fit = fitToCapsule(size.y, box.min.y, CAPSULE_FOOT_OFFSET * 2);

    scene.scale.setScalar(fit.scale);
    scene.position.y = fit.yOffset - CAPSULE_FOOT_OFFSET;
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.object3D.add(scene);

    this.adoptMaterials(true);
    this.object3D.add(this.bar);
    this.object3D.add(EnemyVisual.buildEye(size, fit.scale));

    this.mixer = new THREE.AnimationMixer(scene);
    for (const clip of model.clips) {
      this.clipNames.push(clip.name);
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
  }

  /**
   * Build the floating bar.
   *
   * Sprites rather than a mesh so it faces the camera without this class
   * having to know where the camera is, and drawn with depth testing off so
   * cargo cannot hide a scavenger from the player. Seeing one through a crate
   * is a smaller problem than the one being solved: the player reported an
   * empty deck while one was aboard.
   */
  private static buildBar(group: THREE.Group): THREE.Sprite {
    const plate = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color: 0x14100c,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.72,
      }),
    );
    plate.scale.set(BAR_WIDTH + 0.07, BAR_HEIGHT + 0.05, 1);
    plate.renderOrder = 900;

    const fill = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color: healthBarColour(1),
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    );
    // Anchored at its left edge, so shrinking it empties the bar from the
    // right rather than from both ends at once.
    fill.center.set(0, 0.5);
    fill.position.x = -BAR_WIDTH / 2;
    fill.scale.set(BAR_WIDTH, BAR_HEIGHT, 1);
    fill.renderOrder = 901;

    group.add(plate, fill);
    group.position.y = BAR_Y;
    return fill;
  }

  /**
   * A lit band across the front of the head.
   *
   * The one cue the procedural body has and the model does not: something hot
   * and deliberate looking back at you. A plane rather than a sprite so it is
   * only visible from the front — eyes that follow you round the back of the
   * head would read as a bug.
   *
   * Placed from the model's own measured bounds rather than a guessed offset,
   * because a replacement model will not have this one's proportions.
   */
  private static buildEye(size: THREE.Vector3, scale: number): THREE.Mesh {
    const depth = size.z * scale;
    const eye = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.06),
      new THREE.MeshBasicMaterial({
        color: EYE_COLOUR,
        toneMapped: false,
        transparent: true,
        opacity: 0.95,
      }),
    );
    // Just below the crown, just proud of the face. The capsule's top is at
    // +CAPSULE_FOOT_OFFSET by construction, whatever the model's own size.
    eye.position.set(0, CAPSULE_FOOT_OFFSET - 0.2, depth * 0.5 + 0.01);
    eye.renderOrder = 5;
    return eye;
  }

  /** Set how full the bar is. Repeat calls at the same value are free. */
  setHealth(current: number, max: number): void {
    const f = healthFraction(current, max);
    if (f === this.appliedFraction) return;
    this.appliedFraction = f;

    this.barFill.scale.x = BAR_WIDTH * f;
    this.bar.visible = f > 0;
    (this.barFill.material as THREE.SpriteMaterial).color.setHex(healthBarColour(f));
  }

  /** True when this enemy is drawn as a model rather than the fallback box. */
  get isAnimated(): boolean {
    return this.mixer !== null;
  }

  /**
   * Take ownership of every material under this enemy.
   *
   * Shared materials are the norm everywhere else in the project and are the
   * right default — they are what makes one texture upload serve the whole
   * deck. They are wrong here for one reason: this class writes to them.
   */
  private adoptMaterials(tint: boolean): void {
    this.object3D.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const own = (m: THREE.Material): THREE.Material => {
        const clone = m.clone();
        const std = clone as THREE.MeshStandardMaterial;
        // Tint the clone, then record that as the baseline. The other way
        // round and every hit flash would end by restoring the friendly
        // colours the model shipped with.
        if (tint && std.color) {
          const t = hostileTint({ r: std.color.r, g: std.color.g, b: std.color.b });
          std.color.setRGB(t.r, t.g, t.b);
        }
        if (std.emissive) {
          this.flashMaterials.push({
            mat: std,
            emissive: std.emissive.clone(),
            intensity: std.emissiveIntensity,
            colour: std.color.clone(),
          });
        }
        return clone;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(own)
        : own(mesh.material);
    });
  }

  /**
   * Light this enemy up: it has just been shot.
   *
   * Applied here rather than left for the next render step, which is where the
   * decay runs. A frame can be longer than the whole flash -- under a software
   * renderer it routinely is -- and the first update would then step straight
   * past the curve and apply nothing at all, so the hit that killed something
   * showed no reaction whatsoever.
   */
  flash(): void {
    this.flashElapsed = 0;
    this.applyFlash(1);
  }

  /**
   * Drive the emissive towards the flash colour.
   *
   * Skipped entirely when nothing has changed, so an untouched scavenger costs
   * one comparison a frame rather than a write to every material it owns.
   */
  private applyFlash(k: number): void {
    if (k === this.appliedFlash) return;
    this.appliedFlash = k;
    for (const rec of this.flashMaterials) {
      rec.mat.emissive.copy(rec.emissive).lerp(FLASH_COLOUR, k);
      rec.mat.emissiveIntensity = rec.intensity + k * FLASH_INTENSITY;
      rec.mat.color.copy(rec.colour).lerp(FLASH_COLOUR, k * FLASH_ALBEDO);
    }
  }

  /** Cross-fade to the clip for an AI state. Repeat calls for a state are free. */
  setState(state: EnemyAIState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    this.deadFor = 0;
    // A corpse is not a threat and does not need a bar hanging over it.
    this.bar.visible = state !== 'dead';

    // The box has no clips; `update` topples it instead.
    if (!this.mixer) return;

    const name = resolveClip(this.clipNames, state);
    const next = name ? this.actions.get(name) : undefined;
    if (!next || next === this.current) return;

    // Death holds its final pose. Left looping, the corpse springs back
    // upright partway through its despawn timer.
    if (state === 'dead') {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }

    next.reset().play();
    if (this.current) this.current.crossFadeTo(next, CROSS_FADE, false);
    this.current = next;
  }

  /**
   * Return to the bind pose and forget which clip was playing.
   *
   * Called when a pooled enemy respawns. Without it a scavenger reused after a
   * death keeps `currentState === 'dead'`, and `setState` — which ignores
   * repeat calls for a state — never restarts it walking.
   */
  reset(): void {
    this.current = null;
    this.currentState = null;
    this.deadFor = 0;
    this.flashElapsed = FLASH_SECONDS;
    this.applyFlash(0);
    this.bar.visible = true;
    this.appliedFraction = -1;
    this.mixer?.stopAllAction();
    if (this.fallback) this.fallback.rotation.z = 0;
  }

  /**
   * Advance the animation.
   *
   * Driven from the render step, where a real frame delta exists. Advancing it
   * on the fixed step instead makes playback stutter whenever frame rate and
   * tick rate disagree, which is most of the time.
   */
  update(dt: number): void {
    if (this.flashElapsed < FLASH_SECONDS) {
      this.flashElapsed += dt;
      this.applyFlash(flashIntensity(this.flashElapsed, FLASH_SECONDS));
    }

    if (this.mixer) {
      this.mixer.update(dt);
      return;
    }

    // No clips to play, so the box keeps the hand-animated death it has always
    // had: it topples over rather than standing bolt upright until it vanishes.
    if (this.fallback && this.currentState === 'dead') {
      this.deadFor += dt;
      this.fallback.rotation.z = Math.min(this.deadFor * TOPPLE_RATE, Math.PI / 2);
    }
  }

  dispose(): void {
    this.reset();
    for (const sprite of this.bar.children) {
      (sprite as THREE.Sprite).material.dispose();
    }
    this.bar.clear();
    for (const rec of this.flashMaterials) rec.mat.dispose();
    this.flashMaterials.length = 0;
    this.mixer?.stopAllAction();
    this.actions.clear();
    this.clipNames.length = 0;
    this.current = null;
    this.currentState = null;
  }
}
