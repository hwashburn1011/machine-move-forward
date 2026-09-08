import * as THREE from 'three';
import { describe, expect, it, beforeAll } from 'vitest';
import { ParticleSystem } from '@/fx/ParticleSystem';

beforeAll(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { innerHeight: 1080 },
  });
});

const emit = (particles: ParticleSystem, x: number): void => {
  particles.emit({
    position: new THREE.Vector3(x, 0, 0),
    velocity: new THREE.Vector3(),
    life: 2,
    size: 0.2,
    color: new THREE.Color(1, 0.5, 0.2),
  });
};

describe('ParticleSystem quality resizing', () => {
  it('retains live particles when growing and clips only overflow when shrinking', () => {
    const particles = new ParticleSystem(new THREE.Scene(), 3);
    emit(particles, 1);
    emit(particles, 2);
    particles.update(0);

    particles.resizeCapacity(6);
    expect(particles.maxCount).toBe(6);
    expect(particles.liveCount).toBe(2);
    expect(particles.points.geometry.drawRange.count).toBe(2);

    particles.resizeCapacity(1);
    expect(particles.maxCount).toBe(1);
    expect(particles.liveCount).toBe(1);
    expect(particles.points.geometry.drawRange.count).toBe(1);
    particles.dispose();
  });
});
