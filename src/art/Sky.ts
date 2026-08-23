import * as THREE from 'three';
import { PALETTE } from './Palette';
import { SKY_FRAGMENT, SKY_VERTEX } from './shaders/skyShader';

/** Re-bake the environment map only after the sun has moved this far. */
const REBAKE_ANGLE_THRESHOLD = Math.cos(THREE.MathUtils.degToRad(0.5));
/** ...and never more often than this. Baking is expensive. */
const REBAKE_MIN_INTERVAL_MS = 500;

/**
 * Procedural sky dome plus the environment map baked from it.
 *
 * The PMREM bake is the highest-leverage visual technique available: every PBR
 * surface in the scene reflects and is ambient-lit by a sky that actually
 * exists, rather than by a flat guessed constant.
 */
export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly bakeScene: THREE.Scene;
  private envRT: THREE.WebGLRenderTarget | null = null;

  private readonly sunDirection = new THREE.Vector3(0.40, 0.62, -0.68).normalize();
  private lastBakedDirection = new THREE.Vector3(0, -1, 0);
  private lastBakeTime = -Infinity;
  private bakeCount = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uSunDirection: { value: this.sunDirection.clone() },
        uTurbidity: { value: 4.2 },
        uRayleigh: { value: 1.35 },
        uMieCoefficient: { value: 0.019 },
        uMieDirectionalG: { value: 0.76 },
        uDustAmount: { value: 1.0 },
        uDustColor: { value: PALETTE.skyDust.clone() },
        uExposure: { value: 0.16 },
        uSunIntensity: { value: 1.0 },
      },
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    // Draw first, behind everything else.
    this.mesh.renderOrder = -1000;
    this.mesh.scale.setScalar(1500);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();

    // A separate scene holding only the dome, so the bake captures the sky and
    // nothing else. Shares the same material, so it always matches.
    this.bakeScene = new THREE.Scene();
    const bakeMesh = new THREE.Mesh(this.mesh.geometry, this.material);
    bakeMesh.scale.setScalar(1500);
    bakeMesh.frustumCulled = false;
    this.bakeScene.add(bakeMesh);

    this.bake();
  }

  get environment(): THREE.Texture {
    if (!this.envRT) throw new Error('Sky.environment read before first bake');
    return this.envRT.texture;
  }

  get direction(): THREE.Vector3 {
    return this.sunDirection.clone();
  }

  /** Diagnostic for the bake-throttle check. */
  get bakes(): number {
    return this.bakeCount;
  }

  setSunDirection(dir: THREE.Vector3): void {
    this.sunDirection.copy(dir).normalize();
    (this.material.uniforms.uSunDirection!.value as THREE.Vector3).copy(this.sunDirection);
  }

  /**
   * Set the sun from a 0..1 time of day, where 0.5 is noon. Stays above the
   * horizon at the extremes — a full night cycle is later-milestone work.
   */
  setTimeOfDay(t: number): void {
    const angle = (t - 0.5) * Math.PI * 0.95;
    const elevation = Math.cos(angle) * 0.86 + 0.06;
    const horizontal = Math.sin(angle);
    this.setSunDirection(new THREE.Vector3(horizontal * 0.85, elevation, -0.55).normalize());
  }

  /**
   * Re-bake the environment map if the sun has moved enough to matter. Baking
   * every frame would cost more than the entire rest of the frame.
   */
  update(nowMs: number): boolean {
    const moved = this.sunDirection.dot(this.lastBakedDirection) < REBAKE_ANGLE_THRESHOLD;
    if (!moved) return false;
    if (nowMs - this.lastBakeTime < REBAKE_MIN_INTERVAL_MS) return false;
    this.bake(nowMs);
    return true;
  }

  private bake(nowMs = 0): void {
    const previous = this.envRT;
    // Explicit near/far: fromScene defaults to far=100, and the dome sits at
    // radius 1500. Relying on the default leaves the bake clipping-dependent.
    this.envRT = this.pmrem.fromScene(this.bakeScene, 0.04, 0.1, 4000);
    // Dispose AFTER the new one exists, so nothing reads a freed target.
    previous?.dispose();

    this.lastBakedDirection.copy(this.sunDirection);
    this.lastBakeTime = nowMs;
    this.bakeCount++;
  }

  /**
   * Sun colour sampled from the same model the shader uses, so the directional
   * light and the sky cannot drift apart.
   */
  sampleSunColor(): THREE.Color {
    const elevation = THREE.MathUtils.clamp(this.sunDirection.y, -0.2, 1);
    const lowSun = 1 - THREE.MathUtils.smoothstep(elevation, -0.05, 0.35);
    return new THREE.Color(1, 0.96, 0.86).lerp(new THREE.Color(1, 0.5, 0.24), lowSun * 0.85);
  }

  /**
   * Horizon colour, used as the fog colour. Sampling it from the sky is what
   * makes distant geometry dissolve into the atmosphere instead of fading to
   * an unrelated grey.
   */
  sampleHorizonColor(): THREE.Color {
    const elevation = THREE.MathUtils.clamp(this.sunDirection.y, -0.2, 1);
    const lowSun = 1 - THREE.MathUtils.smoothstep(elevation, -0.05, 0.35);
    const base = PALETTE.skyDust.clone();
    return base.lerp(new THREE.Color(0.85, 0.42, 0.24), lowSun * 0.6);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
  }
}
