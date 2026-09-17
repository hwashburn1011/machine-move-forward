import * as THREE from 'three';
import type { LoadedModel } from '@/art/ModelLoader';
import { DECK_SURFACE_Y } from '@/game/constants';
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';
import type { MachineDamage } from './MachineDamage';

/** Decorative replacements at the existing engine and leg repair anchors. */
export class WorkshopVisuals {
  readonly root = new THREE.Group();
  private readonly indicators = new Map<SubsystemId, THREE.MeshStandardMaterial[]>();
  private readonly ownedMaterials = new Set<THREE.Material>();
  private rotor: THREE.Object3D | null = null;
  private disposed = false;

  constructor(private readonly fallbackEngine: THREE.Object3D | undefined) {
    this.root.name = 'Nomad workshop machinery';
  }

  apply(model: LoadedModel | null): void {
    this.clear();
    if (this.disposed || !model) return;
    const engine = model.scene.getObjectByName('NomadDriveCore');
    const hatch = model.scene.getObjectByName('NomadLegServiceHatch');
    // A malformed optional kit must leave the established visual fallback intact.
    if (
      !engine ||
      !hatch ||
      !this.fits(engine, [1.4, 1.8, 1.3]) ||
      !this.fits(hatch, [0.38, 0.07, 0.43])
    )
      return;
    const drive = this.borrow(engine, 'engine');
    drive.position.set(0, DECK_SURFACE_Y, 6);
    this.root.add(drive);
    this.rotor = drive.getObjectByName('DriveRotor') ?? null;
    for (const id of Object.keys(SUBSYSTEMS) as SubsystemId[]) {
      if (id === 'engine') continue;
      const panel = this.borrow(hatch, id);
      const at = SUBSYSTEMS[id].repairAt;
      // The cover projects only 27 mm above the existing deck slab.
      panel.position.set(at.x, DECK_SURFACE_Y - 0.04, at.z);
      this.root.add(panel);
    }
    if (this.fallbackEngine) this.fallbackEngine.visible = false;
  }

  update(distance: number, damage: MachineDamage): void {
    if (this.rotor) this.rotor.rotation.z = (distance * 1.7) % (Math.PI * 2);
    for (const [id, materials] of this.indicators) {
      const health = damage.fraction(id);
      const color = health < 0.3 ? 0xff4433 : health < 0.8 ? 0xffb340 : 0x74ffd2;
      for (const material of materials) {
        material.color.setHex(color);
        material.emissive.setHex(color);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.root.removeFromParent();
    this.disposed = true;
  }

  private fits(source: THREE.Object3D, limits: readonly number[]): boolean {
    const clone = source.clone(true);
    clone.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(clone);
    return (
      !box.isEmpty() &&
      [box.min.x, box.max.x, box.min.y, box.max.y, box.min.z, box.max.z].every(Number.isFinite) &&
      box.min.x >= -limits[0]! - 0.002 &&
      box.max.x <= limits[0]! + 0.002 &&
      box.min.y >= -0.002 &&
      box.max.y <= limits[1]! + 0.002 &&
      box.min.z >= -limits[2]! - 0.002 &&
      box.max.z <= limits[2]! + 0.002
    );
  }

  private borrow(source: THREE.Object3D, id: SubsystemId): THREE.Object3D {
    const root = source.clone(true);
    root.name = `Workshop-${id}`;
    const indicators: THREE.MeshStandardMaterial[] = [];
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mutable = (material: THREE.Material): THREE.Material => {
        if (
          material.name !== 'Workshop_Status' ||
          !(material instanceof THREE.MeshStandardMaterial)
        )
          return material;
        const clone = material.clone();
        this.ownedMaterials.add(clone);
        indicators.push(clone);
        return clone;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(mutable)
        : mutable(object.material);
      object.receiveShadow = true;
    });
    this.indicators.set(id, indicators);
    return root;
  }

  private clear(): void {
    this.root.clear();
    this.rotor = null;
    this.indicators.clear();
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials.clear();
    if (this.fallbackEngine) this.fallbackEngine.visible = true;
  }
}
