import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { InputManager } from '@/core/input/InputManager';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { PlayerCamera } from '@/player/PlayerCamera';
import { GameLoop } from '@/game/GameLoop';

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', new EventTarget());
  const input = new InputManager(new EventTarget() as HTMLCanvasElement, {
    bypassPointerLock: true,
  });
  const camera = new PlayerCamera(16 / 9);
  const physics = { raycast: () => null } as unknown as PhysicsWorld;
  const target = new THREE.Vector3(0, 16, 0);
  const loop = new GameLoop({
    fixedUpdate: (dt) => camera.fixedUpdate(dt, input, target, physics),
    render: (alpha) => {
      camera.update(alpha, input);
      input.endFrame();
    },
  });
  return { input, camera, loop, target, physics };
}

describe('mouse input across simulation and rendering rates', () => {
  it.each([30, 60, 120, 144])('keeps the same sensitivity at %i rendered FPS', (fps) => {
    const { input, camera, loop } = fixture();
    for (let i = 0; i < fps; i++) {
      input.lookDelta.x += 1200 / fps;
      loop.advance(1 / fps);
    }
    expect(camera.yawAngle).toBeCloseTo(-1200 * 0.0022, 10);
    input.dispose();
  });

  it('applies a long-frame mouse delta only once across all catch-up ticks', () => {
    const { input, camera, loop } = fixture();
    input.lookDelta.x = 100;
    loop.advance(0.1);
    expect(camera.yawAngle).toBeCloseTo(-0.22, 10);
    input.dispose();
  });

  it('responds on a rendered frame that has no fixed update', () => {
    const { input, camera, loop } = fixture();
    input.lookDelta.x = 100;
    loop.advance(1 / 144);
    expect(camera.yawAngle).toBeCloseTo(-0.22, 10);
    expect(camera.camera.rotation.y).toBeCloseTo(-0.22, 10);
    input.dispose();
  });

  it.each([30, 60, 144])('keeps the character framed during rapid turns at %i FPS', (fps) => {
    const { input, camera, loop, target } = fixture();
    loop.advance(1 / 60);
    const chest = target.clone().add(new THREE.Vector3(0, 0.5, 0));
    camera.camera.updateMatrixWorld(true);
    const before = chest.clone().project(camera.camera);
    for (let frame = 0; frame < 12; frame++) {
      input.lookDelta.x += 450;
      loop.advance(1 / fps);
      camera.camera.updateMatrixWorld(true);
      const after = chest.clone().project(camera.camera);
      expect(after.x).toBeCloseTo(before.x, 5);
      expect(after.y).toBeCloseTo(before.y, 5);
    }
    input.dispose();
  });

  it('orbits on a render-only mouse update instead of looking away from the player', () => {
    const { input, camera, target, physics } = fixture();
    camera.fixedUpdate(1 / 60, input, target, physics);
    camera.update(1, input);
    camera.camera.updateMatrixWorld(true);
    const before = target.clone().project(camera.camera);
    input.lookDelta.x = 600;
    camera.update(1, input);
    camera.camera.updateMatrixWorld(true);
    expect(target.clone().project(camera.camera).x).toBeCloseTo(before.x, 5);
    expect(camera.camera.rotation.y).toBeCloseTo(-1.32, 10);
    input.dispose();
  });

  it('retains unconsumed mounted-gun look and discards it on focus loss', () => {
    const { input } = fixture();
    input.lookDelta.x = 55;
    input.endFrame();
    expect(input.consumeLook().x).toBe(55);
    expect(input.consumeLook().x).toBe(0);
    input.lookDelta.x = 80;
    window.dispatchEvent(new Event('blur'));
    expect(input.consumeLook().x).toBe(0);
    input.dispose();
  });

  it('interpolates camera translation without smoothing mouse rotation', () => {
    const { input, camera, target, physics } = fixture();
    camera.fixedUpdate(1 / 60, input, target, physics);
    const before = camera.camera.position.clone();
    target.x = 1;
    camera.fixedUpdate(1 / 60, input, target, physics);
    const after = camera.camera.position.clone();
    camera.update(0.5, input);
    expect(camera.camera.position.distanceTo(before.lerp(after, 0.5))).toBeLessThan(1e-9);
    input.lookDelta.x = 100;
    camera.update(0.5, input);
    const reference = new PlayerCamera(16 / 9);
    reference.setYaw(-0.22);
    reference.fixedUpdate(1 / 60, input, target.clone().setX(0.5), physics);
    expect(camera.camera.position.distanceTo(reference.camera.position)).toBeLessThan(1e-9);
    expect(camera.camera.rotation.y).toBeCloseTo(-0.22, 10);
    input.dispose();
  });
});
