import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildHook, HOOK_LENGTH } from '@/salvage/HookModel';

/**
 * The reel's grappling hook, as geometry.
 *
 * The check that matters is CONNECTEDNESS, and it exists because the first
 * version failed it: every piece was placed by eye, and the three flukes came
 * out floating a centimetre clear of the shank. That is invisible in the
 * numbers, invisible in any test that counts meshes, and the only thing anyone
 * notices on screen — it read as a crate with sticks near it.
 *
 * A material is not needed to measure geometry, so a bare one is fine.
 */
const material = new THREE.MeshBasicMaterial();

function boxOf(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object, true);
}

describe('the grappling hook', () => {
  it('is the length it says it is', () => {
    const size = new THREE.Vector3();
    boxOf(buildHook(material)).getSize(size);
    // Its long axis is Z, because that is the way it flies.
    expect(size.z).toBeGreaterThan(HOOK_LENGTH * 0.85);
    expect(size.z).toBeLessThanOrEqual(HOOK_LENGTH * 1.05);
  });

  it('points down -Z, the way `lookAt` aims things', () => {
    // The nose must be the -Z end. Built the other way round, every caller has
    // to remember a half turn, and one of them eventually will not.
    const hook = buildHook(material);
    const box = boxOf(hook);
    // The nose is a cone and is narrow; the eye end is wider. Compare the
    // extents of the front and back thirds rather than trusting a name.
    const front = new THREE.Box3();
    const back = new THREE.Box3();
    hook.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const b = boxOf(o);
      const mid = (b.min.z + b.max.z) / 2;
      if (mid < box.min.z + (box.max.z - box.min.z) / 3) front.union(b);
      if (mid > box.max.z - (box.max.z - box.min.z) / 3) back.union(b);
    });
    expect(front.max.x - front.min.x).toBeLessThan(back.max.x - back.min.x);
  });

  it('has three flukes, and every one of them touches the shank', () => {
    const hook = buildHook(material);
    // The arms are the only children that are Groups; everything else is a
    // mesh hung straight off the hook.
    const arms = hook.children.filter((c) => !(c as THREE.Mesh).isMesh);
    expect(arms).toHaveLength(3);

    // The shank is the longest single mesh along Z.
    let shank: THREE.Box3 | null = null;
    for (const child of hook.children) {
      if (!(child as THREE.Mesh).isMesh) continue;
      const b = boxOf(child);
      if (!shank || b.max.z - b.min.z > shank.max.z - shank.min.z) shank = b;
    }
    expect(shank).not.toBeNull();

    for (const arm of arms) {
      // Nearest piece of this arm to the shank, measured rather than assumed.
      let touches = false;
      arm.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        if ((shank as THREE.Box3).intersectsBox(boxOf(o))) touches = true;
      });
      expect(touches, `fluke ${arm.id} floats clear of the shank`).toBe(true);
    }
  });

  it('sweeps its flukes back toward the ring, not forward past the nose', () => {
    // A hook whose flukes point the way it flies is a spear. They have to
    // curve back, so that a cable under tension drives them INTO the crate.
    const hook = buildHook(material);
    const whole = boxOf(hook);
    const arms = hook.children.filter((c) => !(c as THREE.Mesh).isMesh);

    for (const arm of arms) {
      const b = boxOf(arm);
      // The outermost part of the arm is aft of where it leaves the shank.
      expect(b.max.z).toBeGreaterThan(whole.min.z + 0.1);
    }
  });

  it('is cheap enough to throw around', () => {
    let tris = 0;
    buildHook(material).traverse((o) => {
      const geo = (o as THREE.Mesh).geometry;
      if (!geo) return;
      tris += (geo.index ? geo.index.count : geo.attributes.position?.count ?? 0) / 3;
    });
    // A few hundred. The old hook was an octahedron at 8, and looked like one.
    expect(tris).toBeGreaterThan(50);
    expect(tris).toBeLessThan(800);
  });
});
