import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadModel } from '@/art/ModelLoader';
import { loadDesertLibrary } from './DesertModels';
import type { DesertLibrary } from './DesertScenery';

/**
 * Original textured desert scenery, with the previous CC0 wrecks as fallback.
 *
 * These are the things the machine passes: a ship's hull on its side, a stack
 * of containers, a pile of debris. Half-buried, because the fiction is a world
 * the sand has swallowed — `PropSpawner` sinks them, this only supplies the
 * shapes.
 *
 * Each legacy pack arrives as one mesh split into several primitives, one per
 * material, with no textures at all — Quaternius and Kenney both colour by
 * material rather than by map. `InstancedMesh` draws one geometry with one
 * material, so the primitives are merged and each one's colour is baked into
 * vertex colours on the way. That keeps the packs' own palettes at one draw
 * call apiece.
 *
 * Everything here follows `ASSETS.md`'s bargain: a missing or undecodable file
 * costs a wreck on the horizon, never a boot, and `?nomodel=1` takes the same
 * path deliberately.
 */

export interface PropModelGeometries {
  desert?: DesertLibrary;
  wreck?: THREE.BufferGeometry;
  containers?: THREE.BufferGeometry;
  debris?: THREE.BufferGeometry;
  /** Optional authored, textured templates for atlas-aware instancing. */
  templates?: Partial<Record<PropKind, PropTemplate>>;
  dispose(): void;
}

export type PropKind = 'wreck' | 'containers' | 'debris';

/**
 * The instancing contract for authored props.
 *
 * The old path intentionally returns one geometry and a shared fallback
 * material. This template keeps UVs, tangents and the authored material
 * together so a caller with a trim/atlas material can opt into textured
 * instancing without changing the fallback path.
 */
export interface PropTemplate {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  dispose(): void;
}

export interface PropTemplateOptions {
  /** An atlas to bind when the source material has no usable color map. */
  atlas?: THREE.Texture;
  /** Optional UV transform in atlas space. */
  uvTransform?: { offset?: THREE.Vector2Like; repeat?: THREE.Vector2Like };
}

/** What a merged prop geometry is allowed to carry. */
const REQUIRED_ATTRIBUTES = ['position', 'normal', 'color'] as const;

/** Attribute names that can be transported when every primitive provides one. */
const OPTIONAL_ATTRIBUTES = ['uv', 'uv1', 'tangent'] as const;

/**
 * Flatten a loaded model into one geometry that an `InstancedMesh` can draw.
 *
 * Three things happen here, and all three are needed before a pack can be
 * instanced:
 *
 *  - **Node transforms are baked in.** These packs are authored in
 *    centimetres and scaled back up by a node — the shipwreck's is a hundred —
 *    so a geometry taken without its world matrix arrives a hundredth of its
 *    intended size.
 *  - **Material colour is baked to vertices.** One material per primitive
 *    becomes one vertex colour per vertex, so the whole pack draws with a
 *    single material and keeps its palette.
 *  - **Attributes are made uniform.** Merging refuses geometries whose
 *    attribute sets differ, and these carry stray UVs on some primitives and
 *    not others — for textures that do not exist.
 *
 * Returns null if there is nothing drawable, which the caller treats exactly
 * like a failed download.
 */
export function mergePropGeometry(source: THREE.Object3D): THREE.BufferGeometry | null {
  source.updateWorldMatrix(true, true);

  const parts: THREE.BufferGeometry[] = [];
  source.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);

    const count = geometry.attributes.position?.count ?? 0;
    if (count === 0) {
      geometry.dispose();
      return;
    }

    // Authored normals carry deliberate hard edges and smooth groups. Only
    // synthesize normals for genuinely un-authored fallback primitives.
    if (!geometry.attributes.normal) geometry.computeVertexNormals();

    // Bake the material colour. A mesh split across groups carries one
    // material per group, so the colour is written per group rather than per
    // mesh — otherwise a six-material wreck comes out one flat colour.
    const colors = new Float32Array(count * 3);
    const write = (from: number, to: number, colour: THREE.Color): void => {
      for (let i = from; i < to && i < count; i++) {
        colors[i * 3] = colour.r;
        colors[i * 3 + 1] = colour.g;
        colors[i * 3 + 2] = colour.b;
      }
    };

    const colourOf = (index: number): THREE.Color => {
      const material = materials[Math.min(index, materials.length - 1)] as
        THREE.MeshStandardMaterial | undefined;
      return material?.color ?? new THREE.Color(1, 1, 1);
    };

    if (geometry.groups.length > 0 && !geometry.index) {
      for (const group of geometry.groups) {
        write(group.start, group.start + group.count, colourOf(group.materialIndex ?? 0));
      }
    } else if (geometry.groups.length > 0 && geometry.index) {
      // Indexed: groups address the index buffer, so the colour has to be
      // written through it to reach the right vertices.
      const index = geometry.index;
      for (const group of geometry.groups) {
        const colour = colourOf(group.materialIndex ?? 0);
        for (let i = group.start; i < group.start + group.count && i < index.count; i++) {
          const v = index.getX(i);
          colors[v * 3] = colour.r;
          colors[v * 3 + 1] = colour.g;
          colors[v * 3 + 2] = colour.b;
        }
      }
    } else {
      write(0, count, colourOf(0));
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    for (const name of Object.keys(geometry.attributes)) {
      if (
        !(REQUIRED_ATTRIBUTES as readonly string[]).includes(name) &&
        !(OPTIONAL_ATTRIBUTES as readonly string[]).includes(name)
      ) {
        geometry.deleteAttribute(name);
      }
    }
    geometry.clearGroups();
    parts.push(geometry);
  });

  if (parts.length === 0) return null;

  // Merging requires a consistent attribute set. Preserve UVs/tangents when
  // the complete authored pack has them, while retaining the old robust
  // fallback for mixed primitive packs that do not.
  const presentInAll = (name: string): boolean =>
    parts.every((part) => Boolean(part.getAttribute(name)));
  for (const name of OPTIONAL_ATTRIBUTES) {
    if (!presentInAll(name)) {
      for (const part of parts) part.deleteAttribute(name);
    }
  }

  const merged =
    parts.length === 1
      ? (parts[0] as THREE.BufferGeometry)
      : BufferGeometryUtils.mergeGeometries(parts);
  if (parts.length > 1) for (const part of parts) part.dispose();
  if (!merged) return null;

  return normalisePropGeometry(merged);
}

