import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerFade } from '@/player/PlayerFade';
import { InteractionHighlight } from '@/interaction/InteractionHighlight';

describe('presentation lifecycle bounds', () => {
  it('reuses owned fade materials and restores originals over 100 cycles', () => {
    const root = new THREE.Group();
    const original = new THREE.MeshStandardMaterial({ color: 0xaa7744 });
    original.onBeforeCompile = () => {};
    original.customProgramCacheKey = () => 'authored-heightfog';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), original);
    root.add(mesh);
    const fade = new PlayerFade();
    const owned = new Set<THREE.Material>();
    for (let i = 0; i < 100; i++) {
      fade.apply(root, 1.35, 1 / 60);
      expect(mesh.material).not.toBe(original);
      owned.add(mesh.material);
      expect(mesh.material.onBeforeCompile).toBe(original.onBeforeCompile);
      expect(mesh.material.customProgramCacheKey()).toBe('authored-heightfog');
      for (let frame = 0; frame < 60; frame++) fade.apply(root, 2, 1 / 60);
      expect(mesh.material).toBe(original);
    }
    expect(owned.size).toBe(1);
    // Opening/load and an equipment change keep the body's compiled variant.
    fade.retainFor(root);
    fade.apply(root, 1.35, 1 / 60);
    expect(owned.has(mesh.material)).toBe(true);
    const weapon = new THREE.Mesh(new THREE.BoxGeometry(), original);
    root.add(weapon);
    fade.apply(root, 1.35, 1 / 60);
    let disposed = false;
    weapon.material.addEventListener('dispose', () => {
      disposed = true;
    });
    weapon.removeFromParent();
    fade.retainFor(root);
    expect(disposed).toBe(true);
    expect(weapon.material).toBe(original);
    weapon.geometry.dispose();
    fade.dispose();
    mesh.geometry.dispose();
    original.dispose();
  });

  it('skips fully faded geometry and restores visibility through load and disposal', () => {
    const root = new THREE.Group();
    const fade = new PlayerFade();
    for (let cycle = 0; cycle < 100; cycle++) {
      fade.apply(root, 0.85);
      expect(root.visible).toBe(false);
      fade.restore();
      expect(root.visible).toBe(true);
    }
    fade.apply(root, 0.85);
    fade.dispose();
    expect(root.visible).toBe(true);
    root.visible = false;
    fade.apply(root, 0.85);
    fade.restore();
    expect(root.visible).toBe(false);
  });

  it('keeps one highlight geometry/material and clears targets safely', () => {
    const highlight = new InteractionHighlight();
    const target = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1));
    for (let i = 0; i < 100; i++) {
      highlight.setTarget({ id: 'crate', object: target, usable: true });
      expect(highlight.object.visible).toBe(true);
      highlight.clear();
      expect(highlight.object.visible).toBe(false);
    }
    highlight.setTarget({ id: 'blocked', object: target, usable: true, occluded: true });
    expect(highlight.object.visible).toBe(false);
    highlight.dispose();
    target.geometry.dispose();
  });
});
