import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HeatShimmerShader } from '@/art/shaders/heatShimmer';
import { ColorGradeShader } from '@/art/shaders/colorGrade';
import type { QualitySettings } from './QualitySettings';
import type { Renderer } from './Renderer';

export type EffectName = 'bloom' | 'shimmer' | 'grade';

export interface PostProcessingDiagnostics {
  logicalWidth: number;
  logicalHeight: number;
  pixelRatio: number;
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  msaaSamples: number;
  gtao: boolean;
  gtaoWidth: number;
  gtaoHeight: number;
  shimmer: boolean;
  postBypassed: boolean;
}

/**
 * HDR post-processing chain.
 *
 * RenderPass -> optional half-resolution GTAO -> bloom -> shimmer -> grade ->
 * one OutputPass. GTAOPass owns its own half-resolution depth/normal buffer;
 * shimmer reuses that depth texture, so the enabled High path does not add a
 * second scene depth draw. If shimmer is enabled without AO, a small fallback
 * depth prepass is allocated only for that configuration.
 */
export class PostProcessing {
  private readonly renderer: Renderer;
  private readonly scene: THREE.Scene;
  private composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly shimmerPass: ShaderPass;
  private readonly gradePass: ShaderPass;
  private readonly outputPass: OutputPass;
  private gtaoPass: GTAOPass | null = null;

  private depthTexture: THREE.DepthTexture | null = null;
  private depthTarget: THREE.WebGLRenderTarget | null = null;
  private depthMaterial: THREE.MeshDepthMaterial | null = null;
  private time = 0;
  private enabled = true;
  private currentMsaaSamples = 0;
  private currentPixelRatio = 1;
  private logicalWidth: number;
  private logicalHeight: number;

  constructor(
    renderer: Renderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    quality: QualitySettings,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    const size = renderer.three.getSize(new THREE.Vector2());
    this.logicalWidth = size.x;
    this.logicalHeight = size.y;
    this.currentMsaaSamples = this.resolveMsaaSamples(quality.msaaSamples);
    this.currentPixelRatio = renderer.effectivePixelRatio;
    this.composer = this.createComposer(this.currentMsaaSamples);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.ensureGtao(quality);

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.34, 0.55, 0.9);
    this.bloomPass.enabled = quality.bloom;
    this.composer.addPass(this.bloomPass);

    this.shimmerPass = new ShaderPass(HeatShimmerShader);
    this.shimmerPass.enabled = quality.heatShimmer;
    this.composer.addPass(this.shimmerPass);

    this.gradePass = new ShaderPass(ColorGradeShader);
    this.gradePass.uniforms.uGrain!.value = quality.grain ? 0.004 : 0;
    this.composer.addPass(this.gradePass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.syncGtaoSize();
    this.configureDepthSource(quality.heatShimmer);
    this.updateCameraUniforms(camera);
    renderer.releaseToneMapping();
  }

  setCamera(camera: THREE.Camera): void {
    this.renderPass.camera = camera;
    if (this.gtaoPass) this.gtaoPass.camera = camera;
    this.updateCameraUniforms(camera);
  }

  setEnabled(effect: EffectName, on: boolean): void {
    if (effect === 'bloom') this.bloomPass.enabled = on;
    if (effect === 'shimmer') {
      this.shimmerPass.enabled = on;
      this.configureDepthSource(on);
    }
    if (effect === 'grade') this.gradePass.enabled = on;
  }

  isEnabled(effect: EffectName): boolean {
    if (effect === 'bloom') return this.bloomPass.enabled;
    if (effect === 'shimmer') return this.shimmerPass.enabled;
    return this.gradePass.enabled;
  }

  setBypassed(bypassed: boolean): void {
    this.enabled = !bypassed;
    this.renderer.three.toneMapping = bypassed ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  }

  get bypassed(): boolean {
    return !this.enabled;
  }

