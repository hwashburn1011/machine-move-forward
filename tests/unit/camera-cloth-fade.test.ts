import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CameraClothFade } from '@/player/CameraClothFade';

function sceneMesh(
  z: number,
  material = new THREE.MeshBasicMaterial({ color: 'white', opacity: 0.8 }),
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.08), material);
  mesh.position.set(0, 1.3, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}
function camera() {
  const result = new THREE.PerspectiveCamera(60, 1, 0.1, 20);
  result.position.set(0, 1.3, 3);
  result.lookAt(0, 1.3, 0);
  result.updateMatrixWorld(true);
  return result;
}

describe('CameraClothFade', () => {
  it('fades a blocking candidate and restores it after hysteresis', () => {
    const cloth = sceneMesh(1.5);
    const fade = new CameraClothFade();
    fade.setCandidates([cloth]);
    fade.update(camera(), new THREE.Vector3(0, 1.3, 0), 1 / 60);
    expect((cloth.material as THREE.Material).opacity).toBeCloseTo(0.048, 4);
    const clearCamera = camera();
    clearCamera.position.z = -3;
    clearCamera.lookAt(0, 1.3, 0);
    clearCamera.updateMatrixWorld(true);
    for (let i = 0; i < 35; i += 1) fade.update(clearCamera, new THREE.Vector3(0, 1.3, 0), 1 / 60);
    expect((cloth.material as THREE.Material).opacity).toBeCloseTo(0.8, 2);
    fade.dispose();
    cloth.geometry.dispose();
  });

  it('does not fade cloth beyond the focus or meshes outside the candidate list', () => {
    const beyond = sceneMesh(-2);
    const unrelated = sceneMesh(1.5);
    const fade = new CameraClothFade();
    fade.setCandidates([beyond]);
    fade.update(camera(), new THREE.Vector3(0, 1.3, 0), 1 / 60);
    expect((beyond.material as THREE.Material).opacity).toBeCloseTo(0.8);
    expect((unrelated.material as THREE.Material).opacity).toBeCloseTo(0.8);
    fade.dispose();
  });

  it('skips prehidden ancestors and preserves shared source materials', () => {
    const source = new THREE.MeshBasicMaterial({ opacity: 0.7 });
    const first = sceneMesh(1.5, source);
    const second = sceneMesh(1.5, source);
    const hiddenParent = new THREE.Group();
    hiddenParent.visible = false;
    hiddenParent.add(second);
    const fade = new CameraClothFade();
    fade.setCandidates([first, second]);
    expect(first.material).toBe(source);
    expect(second.material).toBe(source);
    fade.update(camera(), new THREE.Vector3(0, 1.3, 0), 1 / 60);
    expect(first.material).not.toBe(source);
    expect(source.opacity).toBe(0.7);
    fade.restore();
    expect(first.material).toBe(source);
    fade.dispose();
  });

  it('rebinds and restores exact materials, including warmup', () => {
    const first = sceneMesh(1.5);
    const second = sceneMesh(1.5);
    const firstMaterial = first.material;
    const secondMaterial = second.material;
    const fade = new CameraClothFade();
    fade.setCandidates([first]);
    fade.warmup();
    expect((first.material as THREE.Material).opacity).toBe(0.2);
    fade.setCandidates([second]);
    expect(first.material).toBe(firstMaterial);
    expect(second.material).toBe(secondMaterial);
    fade.warmup();
    expect(second.material).not.toBe(secondMaterial);
    fade.restore();
    expect(second.material).toBe(secondMaterial);
    fade.dispose();
  });

  it('restores a candidate that becomes hidden after it was blocking', () => {
    const cloth = sceneMesh(1.5);
    const original = cloth.material;
    const fade = new CameraClothFade();
    fade.setCandidates([cloth]);
    const view = camera();
    fade.update(view, new THREE.Vector3(0, 1.3, 0), 1 / 60);
    cloth.visible = false;
    for (let i = 0; i < 32; i += 1) fade.update(view, new THREE.Vector3(0, 1.3, 0), 1 / 60);
    expect(cloth.material).toBe(original);
    fade.dispose();
  });

  it('keeps exact original identity on initial clear and restores it after 120 frames', () => {
    const cloth = sceneMesh(1.5);
    const original = cloth.material;
    const fade = new CameraClothFade();
    fade.setCandidates([cloth]);
    const clearCamera = camera();
    clearCamera.position.z = -3;
    clearCamera.lookAt(0, 1.3, 0);
    clearCamera.updateMatrixWorld(true);
    fade.update(clearCamera, new THREE.Vector3(0, 1.3, 0), 0);
    expect(cloth.material).toBe(original);
    fade.update(camera(), new THREE.Vector3(0, 1.3, 0), 1 / 60);
    expect(cloth.material).not.toBe(original);
    for (let i = 0; i < 120; i += 1) fade.update(clearCamera, new THREE.Vector3(0, 1.3, 0), 1 / 60);
    expect(cloth.material).toBe(original);
    fade.dispose();
  });

  it('preserves a single-element material array while fading and restores the same array', () => {
    const first = new THREE.MeshBasicMaterial({ opacity: 0.8 });
    const originalArray = [first];
    const geometry = new THREE.BoxGeometry(2, 2, 0.08);
    geometry.clearGroups();
    geometry.addGroup(0, Infinity, 0);
    const cloth = new THREE.Mesh(geometry, originalArray);
    cloth.position.set(0, 1.3, 1.5);
    cloth.updateMatrixWorld(true);
    const fade = new CameraClothFade();
    fade.setCandidates([cloth]);
    expect(cloth.material).toBe(originalArray);
    fade.update(camera(), new THREE.Vector3(0, 1.3, 0), 1 / 60);
    expect(Array.isArray(cloth.material)).toBe(true);
    expect(cloth.material).not.toBe(originalArray);
    fade.restore();
    expect(cloth.material).toBe(originalArray);
    fade.update(camera(), new THREE.Vector3(0, 1.3, 0), 1 / 60);
    expect(cloth.material).not.toBe(originalArray);
    fade.dispose();
  });

  it('keeps a registered nonblocking candidate untouched beside a blocker', () => {
    const blocker = sceneMesh(1.5);
    const blockerOriginal = blocker.material;
    const clear = sceneMesh(-2);
    const clearOriginal = clear.material;
    const fade = new CameraClothFade();
    fade.setCandidates([blocker, clear]);
    fade.update(camera(), new THREE.Vector3(0, 1.3, 0), 1 / 60);
    expect(blocker.material).not.toBe(blockerOriginal);
    expect(clear.material).toBe(clearOriginal);
    fade.dispose();
  });

  it('handles ancestor hide/unhide and parent movement through matrix updates', () => {
    const parent = new THREE.Group();
    const cloth = sceneMesh(1.5);
    parent.add(cloth);
    const original = cloth.material;
    const fade = new CameraClothFade();
    fade.setCandidates([cloth]);
    const view = camera();
    const focus = new THREE.Vector3(0, 1.3, 0);
    fade.update(view, focus, 1 / 60);
    expect(cloth.material).not.toBe(original);
    parent.position.z = -4;
    for (let i = 0; i < 32; i += 1) fade.update(view, focus, 1 / 60);
    expect(cloth.material).toBe(original);
    parent.position.z = 0;
    parent.visible = false;
    fade.update(view, focus, 1 / 60);
    expect(cloth.material).toBe(original);
    parent.visible = true;
    fade.update(view, focus, 1 / 60);
    expect(cloth.material).not.toBe(original);
    fade.dispose();
  });

  it('disposes only owned clones on rebind and final disposal', () => {
    const dispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    const shared = new THREE.MeshBasicMaterial({ opacity: 0.8 });
    const first = sceneMesh(1.5, shared);
    const second = sceneMesh(1.5, shared);
    const geometryDispose = vi.spyOn(first.geometry, 'dispose');
    const fade = new CameraClothFade();
    fade.setCandidates([first, second]);
    fade.setCandidates([first]);
    expect(dispose).toHaveBeenCalledTimes(2);
    fade.dispose();
    expect(dispose).toHaveBeenCalledTimes(3);
    expect(dispose.mock.contexts).not.toContain(shared);
    expect(geometryDispose).not.toHaveBeenCalled();
    dispose.mockRestore();
  });

  it('reuses one clone across 100 blocking and clear cycles', () => {
    const cloth = sceneMesh(1.5);
    const original = cloth.material;
    const fade = new CameraClothFade();
    fade.setCandidates([cloth]);
    const blocked = camera();
    const clear = camera();
    clear.position.z = -3;
    clear.lookAt(0, 1.3, 0);
    const focus = new THREE.Vector3(0, 1.3, 0);
    fade.update(blocked, focus, 1 / 60);
    const clone = cloth.material;
    expect(clone).not.toBe(original);
    for (let cycle = 0; cycle < 100; cycle++) {
      fade.update(clear, focus, 0.5);
      expect(cloth.material).toBe(original);
      fade.update(blocked, focus, 1 / 60);
      expect(cloth.material).toBe(clone);
      expect(original.opacity).toBe(0.8);
    }
    fade.dispose();
    expect(cloth.material).toBe(original);
  });
});
