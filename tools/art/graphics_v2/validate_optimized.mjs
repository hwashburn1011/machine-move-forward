/** Validate optimized GLBs without pretending Node's image stub is a browser texture test. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'assets', 'graphics-v2', 'optimized');
// GLTFLoader's image path is intentionally stubbed in this Node-only check.
// This validates Meshopt geometry, hierarchy, skin accessors and clips; it does
// not claim that WebP bytes uploaded successfully to a browser GPU.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
globalThis.URL = { createObjectURL: () => '', revokeObjectURL() {} };

function jsonOf(bytes) {
  const n = bytes.readUInt32LE(12);
  return JSON.parse(bytes.toString('utf8', 20, 20 + n).trim());
}

const reports = [];
for (const file of (await fs.readdir(DIR)).filter((n) => n.endsWith('.glb')).sort()) {
  const stem = path.basename(file, '.glb');
  const bytes = await fs.readFile(path.join(DIR, file));
  const json = jsonOf(bytes);
  const names = new Set((json.nodes || []).map((node) => node.name));
  const required = stem === 'salvaged-radio' ? ['SignalLamp'] : stem === 'manual-turret' ? ['TurretYaw', 'TurretPitch', 'Muzzle'] : stem === 'scrap-rifle' || stem === 'scrap-shotgun' ? ['GripOrigin', 'Muzzle'] : stem === 'expedition-wreck' ? ['Gangway', 'CourseGyro', 'JournalCargo', 'JournalCrew', 'JournalRoute'] : stem === 'raider-skiff' ? ['SkiffGunPitch', 'SkiffMuzzle', 'PilotSeat', 'CrewSeatLeft', 'CrewSeatRight'] : [];
  const missing = required.filter((name) => !names.has(name));
  const extensionOk = json.extensionsUsed?.includes('EXT_meshopt_compression');
  const textureOk = (json.images || []).length > 0 && (json.images || []).every((image) => image.mimeType === 'image/webp') && (json.textures || []).every((texture) => texture.extensions?.EXT_texture_webp && texture.source === undefined);
  if (missing.length || !extensionOk || !textureOk) throw new Error(`${stem}: static contract failed (${missing.join(',') || 'extensions'})`);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  let triangles = 0;
  gltf.scene.traverse((node) => {
    if (node.isMesh) triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
  });
  reports.push({ asset: stem, bytes: bytes.length, triangles: Math.round(triangles), clips: gltf.animations.length, requiredNodes: required, nodeDecode: true, imageAcceptance: 'stubbed createImageBitmap; validate WebP in browser' });
}
console.log(JSON.stringify({ validated: true, reports }, null, 2));
