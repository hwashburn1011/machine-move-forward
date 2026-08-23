import * as THREE from 'three';
import { PALETTE } from './Palette';
import { TextureFactory } from './TextureFactory';
import { applyHeightFog } from './Fog';

/**
 * Shared material library.
 *
 * The whole machine is built from this handful of materials rather than one
 * per piece. That is a direct draw-call decision: Three batches by material,
 * and a hundred bespoke materials would mean a hundred state changes for
 * geometry that could have been merged.
 */
export class Materials {
  readonly hull: THREE.MeshStandardMaterial;
  readonly hullDark: THREE.MeshStandardMaterial;
  readonly rustedSteel: THREE.MeshStandardMaterial;
  readonly deckPlate: THREE.MeshStandardMaterial;
  readonly bareSteel: THREE.MeshStandardMaterial;
  readonly accent: THREE.MeshStandardMaterial;
  readonly hazard: THREE.MeshStandardMaterial;
  readonly rubber: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshPhysicalMaterial;
  readonly emissiveWarn: THREE.MeshStandardMaterial;

  private readonly disposables: (THREE.Material | THREE.Texture)[] = [];

  constructor() {
    // Near-white detail maps. Hue comes from each material's `color`; baking it
    // into the texture as well double-darkens every surface.
    const paintTex = TextureFactory.paintedMetal(256, 11, [0.9, 0.9, 0.88]);
    const paintNormal = TextureFactory.noiseNormal(256, 11, 5, 0.6);
    const rustTex = TextureFactory.rust(256, 23);
    const rustNormal = TextureFactory.noiseNormal(256, 23, 7, 1.0);
    const deckTex = TextureFactory.deckPlate(256, 5);
    const deckNormal = TextureFactory.noiseNormal(256, 5, 6, 0.8);

    this.hull = this.register(
      new THREE.MeshStandardMaterial({
        color: PALETTE.hullPaint,
        map: paintTex,
        normalMap: paintNormal,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughness: 0.72,
        metalness: 0.25,
      }),
    );

    this.hullDark = this.register(
      new THREE.MeshStandardMaterial({
        color: PALETTE.hullDark,
        map: paintTex,
        normalMap: paintNormal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughness: 0.8,
        metalness: 0.3,
      }),
    );

    this.rustedSteel = this.register(
      new THREE.MeshStandardMaterial({
        // rustTex is a full-colour albedo, so the base stays white here.
        color: 0xffffff,
        map: rustTex,
        normalMap: rustNormal,
        normalScale: new THREE.Vector2(0.7, 0.7),
        roughness: 0.88,
        metalness: 0.45,
      }),
    );

    this.deckPlate = this.register(
      new THREE.MeshStandardMaterial({
        color: PALETTE.deckPlate,
        map: deckTex,
        normalMap: deckNormal,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughness: 0.78,
        metalness: 0.35,
      }),
    );

    this.bareSteel = this.register(
      new THREE.MeshStandardMaterial({
        color: PALETTE.steel,
        normalMap: paintNormal,
        normalScale: new THREE.Vector2(0.3, 0.3),
        // Not a pure metal. At metalness ~0.9 there is no diffuse term at all,
        // and with only sky IBL to reflect the surface reads black rather than
        // metallic. Keeping some diffuse is what makes it look like steel.
        roughness: 0.42,
        metalness: 0.72,
      }),
    );

    this.accent = this.register(
      new THREE.MeshStandardMaterial({
        color: PALETTE.accentOrange,
        map: paintTex,
        roughness: 0.6,
        metalness: 0.2,
      }),
    );

    this.hazard = this.register(
      new THREE.MeshStandardMaterial({
        color: PALETTE.hazard,
        map: paintTex,
        roughness: 0.65,
        metalness: 0.2,
      }),
    );

    this.rubber = this.register(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.055, 0.055, 0.06),
        roughness: 0.95,
        metalness: 0.0,
      }),
    );

    this.glass = this.register(
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0.6, 0.72, 0.75),
        roughness: 0.12,
        metalness: 0.0,
        transmission: 0.55,
        thickness: 0.05,
        transparent: true,
        opacity: 0.55,
      }),
    );

    // Emissive so it survives into the bloom threshold and reads as a lamp.
    this.emissiveWarn = this.register(
      new THREE.MeshStandardMaterial({
        color: PALETTE.accentOrange,
        emissive: PALETTE.accentOrange,
        emissiveIntensity: 3.5,
        roughness: 0.4,
        metalness: 0.1,
      }),
    );

    this.disposables.push(
      paintTex,
      paintNormal,
      rustTex,
      rustNormal,
      deckTex,
      deckNormal,
    );

    for (const m of this.all) applyHeightFog(m);
  }

  get all(): THREE.Material[] {
    return [
      this.hull,
      this.hullDark,
      this.rustedSteel,
      this.deckPlate,
      this.bareSteel,
      this.accent,
      this.hazard,
      this.rubber,
      this.glass,
      this.emissiveWarn,
    ];
  }

  /**
   * Set texture repeat for a material used across a large surface, so plating
   * reads at a believable physical scale rather than stretching.
   */
  static setRepeat(material: THREE.MeshStandardMaterial, x: number, y: number): void {
    for (const tex of [material.map, material.normalMap]) {
      if (!tex) continue;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(x, y);
    }
  }

  private register<T extends THREE.Material>(m: T): T {
    this.disposables.push(m);
    return m;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
