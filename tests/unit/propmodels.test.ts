import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mergePropGeometry, normalisePropGeometry } from '@/world/PropModels';

/**
 * Turning a downloaded pack into something an `InstancedMesh` can draw.
 *
 * The packs are CC0, untextured, and coloured by material — one mesh split
 * into several primitives, each with its own flat colour, scaled up by a node
 * because they are authored in centimetres. An instanced mesh draws one
 * geometry with one material, so all of that has to be flattened first, and
 * every step of the flattening is a way to lose something: the node scale, the
 * colours, or the merge itself.
 */

function coloured(colour: number, positions: number[]): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colour }));
}

/** A unit triangle, three vertices. */
const TRI = [0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('flattening a prop pack', () => {
  it('keeps the node scale the pack was authored with', () => {
    // The shipwreck is centimetre-scale geometry inside a node scaled by a
    // hundred. Taken without its world matrix it arrives a hundredth of the
    // size, which reads as gravel rather than as a shipwreck.
    const mesh = coloured(0xffffff, TRI);
    const group = new THREE.Group();
    group.scale.setScalar(100);
    group.add(mesh);

    const merged = mergePropGeometry(group);
    expect(merged).not.toBeNull();

    // Normalised to a one-metre footprint afterwards, so what survives the
    // scale is the SHAPE: a triangle 100 long and 100 deep is still square.
    merged?.computeBoundingBox();
    const size = new THREE.Vector3();
    merged?.boundingBox?.getSize(size);
    expect(size.x).toBeCloseTo(1, 6);
    expect(size.z).toBeCloseTo(1, 6);
  });

  it('bakes each material colour into vertex colours', () => {
    // One material per primitive is how these packs carry their palette. Merge
    // without baking and the whole wreck comes out one flat colour.
    const red = coloured(0xff0000, TRI);
    const blue = coloured(0x0000ff, [2, 0, 0, 3, 0, 0, 2, 0, 1]);
    const group = new THREE.Group();
    group.add(red, blue);

    const merged = mergePropGeometry(group);
    const colours = merged?.getAttribute('color');
    expect(colours).toBeTruthy();
    expect(colours?.count).toBe(6);

    const seen = new Set<string>();
    for (let i = 0; i < (colours?.count ?? 0); i++) {
      seen.add(`${colours?.getX(i).toFixed(2)},${colours?.getZ(i).toFixed(2)}`);
    }
    // Two distinct colours survived rather than one.
    expect(seen.size).toBe(2);
  });

  it('merges several primitives into a single geometry', () => {
    const group = new THREE.Group();
    group.add(coloured(0xff0000, TRI), coloured(0x00ff00, TRI), coloured(0x0000ff, TRI));

    const merged = mergePropGeometry(group);
    expect(merged?.getAttribute('position').count).toBe(9);
  });

  it('drops attributes the merge cannot reconcile', () => {
    // Some primitives carry UVs for textures the pack does not have, and
    // `mergeGeometries` refuses a set that does not match across every part.
    const withUv = coloured(0xffffff, TRI);
    withUv.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    const withoutUv = coloured(0xffffff, TRI);

    const group = new THREE.Group();
    group.add(withUv, withoutUv);

    const merged = mergePropGeometry(group);
    expect(merged).not.toBeNull();
    expect(merged?.getAttribute('uv')).toBeUndefined();
    expect(merged?.getAttribute('position').count).toBe(6);
  });

  it('returns null for a model with nothing drawable in it', () => {
    expect(mergePropGeometry(new THREE.Group())).toBeNull();
  });
});

describe('normalising a prop', () => {
  it('stands it on y = 0, so it can be dropped onto a dune', () => {
    const geometry = new THREE.BoxGeometry(4, 8, 4);
    geometry.translate(17, 40, -6);

    normalisePropGeometry(geometry);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.y).toBeCloseTo(0, 6);
  });

  it('centres it on the origin in plan, so it rotates about itself', () => {
    const geometry = new THREE.BoxGeometry(4, 8, 4);
    geometry.translate(17, 40, -6);

    normalisePropGeometry(geometry);
    const centre = new THREE.Vector3();
    geometry.boundingBox?.getCenter(centre);
    expect(centre.x).toBeCloseTo(0, 6);
    expect(centre.z).toBeCloseTo(0, 6);
  });

  it('sizes by footprint, so a tall thing stays tall', () => {
    // Scaling to fit a cube would squash a ship's hull into a boulder. The
    // spawner scales by footprint and drops onto the ground, so height has to
    // stay proportional to it.
    const tall = new THREE.BoxGeometry(2, 12, 2);
    normalisePropGeometry(tall);
    tall.computeBoundingBox();
    const size = new THREE.Vector3();
    tall.boundingBox?.getSize(size);

    expect(size.x).toBeCloseTo(1, 6);
    expect(size.z).toBeCloseTo(1, 6);
    expect(size.y).toBeCloseTo(6, 6);
  });
});
