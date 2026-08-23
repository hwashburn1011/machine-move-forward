import * as THREE from 'three';
import { PALETTE } from './Palette';
import { TextureFactory } from './TextureFactory';
import { applyHeightFog } from './Fog';
import type { TextureSet, TextureSets } from './TextureLoader';

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
  readonly buildPlate: THREE.MeshStandardMaterial;
  readonly stationMetal: THREE.MeshStandardMaterial;
  readonly bareSteel: THREE.MeshStandardMaterial;
  readonly accent: THREE.MeshStandardMaterial;
  readonly hazard: THREE.MeshStandardMaterial;
  readonly rubber: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshPhysicalMaterial;
  readonly emissiveWarn: THREE.MeshStandardMaterial;

  private readonly disposables: (THREE.Material | THREE.Texture)[] = [];

  /**
   * How many times a loaded texture tiles per metre.
   *
   * The extruded geometry generates UVs in world units, so this is a real
   * scale rather than a fudge: 0.5 puts one texture tile across two metres,
   * matching the build grid.
   */
  private static readonly TEXTURE_REPEAT = 0.5;

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

    // Lighter than the machine's own deck, so player additions are visually
    // distinguishable from the original hull at a glance.
    this.buildPlate = this.register(
      new THREE.MeshStandardMaterial({
        color: PALETTE.buildPlate,
        map: deckTex,
        normalMap: deckNormal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughness: 0.74,
        metalness: 0.3,
      }),
    );

    this.stationMetal = this.register(
      new THREE.MeshStandardMaterial({
        color: PALETTE.accentTeal,
        map: paintTex,
        normalMap: paintNormal,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughness: 0.55,
        metalness: 0.45,
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
        color: new THREE.Color(0.035, 0.034, 0.038),
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

    // Distinct cache tags. Materials that differ only in colour and roughness
    // otherwise produce identical program cache keys and share one compiled
    // program — see the note in applyHeightFog.
    const tagged: [THREE.Material, string][] = [
      [this.hull, 'hull'],
      [this.hullDark, 'hull-dark'],
      [this.rustedSteel, 'rusted-steel'],
      [this.deckPlate, 'deck-plate'],
      [this.buildPlate, 'build-plate'],
      [this.stationMetal, 'station-metal'],
      [this.bareSteel, 'bare-steel'],
      [this.accent, 'accent'],
      [this.hazard, 'hazard'],
      [this.rubber, 'rubber'],
      [this.glass, 'glass'],
      [this.emissiveWarn, 'emissive-warn'],
    ];
    for (const [m, tag] of tagged) applyHeightFog(m, `mmf-${tag}`);
  }

  /**
   * Swap in loaded PBR textures over the procedural maps.
   *
   * Applied after construction rather than passed in, so the procedural path
   * stays the one and only way a material is built. Slots without a loaded
   * set are left exactly as they were — a partial load degrades one surface,
   * never the whole machine.
   */
  applyTextureSets(sets: TextureSets): void {
    this.bind(this.hull, sets.hull);
    this.bind(this.rustedSteel, sets['rusted-steel']);
    this.bind(this.deckPlate, sets['deck-plate']);
  }

  private bind(material: THREE.MeshStandardMaterial, set: TextureSet | undefined): void {
    if (!set) return;

    for (const texture of [set.map, set.normalMap, set.armMap]) {
      texture.repeat.setScalar(Materials.TEXTURE_REPEAT);
      this.disposables.push(texture);
    }

    material.map = set.map;
    material.normalMap = set.normalMap;
    // One packed image drives all three: red is occlusion, green roughness,
    // blue metalness. Three samples the channel it needs from each binding.
    material.aoMap = set.armMap;
    material.roughnessMap = set.armMap;
    material.metalnessMap = set.armMap;

    // The photo albedo already carries its own hue, and the scalar factors
    // multiply their maps — tinting or damping here would double-apply what
    // the texture already says.
    material.color.setHex(0xffffff);
    material.roughness = 1;
    material.metalness = 1;
    material.needsUpdate = true;
  }

  get all(): THREE.Material[] {
    return [
      this.hull,
      this.hullDark,
      this.rustedSteel,
      this.deckPlate,
      this.buildPlate,
      this.stationMetal,
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
