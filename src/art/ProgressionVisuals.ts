import * as THREE from 'three';
import type { LoadedModel } from './ModelLoader';

const HARDWARE = [
  ['HelmActuator', 'course-actuator'],
  ['HelmGovernor', 'vector-governor'],
  ['HelmMeridian', 'meridian-solution'],
] as const;
const EXHIBITS = ['PreservationRecord', 'PreservationSeeds', 'PreservationCore'] as const;
export type PreservationExhibit = (typeof EXHIBITS)[number];

/** Cosmetic classification only; callers authorize the selected fact through HomeLife. */
export function preservationExhibit(factId: string | null | undefined): PreservationExhibit | null {
  if (!factId) return null;
  if (factId === 'human-seed-bank') return 'PreservationSeeds';
  if (factId === 'annika-archive-shard' || factId === 'orchard-memory-core')
    return 'PreservationCore';
  return 'PreservationRecord';
}

function fits(node: THREE.Object3D, low: readonly number[], high: readonly number[]): boolean {
  const clone = node.clone(true);
  clone.position.set(0, 0, 0);
  const bounds = new THREE.Box3().setFromObject(clone);
  const min = bounds.min.toArray(),
    max = bounds.max.toArray();
  return (
    !bounds.isEmpty() &&
    min.every((v, i) => Number.isFinite(v) && v >= low[i]! - 0.002) &&
    max.every((v, i) => Number.isFinite(v) && v <= high[i]! + 0.002)
  );
}

/** Existing Helm footprint, existing earned facts, no collision or saved presentation state. */
export class NavigationProgressVisuals {
  readonly root = new THREE.Group();
  private readonly hardware = new Map<string, THREE.Object3D>();
  private readonly ownedGlow = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
  private needle: THREE.Object3D | null = null;
  private disposed = false;

  constructor(host: THREE.Object3D, model: LoadedModel | null) {
    this.root.name = 'EarnedNavigationHardware';
    if (!model) return;
    const nodes = HARDWARE.map(([name]) => model.scene.getObjectByName(name));
    const needle = model.scene.getObjectByName('HelmBearingNeedle');
    if (
      !needle ||
      !fits(needle, [-0.15, -0.03, -0.15], [0.15, 0.03, 0.15]) ||
      nodes.some((node) => !node || !fits(node, [-0.57, 0, -0.375], [0.57, 1.36, 0.375]))
    )
      return;
    nodes.forEach((node, index) => {
      const copy = this.borrow(node!);
      copy.visible = false;
      this.hardware.set(HARDWARE[index]![1], copy);
      this.root.add(copy);
    });
    const pivot = new THREE.Group();
    pivot.name = 'LiveBearingDial';
    pivot.position.set(-0.17, 1.276, 0.01);
    pivot.rotation.x = 0.41;
    const face = model.scene.getObjectByName('HelmDialFace');
    if (face && fits(face, [-0.15, -0.03, -0.15], [0.15, 0.03, 0.15])) pivot.add(this.borrow(face));
    this.needle = this.borrow(needle);
    this.needle.visible = false;
    pivot.add(this.needle);
    this.root.add(pivot);
    host.add(this.root);
  }

  update(recoveredUniques: readonly string[], bearingDeg: number, powered: boolean): void {
    if (this.disposed) return;
    for (const [fact, object] of this.hardware) object.visible = recoveredUniques.includes(fact);
    if (this.needle) {
      this.needle.visible = recoveredUniques.includes('course-gyro');
      this.needle.rotation.y = (-(Number.isFinite(bearingDeg) ? bearingDeg : 0) * Math.PI) / 180;
    }
    for (const [source, owned] of this.ownedGlow)
      owned.emissiveIntensity = powered ? source.emissiveIntensity : 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    this.hardware.clear();
    this.needle = null;
    for (const material of this.ownedGlow.values()) material.dispose();
    this.ownedGlow.clear();
  }

  private borrow(source: THREE.Object3D): THREE.Object3D {
    const object = source.clone(true);
    object.position.set(0, 0, 0);
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const glow = (material: THREE.Material): THREE.Material => {
        if (!(material instanceof THREE.MeshStandardMaterial) || material.emissive.getHex() === 0)
          return material;
        let owned = this.ownedGlow.get(material);
        if (!owned) {
          owned = material.clone();
          owned.onBeforeCompile = material.onBeforeCompile;
          owned.customProgramCacheKey = material.customProgramCacheKey;
          this.ownedGlow.set(material, owned);
        }
        return owned;
      };
      node.material = Array.isArray(node.material) ? node.material.map(glow) : glow(node.material);
      node.castShadow = false;
      node.receiveShadow = true;
    });
    return object;
  }
}

/** Add borrowed exhibit transforms above the existing shelf, inside its floor footprint. */
export function attachPreservationExhibits(shelf: THREE.Object3D, model: LoadedModel | null): void {
  if (!model || shelf.getObjectByName('PreservationExhibits')) return;
  const sources = EXHIBITS.map((name) => model.scene.getObjectByName(name));
  if (sources.some((node) => !node || !fits(node, [-0.23, 0, -0.15], [0.23, 0.31, 0.15]))) return;
  const root = new THREE.Group();
  root.name = 'PreservationExhibits';
  root.position.set(0, 1.526, 0);
  for (const source of sources) {
    const object = source!.clone(true);
    object.position.set(0, 0, 0);
    object.visible = false;
    object.traverse((node) => {
      if (node instanceof THREE.Mesh) node.castShadow = false;
    });
    root.add(object);
  }
  shelf.add(root);
}

/** Also used after restore and equipment moves; never grants a fact or consumes an item. */
export function updatePreservationExhibit(
  root: THREE.Object3D,
  factId: string | null | undefined,
): void {
  const kind = preservationExhibit(factId);
  const waveform = root.getObjectByName('KeepsakeLit');
  if (waveform) waveform.visible = kind !== null;
  const exhibits = root.getObjectByName('PreservationExhibits');
  if (exhibits) for (const child of exhibits.children) child.visible = child.name === kind;
}
