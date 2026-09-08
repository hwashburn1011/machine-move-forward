import * as THREE from 'three';

export interface EmitOptions {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  size: number;
  color: THREE.Color;
  /** Metres per second squared, applied to Y. */
  gravity?: number;
  /** Velocity retained per second. 1 = none. */
  drag?: number;
  /** Peak opacity before the lifetime fade. Dust wants this low. */
  alpha?: number;
}

/**
 * Pooled GPU particles.
 *
 * One THREE.Points with preallocated typed arrays. Dead particles are swapped
 * to the tail and the draw range is trimmed, so dead particles cost nothing
 * and nothing is ever allocated during update — allocation per particle per
 * frame is the standard way this system becomes the frame budget.
 *
 * Sprites are drawn as a radial falloff computed in the fragment shader
 * rather than sampled from a texture, since the project ships no image files.
 */
export class ParticleSystem {
  readonly points: THREE.Points;

  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  private peakAlpha: Float32Array;

  private velX: Float32Array;
  private velY: Float32Array;
  private velZ: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private gravity: Float32Array;
  private drag: Float32Array;
  private capacity: number;
  private maxEmitsPerStep: number;

  private live = 0;
  private emittedThisStep = 0;

  constructor(
    scene: THREE.Scene,
    capacity: number,
    additive = false,
    maxEmitsPerStep = Math.max(12, Math.ceil(capacity * 0.45)),
  ) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.maxEmitsPerStep = Math.max(1, Math.min(this.capacity, maxEmitsPerStep));
    this.positions = new Float32Array(this.capacity * 3);
    this.colors = new Float32Array(this.capacity * 3);
    this.sizes = new Float32Array(this.capacity);
    this.alphas = new Float32Array(this.capacity);
    this.peakAlpha = new Float32Array(this.capacity);
    this.velX = new Float32Array(this.capacity);
    this.velY = new Float32Array(this.capacity);
    this.velZ = new Float32Array(this.capacity);
    this.life = new Float32Array(this.capacity);
    this.maxLife = new Float32Array(this.capacity);
    this.gravity = new Float32Array(this.capacity);
    this.drag = new Float32Array(this.capacity);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.setDrawRange(0, 0);
    // Particles move constantly; a stale bounding sphere would cull them.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uPixelScale: { value: window.innerHeight * 0.5 },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uPixelScale;

        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Perspective-correct point size.
          gl_PointSize = aSize * uPixelScale / max(-mv.z, 0.001);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          // Soft round sprite, computed rather than sampled — no texture files.
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float falloff = smoothstep(0.5, 0.08, d);
          gl_FragColor = vec4(vColor, vAlpha * falloff);

