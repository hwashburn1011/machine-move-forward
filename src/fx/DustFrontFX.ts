import * as THREE from 'three';
import { Rng } from '@/core/math/Random';

/** A bounded layer of windborne grit. No physics, lights, textures or per-frame allocations. */
export class DustFrontFX {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.PointsMaterial({
    color: 0xc5a37d,
    size: 0.075,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
    fog: false,
  });
  private readonly points = new THREE.Points(this.geometry, this.material);
  private readonly seedPositions = new Float32Array(384 * 3);
  private readonly positions = new Float32Array(384 * 3);

  constructor(scene: THREE.Scene) {
    const rng = new Rng(7091);
    for (let i = 0; i < this.seedPositions.length; i++) this.seedPositions[i] = rng.range(-25, 25);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.points.name = 'dust-front-grit';
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(
    timeS: number,
    intensity: number,
    camera: THREE.Vector3,
    sheltered: boolean,
    low: boolean,
  ): void {
    this.points.visible = intensity > 0.001 && !sheltered;
    if (!this.points.visible) return;
    this.points.position.copy(camera);
    this.material.opacity = intensity * 0.36;
    const count = low ? 96 : 384;
    this.geometry.setDrawRange(0, count);
    for (let i = 0; i < count; i++) {
      const at = i * 3;
      this.positions[at] = ((((this.seedPositions[at]! + timeS * 8) % 50) + 50) % 50) - 25;
      this.positions[at + 1] = this.seedPositions[at + 1]! * 0.35;
      this.positions[at + 2] = ((((this.seedPositions[at + 2]! + timeS * 2) % 50) + 50) % 50) - 25;
    }
    this.geometry.attributes.position!.needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
