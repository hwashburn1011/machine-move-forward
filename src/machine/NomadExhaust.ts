import * as THREE from 'three';

/** Two soft exhaust plumes in a single draw call; no shadow maps or textures. */
export class NomadExhaust {
  readonly object3D: THREE.Points;
  private readonly positions = new Float32Array(48 * 3);
  private readonly ages = new Float32Array(48);
  private readonly anchors: THREE.Object3D[] = [];
  private readonly point = new THREE.Vector3();
  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('age', new THREE.BufferAttribute(this.ages, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute float age; varying float a;
        void main(){a=age;vec4 p=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*p;gl_PointSize=clamp((1.1+age*3.)*700./max(1.,-p.z),1.,180.);}`,
      fragmentShader: `varying float a;
        void main(){vec2 q=gl_PointCoord*2.-1.;float r=length(q);
        float wisps=.7+.3*sin(q.x*11.+a*23.)*sin(q.y*13.-a*9.);
        float alpha=pow(max(0.,1.-r),2.)*sin(a*3.14159)*.58*wisps;
        gl_FragColor=vec4(mix(vec3(.075,.06,.045),vec3(.26,.235,.20),a),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    this.object3D = new THREE.Points(geometry, material);
    this.object3D.name = 'Nomad twin exhaust';
    this.object3D.frustumCulled = false;
    this.object3D.visible = false;
  }
  apply(root: THREE.Object3D | null): void {
    this.anchors.length = 0;
    for (const name of ['Exhaust_A', 'Exhaust_B']) {
      const anchor = root?.getObjectByName(name);
      if (anchor) this.anchors.push(anchor);
    }
    this.object3D.visible = this.anchors.length === 2;
  }
  update(distance: number): void {
    for (let stack = 0; stack < this.anchors.length; stack++) {
      this.anchors[stack]!.getWorldPosition(this.point);
      this.object3D.worldToLocal(this.point);
      for (let i = 0; i < 24; i++) {
        const n = stack * 24 + i,
          age = (((distance / 36 + i / 24) % 1) + 1) % 1;
        this.ages[n] = age;
        this.positions[n * 3] = this.point.x + Math.sin(i * 2.7) * age * 0.9;
        this.positions[n * 3 + 1] = this.point.y + age * 7;
        this.positions[n * 3 + 2] = this.point.z + age * 10;
      }
    }
    this.object3D.geometry.attributes.position!.needsUpdate = true;
    this.object3D.geometry.attributes.age!.needsUpdate = true;
  }
  dispose(): void {
    this.object3D.geometry.dispose();
    (this.object3D.material as THREE.Material).dispose();
  }
}
