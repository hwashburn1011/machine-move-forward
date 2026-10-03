import * as THREE from 'three';

interface Triangle {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  center: THREE.Vector3;
  material: number;
}
interface Node {
  bounds: THREE.Box3;
  left?: Node;
  right?: Node;
  triangles?: Triangle[];
}

/** Exact triangle occlusion for rigid scenery, indexed once at load time.
 * The mesh can still move with its parent. Deformed/edited geometry falls back
 * to Three's raycast; this index never approximates a hole or a cloth edge.
 */
export class StaticMeshOcclusion {
  private readonly root: Node;
  private readonly inverse = new THREE.Matrix4();
  private readonly ray = new THREE.Ray();
  private readonly end = new THREE.Vector3();
  private readonly hit = new THREE.Vector3();
  private readonly stack: Node[] = [];
  private readonly position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  private readonly positionVersion: number;
  private readonly indexVersion: number;
  private readonly index: THREE.BufferAttribute | null;
  private readonly drawStart: number;
  private readonly drawCount: number;

  static create(mesh: THREE.Mesh): StaticMeshOcclusion | null {
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || mesh.morphTargetInfluences?.length)
      return null;
    const position = mesh.geometry.getAttribute('position');
    if (!position || position.count < 3) return null;
    return new StaticMeshOcclusion(mesh);
  }

  private constructor(private readonly mesh: THREE.Mesh) {
    const geometry = mesh.geometry;
    this.position = geometry.getAttribute('position');
    this.positionVersion = this.version();
    this.indexVersion = geometry.index?.version ?? -1;
    this.index = geometry.index;
    this.drawStart = geometry.drawRange.start;
    this.drawCount = geometry.drawRange.count;
    const triangles: Triangle[] = [];
    const count = geometry.index?.count ?? this.position.count;
    const groups = Array.isArray(mesh.material)
      ? geometry.groups
      : [{ start: 0, count, materialIndex: 0 }];
    for (const group of groups) {
      const start = Math.max(group.start, this.drawStart);
      const end = Math.min(count, group.start + group.count, this.drawStart + this.drawCount);
      for (let i = start; i + 2 < end; i += 3) {
        const vertex = (j: number): THREE.Vector3 =>
          new THREE.Vector3().fromBufferAttribute(
            this.position,
            geometry.index ? geometry.index.getX(j) : j,
          );
        const a = vertex(i),
          b = vertex(i + 1),
          c = vertex(i + 2);
        triangles.push({
          a,
          b,
          c,
          center: a
            .clone()
            .add(b)
            .add(c)
            .multiplyScalar(1 / 3),
          material: group.materialIndex ?? 0,
        });
      }
    }
    this.root = this.build(triangles);
  }

  private version(): number {
    return this.position instanceof THREE.InterleavedBufferAttribute
      ? this.position.data.version
      : this.position.version;
  }

  /** null means the caller must use the deformable-mesh fallback. */
  intersects(from: THREE.Vector3, to: THREE.Vector3): boolean | null {
    const geometry = this.mesh.geometry;
    if (
      geometry.getAttribute('position') !== this.position ||
      this.version() !== this.positionVersion ||
      geometry.index !== this.index ||
      (geometry.index?.version ?? -1) !== this.indexVersion ||
      geometry.drawRange.start !== this.drawStart ||
      geometry.drawRange.count !== this.drawCount
    )
      return null;
    this.inverse.copy(this.mesh.matrixWorld).invert();
    this.ray.origin.copy(from);
    this.ray.direction.copy(to).sub(from).normalize();
    this.ray.applyMatrix4(this.inverse);
    this.end.copy(to).applyMatrix4(this.inverse);
    const lengthSq = this.ray.origin.distanceToSquared(this.end);
    this.stack.length = 0;
    this.stack.push(this.root);
    while (this.stack.length) {
      const node = this.stack.pop()!;
      if (!this.ray.intersectBox(node.bounds, this.hit)) continue;
      if (
        !node.bounds.containsPoint(this.ray.origin) &&
        this.hit.distanceToSquared(this.ray.origin) > lengthSq
      )
        continue;
      if (node.triangles) {
        for (const triangle of node.triangles) {
          const material = Array.isArray(this.mesh.material)
            ? this.mesh.material[triangle.material]
            : this.mesh.material;
          if (!material) continue;
          const { a, b, c } = triangle;
          const hit =
            material.side === THREE.BackSide
              ? this.ray.intersectTriangle(c, b, a, true, this.hit)
              : this.ray.intersectTriangle(a, b, c, material.side !== THREE.DoubleSide, this.hit);
          if (hit && hit.distanceToSquared(this.ray.origin) <= lengthSq) return true;
        }
      } else {
        this.stack.push(node.left!, node.right!);
      }
    }
    return false;
  }

  private build(triangles: Triangle[]): Node {
    const bounds = new THREE.Box3();
    const centers = new THREE.Box3();
    for (const triangle of triangles) {
      bounds.expandByPoint(triangle.a).expandByPoint(triangle.b).expandByPoint(triangle.c);
      centers.expandByPoint(triangle.center);
    }
    // Conservative bounds avoid rejecting an exact edge hit after the world
    // transform; the triangle test itself remains unexpanded and exact.
    bounds.expandByScalar(1e-7);
    if (triangles.length <= 12) return { bounds, triangles };
    const size = centers.getSize(new THREE.Vector3());
    const axis = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
    triangles.sort((a, b) => a.center[axis] - b.center[axis]);
    const split = Math.floor(triangles.length / 2);
    return {
      bounds,
      left: this.build(triangles.slice(0, split)),
      right: this.build(triangles.slice(split)),
    };
  }
}
