import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { LoadedModel } from '@/art/ModelLoader';
import { PlayerVisual } from '@/player/PlayerVisual';

function rig(): LoadedModel {
  const scene = new THREE.Group();
  const forearm = new THREE.Bone();
  forearm.name = 'forearm_r';
  const hand = new THREE.Bone();
  hand.name = 'hand_r';
  forearm.add(hand);
  scene.add(forearm);
  const leftForearm = new THREE.Bone();
  leftForearm.name = 'forearm_l';
  const leftHand = new THREE.Bone();
  leftHand.name = 'hand_l';
  leftForearm.add(leftHand);
  scene.add(leftForearm);
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 0.3), new THREE.MeshBasicMaterial()));
  return { scene, clips: [] };
}

describe('player wrist terminal presentation', () => {
  it('mounts on the resolved forearm, raises only while open, and restores held visibility on close', () => {
    const visual = new PlayerVisual(rig(), {} as never);
    const terminal = { scene: new THREE.Group(), clips: [] } as LoadedModel;
    terminal.scene.add(
      new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.04), new THREE.MeshBasicMaterial()),
    );
    visual.setWristTerminal(terminal);
    visual.setTerminalOpen(true);
    visual.update(0, 1 / 30);
    const mount = visual.object3D.getObjectByName('wrist-terminal');
    expect(mount).not.toBeNull();
    expect(mount?.visible).toBe(true);
    expect(visual.object3D.getObjectByName('forearm_l')?.rotation.x).toBeLessThan(0);
    const raised = visual.object3D.getObjectByName('forearm_l')?.rotation.x ?? 0;
    visual.update(0, 1 / 30);
    // The pose eases toward its target on the second paused frame; it must not
    // add the entire previous pose again.
    expect(visual.object3D.getObjectByName('forearm_l')?.rotation.x).toBeGreaterThan(raised - 0.2);
    visual.setTerminalOpen(false);
    visual.update(0, 1);
    expect(mount?.visible).toBe(false);
    expect(Math.abs(visual.object3D.getObjectByName('forearm_l')?.rotation.x ?? 0)).toBeLessThan(
      0.01,
    );
    visual.setReducedMotion(true);
    visual.setTerminalOpen(true);
    visual.update(0, 0.01);
    expect(visual.object3D.getObjectByName('forearm_l')?.rotation.x).toBeCloseTo(-0.72, 2);
    visual.dispose();
    expect(visual.object3D.getObjectByName('wrist-terminal')).toBeUndefined();
  });

  it('holds the authored fuel canister in the left hand, gestures, and expires cleanly', () => {
    const visual = new PlayerVisual(rig(), {} as never);
    const canister = { scene: new THREE.Group(), clips: [] } as LoadedModel;
    canister.scene.add(
      new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), new THREE.MeshBasicMaterial()),
    );

    visual.playRefuel(canister);
    const mount = visual.object3D.getObjectByName('refuel-canister');
    expect(mount?.parent?.name).toBe('hand_l');
    visual.update(0.2);
    expect(mount?.rotation.z).toBeLessThan(0);
    visual.update(0.8);
    expect(visual.object3D.getObjectByName('refuel-canister')).toBeUndefined();
    visual.playRefuel(canister);
    visual.setCombatPresentation({
      weaponId: null,
      aiming: false,
      aimPitch: 0,
      aimYaw: 0,
      reloading: true,
      reloadProgress: 0.2,
    });
    expect(visual.object3D.getObjectByName('refuel-canister')).toBeUndefined();
    visual.dispose();
  });
});
