import * as THREE from 'three';
import { PALETTE } from '@/art/Palette';
import type { QualitySettings } from './QualitySettings';

/**
 * Owns the WebGL renderer, scene, camera, and key lights.
 *
 * Tone mapping defaults to ACES here so the raw renderer produces a correct
 * image on its own. When the post-processing chain is active it takes tone
 * mapping over via `releaseToneMapping()` — applying it in both places would
 * double-apply it and wash the whole image out.
 */
export class Renderer {
  readonly three: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;

  private quality: QualitySettings;

  constructor(canvas: HTMLCanvasElement, quality: QualitySettings) {
    this.quality = quality;

    this.three = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // the composer's MSAA target handles this
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.three.outputColorSpace = THREE.SRGBColorSpace;
    this.three.toneMapping = THREE.ACESFilmicToneMapping;
    this.three.toneMappingExposure = 1.05;
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxPixelRatio));
    this.three.setSize(window.innerWidth, window.innerHeight);
    this.three.shadowMap.enabled = quality.shadowsEnabled;
    this.three.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.environmentIntensity = 1.3;

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    this.camera.position.set(0, 6, 12);

    // --- Sun ---------------------------------------------------------------
    // Because the machine never leaves the origin, this shadow camera can be a
    // tight fixed box instead of a large volume chasing a moving target. That
    // is what buys crisp contact shadows, and it is a direct dividend of the
    // world-scroll architecture.
    this.sun = new THREE.DirectionalLight(PALETTE.sunLight, 3.0);
    this.sun.position.set(28, 34, -18);
    this.sun.castShadow = quality.shadowsEnabled;
    this.sun.shadow.camera.left = -22;
    this.sun.shadow.camera.right = 22;
    this.sun.shadow.camera.top = 22;
    this.sun.shadow.camera.bottom = -22;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 110;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target); // target at origin — the machine

    // --- Fill --------------------------------------------------------------
    // Cool from above, warm bounce from the sand below.
    //
    // Readability over realism. A physically-correct sun:sky ratio out here is
    // roughly 10:1, which drives every shadow side to near-black against lit
    // sand. The handoff asks for Raft-level legibility, so the ratio is
    // compressed to about 3:1 — shadows stay clearly cool and clearly readable.
    this.hemi = new THREE.HemisphereLight(PALETTE.skyFill, PALETTE.bounceLight, 3.0);
    this.scene.add(this.hemi);

    window.addEventListener('resize', this.resize);
  }

  /** Direction the sun light arrives FROM, normalised. */
  get sunDirection(): THREE.Vector3 {
    return this.sun.position.clone().normalize();
  }

  setSunDirection(dir: THREE.Vector3, distance = 60): void {
    this.sun.position.copy(dir).normalize().multiplyScalar(distance);
  }

  setEnvironment(texture: THREE.Texture): void {
    this.scene.environment = texture;
  }

  /**
   * Hand tone mapping to the post-processing chain's OutputPass. Called once,
   * by PostProcessing, when it takes over final output.
   */
  releaseToneMapping(): void {
    this.three.toneMapping = THREE.NoToneMapping;
  }

  applyQuality(quality: QualitySettings): void {
    this.quality = quality;
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxPixelRatio));
    this.three.shadowMap.enabled = quality.shadowsEnabled;
    this.sun.castShadow = quality.shadowsEnabled;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** Extra cameras (the player rig) that must track viewport resizes. */
  readonly extraCameras: THREE.PerspectiveCamera[] = [];

  readonly resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    for (const cam of this.extraCameras) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    this.camera.updateProjectionMatrix();
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.maxPixelRatio));
    this.three.setSize(w, h);
  };

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.three.dispose();
  }
}
