import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WorkshopVisuals } from '@/machine/WorkshopVisuals';
import { MachineDamage } from '@/machine/MachineDamage';
import { DECK_SURFACE_Y } from '@/game/constants';
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';

function kit() {
  const scene = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial();
  const lamp = new THREE.MeshStandardMaterial({ color: 0x74ffd2 });
  lamp.name = 'Workshop_Status';
  const geometry = new THREE.BoxGeometry(0.2, 0.04, 0.2).translate(0, 0.025, 0);
  for (const name of ['NomadDriveCore', 'NomadLegServiceHatch']) {
    const root = new THREE.Group();
    root.name = name;
    root.add(new THREE.Mesh(geometry, steel), new THREE.Mesh(geometry, lamp));
    if (name === 'NomadDriveCore') {
      const rotor = new THREE.Group();
      rotor.name = 'DriveRotor';
      root.add(rotor);
    }
    scene.add(root);
  }
  return { model: { scene, clips: [] }, steel, lamp, geometry };
}

describe('workshop art ownership and service anchors', () => {
  it('fits the existing service locations and changes only owned condition materials', () => {
    const { model, steel, lamp, geometry } = kit();
    const fallback = new THREE.Group();
    const view = new WorkshopVisuals(fallback);
    view.apply(model);
    expect(fallback.visible).toBe(false);
    expect(view.root.children).toHaveLength(5);
    for (const id of Object.keys(SUBSYSTEMS) as SubsystemId[]) {
      const object = view.root.getObjectByName(`Workshop-${id}`)!;
      const at = SUBSYSTEMS[id].repairAt;
      expect(object.position.toArray()).toEqual(
        id === 'engine' ? [0, DECK_SURFACE_Y, 6] : [at.x, DECK_SURFACE_Y - 0.04, at.z],
      );
      const mesh = object.children[0] as THREE.Mesh;
      expect(mesh.geometry).toBe(geometry);
      expect(mesh.material).toBe(steel);
    }
    const damage = new MachineDamage();
    damage.damage('engine', 300);
    const originalColor = lamp.color.getHex();
    view.update(5, damage);
    const engineLamp = (view.root.getObjectByName('Workshop-engine')!.children[1] as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    expect(engineLamp.color.getHex()).toBe(0xff4433);
    expect(lamp.color.getHex()).toBe(originalColor);
    expect(model.scene.getObjectByName('DriveRotor')!.rotation.z).toBe(0);
    view.dispose();
  });

  it('repeated apply/reset releases mutable clones without disposing cache assets', () => {
    const { model, steel, lamp, geometry } = kit();
    const fallback = new THREE.Group();
    const view = new WorkshopVisuals(fallback);
    const borrowed = [
      vi.spyOn(steel, 'dispose'),
      vi.spyOn(lamp, 'dispose'),
      vi.spyOn(geometry, 'dispose'),
    ];
    for (let i = 0; i < 100; i++) {
      view.apply(model);
      const owned: ReturnType<typeof vi.spyOn>[] = [];
      view.root.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material !== steel)
          owned.push(vi.spyOn(object.material as THREE.Material, 'dispose'));
      });
      expect(owned).toHaveLength(5);
      view.apply(null);
      expect(view.root.children).toHaveLength(0);
      expect(fallback.visible).toBe(true);
      for (const spy of owned) expect(spy).toHaveBeenCalledTimes(1);
    }
    view.dispose();
    view.dispose();
    for (const spy of borrowed) expect(spy).not.toHaveBeenCalled();
  });

  it('rejects incomplete or oversized art and keeps the existing engine', () => {
    const { model } = kit();
    const fallback = new THREE.Group();
    const view = new WorkshopVisuals(fallback);
    model.scene
      .getObjectByName('NomadDriveCore')!
      .add(new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8)));
    view.apply(model);
    expect(view.root.children).toHaveLength(0);
    expect(fallback.visible).toBe(true);
    view.apply({ scene: new THREE.Group(), clips: [] });
    expect(fallback.visible).toBe(true);
    view.dispose();
  });
});
