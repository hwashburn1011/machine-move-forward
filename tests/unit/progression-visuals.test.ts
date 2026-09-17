import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  NavigationProgressVisuals,
  attachPreservationExhibits,
  preservationExhibit,
  updatePreservationExhibit,
} from '@/art/ProgressionVisuals';
import type { LoadedModel } from '@/art/ModelLoader';

function model(): {
  loaded: LoadedModel;
  sourceGeometry: THREE.BoxGeometry;
  sourceGlow: THREE.MeshStandardMaterial;
} {
  const scene = new THREE.Group();
  const sourceGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const sourceGlow = new THREE.MeshStandardMaterial({ emissive: 0xff8844, emissiveIntensity: 2 });
  const add = (name: string, size: [number, number, number], y = 0.3) => {
    const node = new THREE.Group();
    node.name = name;
    const mesh = new THREE.Mesh(
      name === 'HelmActuator' ? sourceGeometry : sourceGeometry.clone(),
      sourceGlow,
    );
    mesh.scale.set(...size);
    mesh.position.y = y;
    node.add(mesh);
    scene.add(node);
  };
  add('HelmActuator', [1, 1, 1], 0.3);
  add('HelmGovernor', [1, 1, 1], 0.3);
  add('HelmMeridian', [1, 1, 1], 0.3);
  const needle = new THREE.Group();
  needle.name = 'HelmBearingNeedle';
  needle.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.02), sourceGlow));
  needle.position.set(0, 0, 0);
  scene.add(needle);
  for (const name of ['PreservationRecord', 'PreservationSeeds', 'PreservationCore']) {
    const exhibit = new THREE.Group();
    exhibit.name = name;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), sourceGlow);
    mesh.position.y = 0.1;
    exhibit.add(mesh);
    scene.add(exhibit);
  }
  return { loaded: { scene, clips: [] }, sourceGeometry, sourceGlow };
}

describe('progression visuals', () => {
  it('shows earned hardware and needle from facts and signed bearing, independent of tier', () => {
    const fixture = model();
    const host = new THREE.Group();
    const visuals = new NavigationProgressVisuals(host, fixture.loaded);
    visuals.update(['vector-governor', 'course-gyro'], 30, false);
    expect(host.getObjectByName('EarnedNavigationHardware')).toBe(visuals.root);
    expect(visuals.root.getObjectByName('HelmGovernor')?.visible).toBe(true);
    expect(visuals.root.getObjectByName('HelmActuator')?.visible).toBe(false);
    const needle = visuals.root.getObjectByName('HelmBearingNeedle');
    expect(needle?.visible).toBe(true);
    expect(needle?.rotation.y).toBeCloseTo(-Math.PI / 6);
    visuals.update([], -45, true);
    expect(needle?.visible).toBe(false);
    visuals.dispose();
  });

  it('owns emissive clones without disposing borrowed source geometry/materials', () => {
    const fixture = model();
    const sourceGeometryDispose = vi.spyOn(fixture.sourceGeometry, 'dispose');
    const sourceMaterialDispose = vi.spyOn(fixture.sourceGlow, 'dispose');
    for (let i = 0; i < 100; i += 1) {
      const visuals = new NavigationProgressVisuals(new THREE.Group(), fixture.loaded);
      visuals.update(['course-actuator'], 0, true);
      const mesh = visuals.root.getObjectByName('HelmActuator')!.children[0] as THREE.Mesh;
      const glow = mesh.material as THREE.MeshStandardMaterial;
      expect(glow).not.toBe(fixture.sourceGlow);
      expect(glow.emissiveIntensity).toBe(2);
      visuals.update(['course-actuator'], 0, false);
      expect(glow.emissiveIntensity).toBe(0);
      expect(fixture.sourceGlow.emissiveIntensity).toBe(2);
      const ownedDispose = vi.spyOn(glow, 'dispose');
      visuals.dispose();
      visuals.dispose();
      expect(ownedDispose).toHaveBeenCalledTimes(1);
      expect(visuals.root.parent).toBeNull();
    }
    expect(sourceGeometryDispose).not.toHaveBeenCalled();
    expect(sourceMaterialDispose).not.toHaveBeenCalled();
    fixture.sourceGeometry.dispose();
    fixture.sourceGlow.dispose();
  });

  it('falls back safely for a missing or malformed kit', () => {
    const host = new THREE.Group();
    const visuals = new NavigationProgressVisuals(host, null);
    expect(visuals.root.children).toHaveLength(0);
    visuals.update(['course-actuator'], 10, true);
    visuals.dispose();
    const malformed = model();
    malformed.loaded.scene.getObjectByName('HelmBearingNeedle')?.removeFromParent();
    const invalid = new NavigationProgressVisuals(new THREE.Group(), malformed.loaded);
    expect(invalid.root.children).toHaveLength(0);
    invalid.dispose();
  });

  it('maps selected facts to one bounded independent preservation exhibit and clears safely', () => {
    const fixture = model();
    const shelf = new THREE.Group();
    shelf.name = 'Shelf';
    attachPreservationExhibits(shelf, fixture.loaded);
    attachPreservationExhibits(shelf, fixture.loaded);
    const exhibits = shelf.getObjectByName('PreservationExhibits')!;
    expect(exhibits.children).toHaveLength(3);
    expect(exhibits.position.toArray()).toEqual([0, 1.526, 0]);
    expect(preservationExhibit('human-seed-bank')).toBe('PreservationSeeds');
    expect(preservationExhibit('annika-archive-shard')).toBe('PreservationCore');
    expect(preservationExhibit('unknown')).toBe('PreservationRecord');
    updatePreservationExhibit(shelf, 'human-seed-bank');
    expect(exhibits.children.find((child) => child.name === 'PreservationSeeds')?.visible).toBe(
      true,
    );
    expect(exhibits.children.filter((child) => child.visible)).toHaveLength(1);
    updatePreservationExhibit(shelf, null);
    expect(exhibits.children.some((child) => child.visible)).toBe(false);
    const a = exhibits.children[0]!;
    const b = exhibits.children[1]!;
    a.position.x = 3;
    expect(b.position.x).toBe(0);
  });
});
