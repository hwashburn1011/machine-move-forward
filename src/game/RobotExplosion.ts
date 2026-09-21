import * as THREE from 'three';

// A short fuel/capacitor detonation, with billowing emissive fire followed by
// thin ash. Procedural alpha avoids opaque smoke cards or missing-texture boxes.
const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const fragmentShader = `
varying vec2 vUv;
uniform float age;
uniform float seed;
uniform float smoke;
uniform float opacity;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p) {
  float n=0.0, a=0.55;
  for(int i=0;i<4;i++){n+=a*noise(p);p=p*2.03+vec2(13.4,7.9);a*=0.5;}
  return n;
}
void main() {
  vec2 p=(vUv-0.5)*2.0;
  vec2 flow=p*3.5+vec2(seed, -age*1.8);
  float billow=fbm(flow+vec2(fbm(flow+4.0),fbm(flow+9.0))*1.3);
  float radius=length(p);
  float edge=1.0-smoothstep(0.54+billow*0.23,0.9,radius);
  float alpha=edge*opacity;
  vec3 color;
  if(smoke>0.5){
    color=mix(vec3(0.25,0.23,0.20),vec3(0.54,0.49,0.42),billow);
    alpha*=0.36*(0.4+billow);
  }else{
    float heat=clamp((1.0-radius)*0.46+billow*0.85-age*0.22,0.0,1.0);
    color=mix(vec3(0.7,0.025,0.003),vec3(1.55,0.22,0.012),smoothstep(0.15,0.55,heat));
    color=mix(color,vec3(2.1,1.2,0.36),smoothstep(0.74,1.01,heat));
    alpha*=0.88;
  }
  if(alpha<0.005)discard;
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface Plume {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  velocity: THREE.Vector3;
  delay: number;
  duration: number;
  size: number;
  smoke: boolean;
}

/** Self-contained presentation effect: no damage, collision, or gameplay state. */
export class RobotExplosion {
  readonly object = new THREE.Group();
  private readonly plane = new THREE.PlaneGeometry(1, 1);
  private readonly plumes: Plume[] = [];
  private readonly sparks: { line: THREE.Line; velocity: THREE.Vector3 }[] = [];
  private readonly light = new THREE.PointLight(0xff9b38, 0, 7, 2);
  private age = 0;
  private active = false;
  private disposed = false;

  constructor(scene: THREE.Scene, at: { x: number; y: number; z: number }, startActive = true) {
    this.object.name = 'robot-detonation';
    this.object.position.set(at.x, at.y + 0.12, at.z);
    this.light.name = 'robot-detonation-flash';
    this.light.castShadow = false;
    this.object.add(this.light);
    scene.add(this.object);
    for (let i = 0; i < 10; i++) {
      const smoke = i >= 7;
      const angle = i * 2.39996;
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
          age: { value: 0 },
          seed: { value: i * 7.37 },
          smoke: { value: smoke ? 1 : 0 },
          opacity: { value: 0 },
        },
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.plane, material);
      mesh.name = smoke ? 'detonation-ash' : 'detonation-fire';
      mesh.position.set(Math.cos(angle) * 0.23, (i % 3) * 0.13, Math.sin(angle) * 0.23);
      mesh.visible = false;
      this.object.add(mesh);
      this.plumes.push({
        mesh,
        smoke,
        delay: smoke ? 0.32 + (i - 7) * 0.14 : i * 0.023,
        duration: smoke ? 1.55 : 0.82 + (i % 3) * 0.12,
        size: smoke ? 1.6 : 1.15 + (i % 3) * 0.2,
        velocity: new THREE.Vector3(
          Math.cos(angle) * 0.6,
          smoke ? 0.85 : 0.3 + (i % 3) * 0.28,
          Math.sin(angle) * 0.6,
        ),
      });
    }
    for (let i = 0; i < 24; i++) {
      const angle = i * 2.39996;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * (1.5 + (i % 4)),
        0.8 + (i % 6) * 0.48,
        Math.sin(angle) * (1.5 + (i % 4)),
      );
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(),
          velocity.clone().normalize().multiplyScalar(-0.18),
        ]),
        new THREE.LineBasicMaterial({
          color: i % 3 ? 0xffb34e : 0xfff0b5,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      line.name = 'detonation-spark';
      line.visible = false;
      this.object.add(line);
      this.sparks.push({ line, velocity });
    }
    if (startActive) this.trigger(at);
  }

  /** Reuse uploaded geometry/materials; the zero-intensity light stays resident
   * so simultaneous explosions never change the scene's shader light count. */
  trigger(at: { x: number; y: number; z: number }): void {
    if (this.disposed) return;
    this.reset();
    this.object.position.set(at.x, at.y + 0.12, at.z);
    this.active = true;
    this.light.intensity = 16;
  }

  reset(): void {
    this.age = 0;
    this.active = false;
    this.light.intensity = 0;
    for (const p of this.plumes) p.mesh.visible = false;
    for (const s of this.sparks) s.line.visible = false;
  }

  /** Returns false after all fire, ash and embers have faded. */
  update(dt: number, camera: THREE.Camera): boolean {
    if (this.disposed || !this.active) return false;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.age += step;
    this.light.intensity = 16 * Math.pow(Math.max(0, 1 - this.age / 0.55), 2);
    for (let i = 0; i < this.plumes.length; i++) {
      const p = this.plumes[i]!;
      const elapsed = this.age - p.delay;
      p.mesh.visible = elapsed >= 0 && elapsed < p.duration;
      if (!p.mesh.visible) continue;
      const t = elapsed / p.duration;
      p.mesh.quaternion.copy(camera.quaternion);
      const angle = i * 2.39996;
      p.mesh.position
        .set(Math.cos(angle) * 0.23, (i % 3) * 0.13, Math.sin(angle) * 0.23)
        .addScaledVector(p.velocity, elapsed);
      p.mesh.scale.setScalar(
        p.size * (0.3 + 1.15 * (1 - Math.exp(-elapsed * 8)) + (p.smoke ? elapsed * 0.5 : 0)),
      );
      p.mesh.material.uniforms.age!.value = t;
      p.mesh.material.uniforms.opacity!.value =
        Math.min(1, elapsed / 0.055) * Math.pow(1 - t, p.smoke ? 0.8 : 0.65);
    }
    for (const spark of this.sparks) {
      spark.line.visible = this.age < 1.05;
      spark.line.position.copy(spark.velocity).multiplyScalar(this.age);
      spark.line.position.y -= 2.5 * this.age * this.age;
      (spark.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, 1 - this.age / 1.05);
    }
    if (this.age >= 2.25) this.reset();
    return this.active;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.plane.dispose();
    for (const p of this.plumes) p.mesh.material.dispose();
    for (const s of this.sparks) {
      s.line.geometry.dispose();
      (s.line.material as THREE.Material).dispose();
    }
    this.light.dispose();
    this.object.clear();
  }
}