/**
 * Build an atlas-aware template from an authored scene.
 *
 * Templates deliberately use one material and one merged geometry because
 * `InstancedMesh` has one material slot. Multi-material source packs still
 * retain per-primitive vertex colors; a supplied atlas is used as the map and
 * the UVs are transported unchanged unless a caller supplies a transform.
 */
export function createPropTemplate(
  source: THREE.Object3D,
  options: PropTemplateOptions = {},
): PropTemplate | null {
  const geometry = mergePropGeometry(source);
  if (!geometry) return null;

  let sourceMaterial: THREE.MeshStandardMaterial | undefined;
  source.traverse((object) => {
    if (sourceMaterial) return;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const first = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
      THREE.MeshStandardMaterial | undefined;
    if (first?.isMeshStandardMaterial) sourceMaterial = first;
  });

  const material = sourceMaterial
    ? sourceMaterial.clone()
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.1 });
  material.vertexColors = true;
  material.flatShading = false;
  if (options.atlas) material.map = options.atlas;
  if (options.uvTransform && geometry.getAttribute('uv')) {
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const repeat = options.uvTransform.repeat ?? { x: 1, y: 1 };
    const offset = options.uvTransform.offset ?? { x: 0, y: 0 };
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * repeat.x + offset.x, uv.getY(i) * repeat.y + offset.y);
    }
    uv.needsUpdate = true;
  }
  material.needsUpdate = true;

  return {
    geometry,
    material,
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Put a prop on the origin, standing on y = 0, one metre wide.
 *
 * `PropSpawner` scales every instance and drops it onto the dune surface, and
 * both only mean something against a known size and a known base. Sizing by
 * the horizontal footprint rather than by height keeps a tall thin wreck tall
 * and thin instead of squashing it into the same cube as everything else.
 */
export function normalisePropGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return geometry;

  const size = new THREE.Vector3();
  box.getSize(size);
  const footprint = Math.max(size.x, size.z, 1e-6);

  const centre = new THREE.Vector3();
  box.getCenter(centre);
  geometry.translate(-centre.x, -box.min.y, -centre.z);
  geometry.scale(1 / footprint, 1 / footprint, 1 / footprint);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Where the packs live, relative to the served root. */
const BASE = 'models/props';

/**
 * Load every prop pack, skipping any that fails.
 *
 * Never rejects, and a partial result is a valid result — the same promise
 * `loadTextureSets` makes, for the same reason.
 */
export async function loadPropModels(): Promise<PropModelGeometries> {
  const desert = await loadDesertLibrary();
  if (desert) return { desert, dispose: () => desert.dispose() };
  const wanted = ['wreck', 'containers', 'debris'] as const;

  const loaded = await Promise.all(
    wanted.map(async (name) => {
      const model = await loadModel(`${BASE}/${name}.glb`);
      if (!model) return null;
      let hasAuthoredSurface = false;
      model.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry.getAttribute('uv')) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (materials.some((material) => Boolean((material as THREE.MeshStandardMaterial).map))) {
          hasAuthoredSurface = true;
        }
      });
      const template = hasAuthoredSurface ? createPropTemplate(model.scene) : null;
      const geometry = template?.geometry ?? mergePropGeometry(model.scene);
      return geometry ? ([name, geometry, template] as const) : null;
    }),
  );

  const out: PropModelGeometries = {
    templates: {},
    dispose(): void {
      for (const name of wanted) {
        const templates = this.templates;
        const template = templates?.[name];
        if (template && templates) {
          template.dispose();
          templates[name] = undefined;
        } else {
          this[name]?.dispose();
        }
        this[name] = undefined;
      }
      this.templates = undefined;
    },
  };
  for (const entry of loaded) {
    if (!entry) continue;
    out[entry[0]] = entry[1];
    if (entry[2]) out.templates![entry[0]] = entry[2];
  }
  return out;
}
