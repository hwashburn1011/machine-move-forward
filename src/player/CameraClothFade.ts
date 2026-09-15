import * as THREE from 'three';

interface MaterialRecord {
  readonly clone: THREE.Material;
  readonly opacity: number;
}
interface CandidateRecord {
  readonly mesh: THREE.Mesh;
  readonly originalMaterial: THREE.Material | THREE.Material[];
  readonly fadedMaterial: THREE.Material | THREE.Material[];
  readonly materials: MaterialRecord[];
  blocked: boolean;
  clearFor: number;
  attached: boolean;
}

/** Fades explicitly supplied cloth meshes when they occlude the player's chest. */
export class CameraClothFade {
  private candidates: CandidateRecord[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly right = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly sample = new THREE.Vector3();
  private readonly hits: THREE.Intersection[] = [];
  private warming = false;

  setCandidates(meshes: readonly THREE.Mesh[]): void {
    this.restore();
    this.disposeRecords();
    const seen = new Set<THREE.Mesh>();
    for (const mesh of meshes) {
      if (seen.has(mesh) || !mesh || !mesh.isMesh || !this.isVisible(mesh)) continue;
      seen.add(mesh);
      const originalMaterial = mesh.material;
      const sources = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
      const materials = sources.map((original) => this.cloneMaterial(original));
      mesh.geometry.computeBoundingBox();
      this.candidates.push({
        mesh,
        originalMaterial,
        fadedMaterial: Array.isArray(originalMaterial)
          ? materials.map(({ clone }) => clone)
          : materials[0]!.clone,
        materials,
        blocked: false,
        clearFor: 0,
        attached: false,
      });
    }
  }

  update(camera: THREE.PerspectiveCamera, focus: THREE.Vector3, dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) return;
    for (const record of this.candidates) record.mesh.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    if (this.warming) {
      for (const record of this.candidates) {
        this.attach(record);
        for (const material of record.materials) material.clone.opacity = 0.2;
      }
      return;
    }
    for (const record of this.candidates) {
      const blocked = this.isBlocked(record, camera, focus);
      if (blocked) {
        record.blocked = true;
        record.clearFor = 0;
        this.attach(record);
        this.setOpacity(record, 0.06);
        continue;
      }
      if (!record.blocked) continue;
      record.clearFor += dt;
      this.attach(record);
      if (record.clearFor < 0.14) {
        this.setOpacity(record, 0.06);
      } else {
        const amount = THREE.MathUtils.lerp(0.06, 1, Math.min(1, (record.clearFor - 0.14) / 0.3));
        this.setOpacity(record, amount);
        if (amount >= 1) {
          record.blocked = false;
          record.clearFor = 0;
          this.detach(record);
        }
      }
    }
  }

  /** Apply low opacity to owned clones until restore or a new candidate set. */
  warmup(): void {
    this.warming = true;
    for (const record of this.candidates) {
      this.attach(record);
      for (const material of record.materials) material.clone.opacity = 0.2;
    }
  }

  restore(): void {
    this.warming = false;
    for (const record of this.candidates) {
      record.mesh.material = record.originalMaterial;
      record.blocked = false;
      record.clearFor = 0;
      record.attached = false;
    }
  }

  dispose(): void {
    this.restore();
    this.disposeRecords();
  }

  private disposeRecords(): void {
    for (const record of this.candidates)
      for (const material of record.materials) material.clone.dispose();
    this.candidates = [];
  }

  private attach(record: CandidateRecord): void {
    if (record.attached) return;
    record.mesh.material = record.fadedMaterial;
    record.attached = true;
  }

  private detach(record: CandidateRecord): void {
    record.mesh.material = record.originalMaterial;
    record.attached = false;
  }

  private setOpacity(record: CandidateRecord, amount: number): void {
    for (const material of record.materials) material.clone.opacity = material.opacity * amount;
  }

  private cloneMaterial(original: THREE.Material): MaterialRecord {
    const clone = original.clone();
    clone.onBeforeCompile = original.onBeforeCompile;
    clone.customProgramCacheKey = original.customProgramCacheKey;
    clone.transparent = true;
    clone.depthWrite = false;
    clone.forceSinglePass = true;
    (clone as THREE.Material & { alphaHash?: boolean }).alphaHash = false;
    return { clone, opacity: original.opacity };
  }

  private isVisible(mesh: THREE.Mesh): boolean {
    let current: THREE.Object3D | null = mesh;
    while (current) {
      if (!current.visible) return false;
      current = current.parent;
    }
    return true;
  }

  private isBlocked(
    record: CandidateRecord,
    camera: THREE.PerspectiveCamera,
    focus: THREE.Vector3,
  ): boolean {
    if (!this.isVisible(record.mesh)) return false;
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    for (const offset of [0, -0.2, 0.2]) {
      this.sample.copy(focus).addScaledVector(this.right, offset);
      this.direction.copy(camera.position).sub(this.sample);
      const distance = this.direction.length();
      if (distance <= 1e-5) continue;
      this.raycaster.set(this.sample, this.direction.normalize());
      this.raycaster.far = distance;
      this.hits.length = 0;
      record.mesh.raycast(this.raycaster, this.hits);
      if (this.hits.length > 0) return true;
    }
    return false;
  }
}
