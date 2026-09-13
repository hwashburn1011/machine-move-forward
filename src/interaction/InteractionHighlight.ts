import * as THREE from 'three';
export interface HighlightTarget {
  id: string;
  object?: THREE.Object3D;
  position?: THREE.Vector3;
  usable: boolean;
  occluded?: boolean;
}

/** One outline follows only the interaction system's chosen target. */
export class InteractionHighlight {
  private readonly geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  private readonly material = new THREE.LineBasicMaterial({
    color: 0xf2be75,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  readonly object = new THREE.LineSegments(this.geometry, this.material);
  private readonly bounds = new THREE.Box3();
  private readonly size = new THREE.Vector3();
  constructor() {
    this.object.visible = false;
  }
  setTarget(target: HighlightTarget | null): void {
    this.object.visible = !!target && target.usable && !target.occluded;
    if (!this.object.visible || !target) return;
    if (target.object) {
      this.bounds.setFromObject(target.object);
      if (this.bounds.isEmpty()) {
        this.object.visible = false;
        return;
      }
      this.bounds.getCenter(this.object.position);
      this.bounds.getSize(this.size);
      this.object.scale.copy(this.size).addScalar(0.04);
    } else if (target.position) {
      this.object.position.copy(target.position);
      this.object.position.y += 0.45;
      this.object.scale.set(0.6, 0.9, 0.2);
    }
  }
  clear(): void {
    this.object.visible = false;
  }
  dispose(): void {
    this.object.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
