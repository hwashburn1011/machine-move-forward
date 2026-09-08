import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerVisual } from '@/player/PlayerVisual';

function fixture() {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.4), new THREE.MeshStandardMaterial()));
  const hand = new THREE.Bone();
  hand.name = 'Hand.R';
  hand.position.set(0.3, 0.6, 0);
  const index = new THREE.Bone();
  index.name = 'Index';
  index.position.set(0.1, 0.2, 0.05);
  hand.add(index);
  const thumb = new THREE.Bone();
  thumb.name = 'Thumb';
  thumb.position.set(0.1, 0, 0.1);
  hand.add(thumb);
  scene.add(hand);
  const visual = new PlayerVisual({ scene, clips: [] }, {} as never);
  const weapon = new THREE.Group();
  weapon.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 1), new THREE.MeshStandardMaterial()));
  const muzzle = new THREE.Object3D();
  muzzle.name = 'Muzzle';
  muzzle.position.z = 0.5;
  weapon.add(muzzle);
  visual.setHeldWeapon('rifle', weapon);
  return { visual, weapon };
}

describe('held weapon recoil', () => {
  it('preserves rig-derived grip orientation at rest and during recoil', () => {
    const { visual } = fixture();
    const mount = visual.object3D.getObjectByName('held-weapon')!;
    const rotation = mount.quaternion.clone();
    const rest = visual.getMuzzleWorldPosition();
    visual.update(1 / 60);
    expect(mount.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
    expect(visual.getMuzzleWorldPosition().distanceTo(rest)).toBeLessThan(1e-6);
    visual.kickHeldWeapon(0.02, 0.03, 0.01);
    visual.update(1 / 60);
    expect(mount.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
    expect(visual.getMuzzleWorldPosition().distanceTo(rest)).toBeGreaterThan(0.001);
    visual.update(2);
    expect(visual.getMuzzleWorldPosition().distanceTo(rest)).toBeLessThan(1e-6);
  });
  it('clears the previous weapon kick when equipping a different weapon', () => {
    const { visual, weapon } = fixture();
    visual.kickHeldWeapon(0.02, 0.03, 0.01);
    visual.update(1 / 60);
    visual.setHeldWeapon('shotgun', weapon);
    visual.update(1 / 60);
    const node = visual.object3D.getObjectByName('held-weapon-recoil')!;
    expect(node.position.length()).toBe(0);
    expect(node.rotation.x).toBe(0);
    expect(node.rotation.y).toBe(0);
  });
});
