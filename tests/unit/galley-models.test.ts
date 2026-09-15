import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

const { authoredModel } = vi.hoisted(() => ({ authoredModel: vi.fn() }));
vi.mock('@/art/DefenseModels', () => ({ authoredModel }));

import { homeModel } from '@/art/HomeModels';

function loadedKit() {
  const scene = new THREE.Group();
  for (const name of ['GalleyStove', 'GalleyCondenser', 'GalleyPlanter']) {
    const root = new THREE.Group();
    root.name = name;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    root.add(new THREE.Mesh(geometry, material));
    scene.add(root);
  }
  return { scene, clips: [] };
}

describe('galley authored model mapping', () => {
  beforeEach(() => authoredModel.mockReset());

  it('selects each named galley root and clones it without borrowing transforms', () => {
    const kit = loadedKit();
    authoredModel.mockReturnValue(kit);

    for (const [piece, name] of [
      ['stove', 'GalleyStove'],
      ['condenser', 'GalleyCondenser'],
      ['planter', 'GalleyPlanter'],
    ] as const) {
      const model = homeModel(piece);
      expect(model).not.toBeNull();
      expect(model!.name).toBe(name);
      expect(model).not.toBe(kit.scene.getObjectByName(name));
      expect(model!.position.toArray()).toEqual([0, 0, 0]);
    }
    expect(authoredModel).toHaveBeenCalledWith('galley-kit');
  });

  it('preserves borrowed geometry and material references while cloning the root', () => {
    const kit = loadedKit();
    authoredModel.mockReturnValue(kit);
    const sourceMesh = kit.scene.getObjectByName('GalleyStove')!.children[0] as THREE.Mesh;
    const cloneMesh = homeModel('stove')!.children[0] as THREE.Mesh;
    expect(cloneMesh.geometry).toBe(sourceMesh.geometry);
    expect(cloneMesh.material).toBe(sourceMesh.material);
  });

  it('returns fallback null when the optional kit is unavailable', () => {
    authoredModel.mockReturnValue(null);
    expect(homeModel('stove')).toBeNull();
    expect(homeModel('condenser')).toBeNull();
    expect(homeModel('planter')).toBeNull();
  });

  it('keeps existing home and caretaker kit lookups unchanged', () => {
    const source = new THREE.Group();
    const chair = new THREE.Group();
    chair.name = 'HomeChair';
    source.add(chair);
    const fieldwork = new THREE.Group();
    const dock = new THREE.Group();
    dock.name = 'CaretakerDock';
    fieldwork.add(dock);
    authoredModel.mockImplementation((id: string) =>
      id === 'home-furnishings' ? { scene: source, clips: [] } : { scene: fieldwork, clips: [] },
    );
    expect(homeModel('chair')!.name).toBe('HomeChair');
    expect(homeModel('caretaker-dock')!.name).toBe('CaretakerDock');
    expect(authoredModel).toHaveBeenNthCalledWith(1, 'home-furnishings');
    expect(authoredModel).toHaveBeenNthCalledWith(2, 'fieldwork-kit');
  });
});
