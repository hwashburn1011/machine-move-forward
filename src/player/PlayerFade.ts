import * as THREE from 'three';

/** One owned material set per local mesh, reused across camera updates. */
export class PlayerFade {
  private readonly entries = new Map<
    THREE.Mesh,
    { original: THREE.Material | THREE.Material[]; faded: THREE.Material | THREE.Material[] }
  >();
  private amount = 1;
  private applied = false;
  private hiddenRoot: THREE.Object3D | null = null;
  apply(root: THREE.Object3D, distance: number, dt = 1 / 60): void {
    this.restoreVisibility();
    // Distance is measured from the capsule centre, below the camera anchor.
    // Hide before the camera enters the helmet/backpack, not at the centre.
    const target = THREE.MathUtils.smoothstep(distance, 1.0, 1.75);
    this.amount = target < this.amount ? target : THREE.MathUtils.damp(this.amount, target, 12, dt);
    if (this.amount > 0.999) {
      this.restore();
      return;
    }
    if (this.amount <= 0.001) {
      // Zero-opacity meshes still submit every depth/normal/colour draw. Skip
      // the fully faded local model while keeping its skeleton/physics active.
      if (root.visible) {
        this.hiddenRoot = root;
        root.visible = false;
      }
      return;
    }
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      let entry = this.entries.get(mesh);
      if (!entry) {
        const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const clones = source.map((m) => {
          const clone = m.clone();
          // Three's clone omits shader callbacks. Preserve the authored fog and
          // program key, otherwise fading also changes the character's lighting.
          clone.onBeforeCompile = m.onBeforeCompile;
          clone.customProgramCacheKey = m.customProgramCacheKey;
          // A smooth single pass keeps close views clear without grain across
          // the screen or the cost of rendering both sides of translucent gear.
          clone.transparent = true;
          clone.alphaHash = false;
          clone.forceSinglePass = true;
          clone.depthWrite = false;
          return clone;
        });
        entry = {
          original: mesh.material,
          faded: Array.isArray(mesh.material) ? clones : clones[0]!,
        };
        this.entries.set(mesh, entry);
      }
      const originals = Array.isArray(entry.original) ? entry.original : [entry.original];
      const clones = Array.isArray(entry.faded) ? entry.faded : [entry.faded];
      clones.forEach((m, i) => {
        m.opacity = originals[i]!.opacity * this.amount;
      });
      mesh.material = entry.faded;
    });
    this.applied = true;
  }
  restore(_root?: THREE.Object3D): void {
    this.restoreVisibility();
    if (this.applied) for (const [mesh, entry] of this.entries) mesh.material = entry.original;
    this.applied = false;
    this.amount = 1;
  }
  private restoreVisibility(): void {
    if (this.hiddenRoot) this.hiddenRoot.visible = true;
    this.hiddenRoot = null;
  }
  /** Retain warmed body materials; release only meshes replaced by equipment swaps. */
  retainFor(root: THREE.Object3D): void {
    this.restore();
    const current = new Set<THREE.Object3D>();
    root.traverse((node) => current.add(node));
    for (const [mesh, entry] of this.entries) {
      if (current.has(mesh)) continue;
      for (const material of Array.isArray(entry.faded) ? entry.faded : [entry.faded])
        material.dispose();
      this.entries.delete(mesh);
    }
  }
  dispose(): void {
    this.restore();
    for (const entry of this.entries.values()) {
      for (const material of Array.isArray(entry.faded) ? entry.faded : [entry.faded])
        material.dispose();
    }
    this.entries.clear();
  }
}