  applyQuality(quality: QualitySettings): void {
    const nextSamples = this.resolveMsaaSamples(quality.msaaSamples);
    const nextPixelRatio = this.renderer.effectivePixelRatio;
    if (nextSamples !== this.currentMsaaSamples || nextPixelRatio !== this.currentPixelRatio) {
      this.recreateRenderTarget(nextSamples);
      this.currentMsaaSamples = nextSamples;
      this.currentPixelRatio = nextPixelRatio;
    }

    this.ensureGtao(quality);
    this.bloomPass.enabled = quality.bloom;
    this.shimmerPass.enabled = quality.heatShimmer;
    this.gradePass.uniforms.uGrain!.value = quality.grain ? 0.004 : 0;
    this.syncGtaoSize();
    this.configureDepthSource(quality.heatShimmer);
  }

  render(dt: number, scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) {
      this.renderer.three.render(scene, camera);
      return;
    }

    const autoMatrices = scene.matrixWorldAutoUpdate;
    const shadowMap = this.renderer.three.shadowMap;
    const autoShadows = shadowMap.autoUpdate;
    // Color, AO normals and optional depth all draw the same frame. Traverse
    // transforms and render the sun shadow once, not once per scene pass.
    scene.updateMatrixWorld();
    scene.matrixWorldAutoUpdate = false;
    shadowMap.autoUpdate = false;
    shadowMap.needsUpdate = true;
    try {
      if (this.shimmerPass.enabled && !this.gtaoPass) this.renderDepth(scene, camera);
      this.time += dt;
      this.shimmerPass.uniforms.uTime!.value = this.time;
      this.gradePass.uniforms.uTime!.value = this.time;
      this.updateCameraUniforms(camera);
      this.composer.render(dt);
    } finally {
      scene.matrixWorldAutoUpdate = autoMatrices;
      shadowMap.autoUpdate = autoShadows;
    }
  }

  resize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width);
    this.logicalHeight = Math.max(1, height);
    const nextPixelRatio = this.renderer.effectivePixelRatio;
    if (nextPixelRatio !== this.currentPixelRatio) {
      this.recreateRenderTarget(this.currentMsaaSamples);
      this.currentPixelRatio = nextPixelRatio;
    } else {
      this.composer.setSize(this.logicalWidth, this.logicalHeight);
    }
    this.syncGtaoSize();
    if (this.depthTarget) {
      const [w, h] = this.halfResolution();
      this.depthTarget.setSize(w, h);
    }
  }

  get diagnostics(): PostProcessingDiagnostics {
    const buffer = this.renderer.drawingBufferSize;
    const [gtaoWidth, gtaoHeight] = this.halfResolution();
    return {
      logicalWidth: this.logicalWidth,
      logicalHeight: this.logicalHeight,
      pixelRatio: this.renderer.effectivePixelRatio,
      drawingBufferWidth: buffer.width,
      drawingBufferHeight: buffer.height,
      msaaSamples: this.currentMsaaSamples,
      gtao: this.gtaoPass !== null && this.gtaoPass.enabled,
      gtaoWidth: this.gtaoPass ? gtaoWidth : 0,
      gtaoHeight: this.gtaoPass ? gtaoHeight : 0,
      shimmer: this.shimmerPass.enabled,
      postBypassed: this.bypassed,
    };
  }

  dispose(): void {
    if (this.gtaoPass) this.disposeGtao(this.gtaoPass);
    this.bloomPass.dispose();
    this.shimmerPass.dispose();
    this.gradePass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
    this.disposeFallbackDepth();
  }

  private createComposer(samples: number): EffectComposer {
    const pixelRatio = this.renderer.effectivePixelRatio;
    const target = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(this.logicalWidth * pixelRatio)),
      Math.max(1, Math.floor(this.logicalHeight * pixelRatio)),
      {
        type: THREE.HalfFloatType,
        samples,
        colorSpace: THREE.LinearSRGBColorSpace,
      },
    );
    const composer = new EffectComposer(this.renderer.three, target);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(this.logicalWidth, this.logicalHeight);
    return composer;
  }

  private recreateRenderTarget(samples: number): void {
    const next = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(this.logicalWidth * this.renderer.effectivePixelRatio)),
      Math.max(1, Math.floor(this.logicalHeight * this.renderer.effectivePixelRatio)),
      {
        type: THREE.HalfFloatType,
        samples,
        colorSpace: THREE.LinearSRGBColorSpace,
      },
    );
    this.composer.reset(next);
    this.composer.setPixelRatio(this.renderer.effectivePixelRatio);
    this.composer.setSize(this.logicalWidth, this.logicalHeight);
    this.currentPixelRatio = this.renderer.effectivePixelRatio;
  }

  private resolveMsaaSamples(requested: number): number {
    const max = this.renderer.maxRenderTargetSamples;
    if (requested <= 0 || max < 2) return 0;
    if (requested >= 4 && max >= 4) return 4;
    return 2;
  }

  private ensureGtao(quality: QualitySettings): void {
    if (quality.gtao && !this.gtaoPass) {
      this.gtaoPass = new GTAOPass(this.scene, this.renderPass.camera, 1, 1);
      this.gtaoPass.output = GTAOPass.OUTPUT.Default;
      this.gtaoPass.blendIntensity = 0.82;
      this.gtaoPass.updateGtaoMaterial({
        radius: 2.5,
        distanceExponent: 1.2,
        thickness: 1.0,
        scale: 1.15,
        samples: 8,
        screenSpaceRadius: false,
      });
      this.gtaoPass.updatePdMaterial({
        lumaPhi: 8,
        depthPhi: 2,
        normalPhi: 3,
        radius: 4,
        samples: 8,
      });
      this.composer.insertPass(this.gtaoPass, 1);
    } else if (!quality.gtao && this.gtaoPass) {
      const pass = this.gtaoPass;
      this.composer.removePass(pass);
      this.disposeGtao(pass);
      this.gtaoPass = null;
    }
  }

  private syncGtaoSize(): void {
    if (!this.gtaoPass) return;
    const [width, height] = this.halfResolution();
    this.gtaoPass.setSize(width, height);
  }

  private disposeGtao(pass: GTAOPass): void {
    // Three r185's GTAOPass.dispose omits these two owned shader materials.
    pass.gtaoMaterial.dispose();
    pass.blendMaterial.dispose();
    pass.dispose();
  }

  private halfResolution(): [number, number] {
    const ratio = this.renderer.effectivePixelRatio;
    return [
      Math.max(1, Math.floor((this.logicalWidth * ratio) / 2)),
      Math.max(1, Math.floor((this.logicalHeight * ratio) / 2)),
    ];
  }

  private configureDepthSource(shimmer: boolean): void {
    if (shimmer && !this.gtaoPass) {
      const [width, height] = this.halfResolution();
      if (!this.depthTexture || !this.depthTarget || !this.depthMaterial) {
        this.depthTexture = new THREE.DepthTexture(width, height);
        this.depthTarget = new THREE.WebGLRenderTarget(width, height, {
          depthTexture: this.depthTexture,
        });
        this.depthMaterial = new THREE.MeshDepthMaterial();
      } else {
        this.depthTarget.setSize(width, height);
      }
    } else if (!shimmer || this.gtaoPass) {
      this.disposeFallbackDepth();
    }
    this.syncShimmerDepthTexture();
  }

  private syncShimmerDepthTexture(): void {
    this.shimmerPass.uniforms.tDepth!.value = this.gtaoPass?.depthTexture ?? this.depthTexture;
  }

  private renderDepth(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.depthTarget || !this.depthMaterial) return;
    const three = this.renderer.three;
    const previousOverride = scene.overrideMaterial;
    scene.overrideMaterial = this.depthMaterial;
    three.setRenderTarget(this.depthTarget);
    three.clear();
    three.render(scene, camera);
    scene.overrideMaterial = previousOverride;
    three.setRenderTarget(null);
  }

  private updateCameraUniforms(camera: THREE.Camera): void {
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const perspective = camera as THREE.PerspectiveCamera;
      this.shimmerPass.uniforms.uCameraNear!.value = perspective.near;
      this.shimmerPass.uniforms.uCameraFar!.value = perspective.far;
    }
  }

  private disposeFallbackDepth(): void {
    this.depthTarget?.dispose();
    this.depthTexture?.dispose();
    this.depthMaterial?.dispose();
    this.depthTarget = null;
    this.depthTexture = null;
    this.depthMaterial = null;
  }
}