          // A raw ShaderMaterial does not get tone mapping or the output
          // colour-space conversion for free, so without these the particles
          // are written as linear values into an sRGB buffer and read far
          // too dark. Same trap as the sky dome.
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      vertexColors: true,
    });

    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }

  get liveCount(): number {
    return this.live;
  }

  get maxCount(): number {
    return this.capacity;
  }

  /**
   * Change the GPU pool size at a quality transition without dropping live
   * particles unless the new budget is smaller than the current live set.
   * The attributes are replaced in place on the existing Points object, so
   * scene ownership and shader programs remain stable.
   */
  resizeCapacity(nextCapacity: number, maxEmitsPerStep = this.maxEmitsPerStep): void {
    const next = Math.max(1, Math.floor(nextCapacity));
    if (next === this.capacity) {
      this.maxEmitsPerStep = Math.max(1, Math.min(next, Math.floor(maxEmitsPerStep)));
      return;
    }

    const oldLive = this.live;
    const positions = new Float32Array(next * 3);
    const colors = new Float32Array(next * 3);
    const sizes = new Float32Array(next);
    const alphas = new Float32Array(next);
    const peakAlpha = new Float32Array(next);
    const velX = new Float32Array(next);
    const velY = new Float32Array(next);
    const velZ = new Float32Array(next);
    const life = new Float32Array(next);
    const maxLife = new Float32Array(next);
    const gravity = new Float32Array(next);
    const drag = new Float32Array(next);
    const retained = Math.min(oldLive, next);
    positions.set(this.positions.subarray(0, retained * 3));
    colors.set(this.colors.subarray(0, retained * 3));
    sizes.set(this.sizes.subarray(0, retained));
    alphas.set(this.alphas.subarray(0, retained));
    peakAlpha.set(this.peakAlpha.subarray(0, retained));
    velX.set(this.velX.subarray(0, retained));
    velY.set(this.velY.subarray(0, retained));
    velZ.set(this.velZ.subarray(0, retained));
    life.set(this.life.subarray(0, retained));
    maxLife.set(this.maxLife.subarray(0, retained));
    gravity.set(this.gravity.subarray(0, retained));
    drag.set(this.drag.subarray(0, retained));

    this.capacity = next;
    this.positions = positions;
    this.colors = colors;
    this.sizes = sizes;
    this.alphas = alphas;
    this.peakAlpha = peakAlpha;
    this.velX = velX;
    this.velY = velY;
    this.velZ = velZ;
    this.life = life;
    this.maxLife = maxLife;
    this.gravity = gravity;
    this.drag = drag;
    this.live = retained;
    this.maxEmitsPerStep = Math.max(1, Math.min(next, Math.floor(maxEmitsPerStep)));

    const geo = this.points.geometry;
    // Release the previous GPU attributes before installing a different size.
    // Three will register this geometry again on the next rendered frame.
    geo.dispose();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.setDrawRange(0, retained);
  }

  emit(o: EmitOptions): void {
    // Silently drop rather than growing: a hard cap is what keeps the frame
    // budget predictable when a lot happens at once.
    if (this.live >= this.capacity || this.emittedThisStep >= this.maxEmitsPerStep) return;
    this.emittedThisStep++;

    const i = this.live++;
    const i3 = i * 3;

    this.positions[i3] = o.position.x;
    this.positions[i3 + 1] = o.position.y;
    this.positions[i3 + 2] = o.position.z;
    this.colors[i3] = o.color.r;
    this.colors[i3 + 1] = o.color.g;
    this.colors[i3 + 2] = o.color.b;

    this.velX[i] = o.velocity.x;
    this.velY[i] = o.velocity.y;
    this.velZ[i] = o.velocity.z;
    this.sizes[i] = o.size;
    this.peakAlpha[i] = o.alpha ?? 1;
    this.alphas[i] = this.peakAlpha[i]!;
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.gravity[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 1;
  }

  update(dt: number): void {
    for (let i = 0; i < this.live; i++) {
      this.life[i]! -= dt;

      if (this.life[i]! <= 0) {
        // Swap-remove: move the tail particle into this slot and re-test it.
        this.live--;
        if (i !== this.live) this.copySlot(this.live, i);
        i--;
        continue;
      }

      const decay = Math.pow(this.drag[i]!, dt);
      this.velX[i]! *= decay;
      this.velZ[i]! *= decay;
      this.velY[i] = this.velY[i]! * decay + this.gravity[i]! * dt;

      const i3 = i * 3;
      this.positions[i3]! += this.velX[i]! * dt;
      this.positions[i3 + 1]! += this.velY[i]! * dt;
      this.positions[i3 + 2]! += this.velZ[i]! * dt;

      // Fade out over the back half of the lifetime.
      const t = this.life[i]! / this.maxLife[i]!;
      this.alphas[i] = this.peakAlpha[i]! * (t > 0.5 ? 1 : t * 2);
    }

    const geo = this.points.geometry;
    geo.setDrawRange(0, this.live);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    // Emission limits apply to the interval between updates. Resetting here
    // keeps burst-heavy combat and footfalls bounded without starving the next
    // simulation step.
    this.emittedThisStep = 0;
  }

  private copySlot(from: number, to: number): void {
    const f3 = from * 3;
    const t3 = to * 3;
    for (let c = 0; c < 3; c++) {
      this.positions[t3 + c] = this.positions[f3 + c]!;
      this.colors[t3 + c] = this.colors[f3 + c]!;
    }
    this.velX[to] = this.velX[from]!;
    this.velY[to] = this.velY[from]!;
    this.velZ[to] = this.velZ[from]!;
    this.sizes[to] = this.sizes[from]!;
    this.alphas[to] = this.alphas[from]!;
    this.peakAlpha[to] = this.peakAlpha[from]!;
    this.life[to] = this.life[from]!;
    this.maxLife[to] = this.maxLife[from]!;
    this.gravity[to] = this.gravity[from]!;
    this.drag[to] = this.drag[from]!;
  }

  onResize(): void {
    const mat = this.points.material as THREE.ShaderMaterial;
    mat.uniforms.uPixelScale!.value = window.innerHeight * 0.5;
  }

  clear(): void {
    this.live = 0;
    this.emittedThisStep = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
