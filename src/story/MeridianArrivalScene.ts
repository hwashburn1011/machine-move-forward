import * as THREE from 'three';
import { authoredModel } from '@/art/DefenseModels';
import type { Materials } from '@/art/Materials';

/** Presentation only: a borrowed, cached refuge silhouette and one camera. */
export class MeridianArrivalScene {
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.08, 1800);
  readonly root = new THREE.Group();
  private readonly ownedGeometry: THREE.BufferGeometry[] = [];
  private readonly origin = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly start = new THREE.Vector3();
  private readonly startLook = new THREE.Vector3();
  private anchorDistance = 0;
  private anchorLateral = 0;
  private running = false;

  constructor(scene: THREE.Scene, materials: Materials) {
    this.root.name = 'MeridianArrival';
    this.root.visible = false;
    const source = authoredModel('meridian-horizon');
    if (source) {
      const facade = source.scene.clone(true);
      facade.rotation.y = Math.PI;
      this.root.add(facade);
    } else {
      for (const [x, h] of [
        [-30, 25],
        [-15, 34],
        [20, 28],
        [37, 18],
      ]) {
        const geometry = new THREE.BoxGeometry(12, h, 14);
        this.ownedGeometry.push(geometry);
        const tower = new THREE.Mesh(geometry, materials.hull);
        tower.position.set(x!, h! / 2, 0);
        this.root.add(tower);
      }
    }
    scene.add(this.root);
  }

  get active(): boolean {
    return this.running;
  }

  place(committedAt: number, lateral: number, distance: number, groundY: number): void {
    this.anchorDistance = committedAt + 620;
    this.anchorLateral = lateral + 110;
    this.origin.set(this.anchorLateral, groundY, -this.anchorDistance);
    this.updateWorld(distance, lateral);
    this.root.visible = true;
  }

  updateWorld(distance: number, lateral: number): void {
    this.root.position.set(
      this.anchorLateral - lateral,
      this.origin.y,
      distance - this.anchorDistance,
    );
  }

  begin(from: THREE.PerspectiveCamera): void {
    this.running = true;
    this.start.copy(from.position);
    from.getWorldDirection(this.startLook).multiplyScalar(30).add(this.start);
    this.update(0);
  }

  update(elapsed: number): void {
    const establish = THREE.MathUtils.smootherstep(elapsed, 0, 4);
    const forward = THREE.MathUtils.smootherstep(elapsed, 5, 12);
    this.eye.set(42, 34, 35).lerp(new THREE.Vector3(26, 29, -30), forward);
    this.target
      .set(0, 14, 0)
      .lerp(this.root.position.clone().add(new THREE.Vector3(0, 19, 0)), forward);
    this.camera.position.copy(this.start).lerp(this.eye, establish);
    this.target.lerp(this.startLook, 1 - establish);
    this.camera.lookAt(this.target);
    this.camera.fov = THREE.MathUtils.lerp(52, 43, forward);
    this.camera.updateProjectionMatrix();
  }

  stop(): void {
    this.running = false;
    this.root.visible = false;
  }
  dispose(): void {
    this.stop();
    this.root.removeFromParent();
    for (const geometry of this.ownedGeometry) geometry.dispose();
  }
}
