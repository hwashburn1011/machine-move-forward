import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Vector3, Triangle, Box3 } from 'three';
const bytes = await readFile('public/models/authored/iron-nomad-collision.glb');
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
gltf.scene.updateMatrixWorld(true);
const points = [-0.75, -0.45, 0, 0.45, 0.75].flatMap(x => [2, 2.35, 2.7, 3.05, 3.4, 3.65, 4].map(z => new Vector3(x, 12.44, z)));
const result = points.map(p => ({ point: p.toArray(), hits: [] }));
gltf.scene.traverse(node => {
  if (!node.isMesh) return;
  const geo = node.geometry.clone().applyMatrix4(node.matrixWorld);
  const a = geo.attributes.position, idx = geo.index;
  const tri = new Triangle(), closest = new Vector3(), box = new Box3();
  for (let i = 0; i < (idx?.count ?? a.count); i += 3) {
    tri.a.fromBufferAttribute(a, idx ? idx.getX(i) : i);
    tri.b.fromBufferAttribute(a, idx ? idx.getX(i + 1) : i + 1);
    tri.c.fromBufferAttribute(a, idx ? idx.getX(i + 2) : i + 2);
    for (let n = 0; n < points.length; n++) {
      tri.closestPointToPoint(points[n], closest);
      const d = closest.distanceTo(points[n]);
      if (d >= .32) continue;
      box.setFromPoints([tri.a, tri.b, tri.c]);
      result[n].hits.push({ mesh: node.name, distance: +d.toFixed(3), min: box.min.toArray(), max: box.max.toArray() });
    }
  }
  geo.dispose();
});
console.log(JSON.stringify(result.filter(r => r.hits.length), null, 2));
