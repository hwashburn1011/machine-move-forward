import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HeatShimmerShader } from '@/art/shaders/heatShimmer';
import { ColorGradeShader } from '@/art/shaders/colorGrade';
import type { QualitySettings } from './QualitySettings';
import type { Renderer } from './Renderer';

export type EffectName = 'bloom' | 'shimmer' | 'grade';

/**
 * Post-processing chain.
 *
 * Order is deliberate:
 *   render (MSAA, HDR) -> bloom -> heat shimmer -> grade+grain+vignette -> output
 *
 * Two details matter more than they look:
 *   - The render target must be HalfFloat. Bloom on an 8-bit target bands badly.
 *   - OutputPass owns tone mapping, so the Renderer hands it over. Applying it
 *     in both places double-applies it and washes the image out.
 */
export class PostProcessing {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly shimmerPass: ShaderPass;
  private readonly gradePass: ShaderPass;
  private readonly outputPass: OutputPass;
  /**
   * Scene depth for the shimmer's distance mask, filled by our own prepass.
   *
   * Not taken from the composer's buffers, and not for want of trying:
   * EffectComposer clones the target it is handed and the RenderPass draws
   * into the clone, so a depth texture attached to the original stays empty.
   * Attaching the same one to both buffers fills it, but then the shimmer
   * samples a depth attachment belonging to the framebuffer it is writing
   * into — a feedback loop, and undefined behaviour.
   *
   * A dedicated half-resolution depth-only prepass sidesteps both. It costs a
   * second geometry pass, but only at the tiers where the shimmer runs at
   * all, and a soft distance mask does not need full resolution.
   */
  private readonly depthTexture: THREE.DepthTexture;
  private readonly depthTarget: THREE.WebGLRenderTarget;
  private readonly depthMaterial = new THREE.MeshDepthMaterial();

  private time = 0;
  private enabled = true;

  constructor(
    private readonly renderer: Renderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    quality: QualitySettings,
  ) {
    const size = renderer.three.getSize(new THREE.Vector2());

    const depthWidth = Math.max(1, Math.floor(size.x / 2));
    const depthHeight = Math.max(1, Math.floor(size.y / 2));
    this.depthTexture = new THREE.DepthTexture(depthWidth, depthHeight);
    this.depthTarget = new THREE.WebGLRenderTarget(depthWidth, depthHeight, {
      depthTexture: this.depthTexture,
    });

    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      // HalfFloat keeps highlights above 1.0 intact for bloom, and stops the
      // sky gradient banding once the grade touches it.
      type: THREE.HalfFloatType,
      samples: quality.msaaSamples,
      colorSpace: THREE.LinearSRGBColorSpace,
    });

    this.composer = new EffectComposer(renderer.three, target);
    this.composer.setSize(size.x, size.y);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Threshold is high on purpose. A low threshold blooms the lit sand — the
    // brightest thing on screen by far — and the whole image turns to mush.
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.6, 0.85);
    this.bloomPass.enabled = quality.bloom;
    this.composer.addPass(this.bloomPass);

    this.shimmerPass = new ShaderPass(HeatShimmerShader);
    this.shimmerPass.uniforms.tDepth!.value = this.depthTexture;
    this.shimmerPass.enabled = quality.heatShimmer;
    this.composer.addPass(this.shimmerPass);

    this.gradePass = new ShaderPass(ColorGradeShader);
    this.gradePass.uniforms.uGrain!.value = quality.grain ? 0.028 : 0;
    this.composer.addPass(this.gradePass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    // Hand tone mapping to OutputPass now that the chain owns final output.
    renderer.releaseToneMapping();
  }

  setCamera(camera: THREE.Camera): void {
    this.renderPass.camera = camera;
  }

  setEnabled(effect: EffectName, on: boolean): void {
    if (effect === 'bloom') this.bloomPass.enabled = on;
    if (effect === 'shimmer') this.shimmerPass.enabled = on;
    if (effect === 'grade') this.gradePass.enabled = on;
  }

  isEnabled(effect: EffectName): boolean {
    if (effect === 'bloom') return this.bloomPass.enabled;
    if (effect === 'shimmer') return this.shimmerPass.enabled;
    return this.gradePass.enabled;
  }

  /** Bypass the whole chain, for A/B comparison from the debug keys. */
  setBypassed(bypassed: boolean): void {
    this.enabled = !bypassed;
    // Tone mapping has to follow, or bypassing produces an unmapped image.
    this.renderer.three.toneMapping = bypassed
      ? THREE.ACESFilmicToneMapping
      : THREE.NoToneMapping;
  }

  get bypassed(): boolean {
    return !this.enabled;
  }

  applyQuality(quality: QualitySettings): void {
    this.bloomPass.enabled = quality.bloom;
    this.shimmerPass.enabled = quality.heatShimmer;
    this.gradePass.uniforms.uGrain!.value = quality.grain ? 0.028 : 0;
  }

  render(dt: number, scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) {
      this.renderer.three.render(scene, camera);
      return;
    }

    // Depth first, into our own target, before the composer touches anything.
    if (this.shimmerPass.enabled) this.renderDepth(scene, camera);

    this.time += dt;
    this.shimmerPass.uniforms.uTime!.value = this.time;
    // Read from the live camera: the free-fly screenshot camera and the
    // player's own camera do not have to share a near and far plane, and a
    // stale pair would put the distance mask in the wrong place entirely.
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const perspective = camera as THREE.PerspectiveCamera;
      this.shimmerPass.uniforms.uCameraNear!.value = perspective.near;
      this.shimmerPass.uniforms.uCameraFar!.value = perspective.far;
    }
    this.gradePass.uniforms.uTime!.value = this.time;
    this.composer.render(dt);
  }

  /** Depth-only pass at half resolution, feeding the shimmer's distance mask. */
  private renderDepth(scene: THREE.Scene, camera: THREE.Camera): void {
    const three = this.renderer.three;
    const previousOverride = scene.overrideMaterial;

    scene.overrideMaterial = this.depthMaterial;
    three.setRenderTarget(this.depthTarget);
    three.clear();
    three.render(scene, camera);

    scene.overrideMaterial = previousOverride;
    three.setRenderTarget(null);
  }

  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
    // The depth target tracks the colour buffers, at half their resolution.
    this.depthTarget.setSize(Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2)));
  }

  dispose(): void {
    this.composer.dispose();
    this.depthTarget.dispose();
    this.depthTexture.dispose();
    this.depthMaterial.dispose();
  }
}
