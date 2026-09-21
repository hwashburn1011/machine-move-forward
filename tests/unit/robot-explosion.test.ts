import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { RobotExplosion } from '@/game/RobotExplosion';

describe('robot detonation lifecycle', () => {
  it('reuses prepared resources and keeps a stable light count across overlapping impacts', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const at = { x: 1, y: 2, z: 3 };
    const first = new RobotExplosion(scene, at, false);
    const second = new RobotExplosion(scene, at, false);
    const countLights = () => {
      let count = 0;
      scene.traverseVisible((node) => {
        if (node instanceof THREE.PointLight) count++;
      });
      return count;
    };
    const ids: number[] = [];
    scene.traverse((node) => ids.push(node.id));
    expect(countLights()).toBe(2);
    expect(first.update(0.2, camera)).toBe(false);
    first.trigger(at);
    first.update(0.7, camera);
    second.trigger({ x: 2, y: 2, z: 3 });
    second.update(0.12, camera);
    expect(countLights()).toBe(2);
    first.update(3, camera);
    second.update(3, camera);
    expect(countLights()).toBe(2);
    const after: number[] = [];
    scene.traverse((node) => after.push(node.id));
    expect(after).toEqual(ids);
    first.trigger(at);
    first.update(0.12, camera);
    const fire = first.object.getObjectByName('detonation-fire') as THREE.Mesh;
    const position = fire.position.clone();
    first.reset();
    first.trigger(at);
    first.update(0.12, camera);
    expect(fire.position.equals(position)).toBe(true);
    first.dispose();
    second.dispose();
    expect(countLights()).toBe(0);
  });

  it('flashes, rolls into translucent smoke, then releases all render resources', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.rotation.set(0.2, 0.5, 0);
    const effect = new RobotExplosion(scene, { x: 3, y: 4, z: 5 });
    const fire = effect.object.getObjectByName('detonation-fire') as THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.ShaderMaterial
    >;
    const ash = effect.object.getObjectByName('detonation-ash') as THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.ShaderMaterial
    >;
    const light = effect.object.getObjectByName('robot-detonation-flash') as THREE.PointLight;
    const releaseGeometry = vi.spyOn(fire.geometry, 'dispose');
    const releaseMaterial = vi.spyOn(fire.material, 'dispose');
    effect.update(0.12, camera);
    expect(fire.visible).toBe(true);
    expect(ash.visible).toBe(false);
    expect(light.intensity).toBeGreaterThan(0);
    expect(fire.quaternion.angleTo(camera.quaternion)).toBeLessThan(0.0001);
    expect(fire.material.depthWrite).toBe(false);
    expect(fire.material.uniforms.opacity!.value).toBeGreaterThan(0);
    effect.update(0.65, camera);
    expect(ash.visible).toBe(true);
    expect(light.intensity).toBe(0);
    expect(effect.update(2, camera)).toBe(false);
    effect.dispose();
    effect.dispose();
    expect(scene.children).toHaveLength(0);
    expect(releaseGeometry).toHaveBeenCalledTimes(1);
    expect(releaseMaterial).toHaveBeenCalledTimes(1);
  });

  it('can be discarded during a cinematic skip without retaining the flash light', () => {
    const scene = new THREE.Scene();
    const effect = new RobotExplosion(scene, { x: 0, y: 0, z: 0 });
    effect.update(0.05, new THREE.Camera());
    effect.dispose();
    expect(scene.getObjectByName('robot-detonation-flash')).toBeUndefined();
    expect(effect.update(0.1, new THREE.Camera())).toBe(false);
  });
});
