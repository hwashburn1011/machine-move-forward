/** Verify the exported bytes with the same glTF loader the game consumes. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const folder = new URL('../../public/models/authored/', import.meta.url);
const loader = new GLTFLoader();
const summaries = [];
for (const id of ['manual-turret', 'raider-skiff', 'scavenger', 'raider']) {
  const bytes = await fs.readFile(new URL(`${id}.glb`, folder));
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await loader.parseAsync(data, '');
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene, true);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(
    [size.x, size.y, size.z].every((v) => Number.isFinite(v) && v > 0),
    `${id}: finite dimensions`,
  );
  let triangles = 0;
  let skins = 0;
  scene.traverse((node) => {
    if (node.isMesh)
      triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    if (node.isSkinnedMesh) skins++;
  });
  assert.ok(triangles < 12000, `${id}: browser mesh budget`);
  assert.ok(bytes.length < 600000, `${id}: transfer budget`);

  if (id === 'manual-turret') {
    const yaw = scene.getObjectByName('TurretYaw');
    const pitch = scene.getObjectByName('TurretPitch');
    const muzzle = scene.getObjectByName('Muzzle');
    assert.ok(yaw && pitch && muzzle, 'all turret pivots exported');
    const at = muzzle.getWorldPosition(new THREE.Vector3());
    assert.ok(
      Math.abs(at.y - 1.2) < 0.001 && Math.abs(at.z + 1.4) < 0.001,
      'muzzle at authored bore position',
    );
    yaw.rotation.y = -Math.PI / 2;
    scene.updateMatrixWorld(true);
    const turned = muzzle.getWorldPosition(new THREE.Vector3());
    assert.ok(
      turned.x > 1.39 && Math.abs(turned.z) < 0.001,
      'yaw moves actual muzzle with the gun',
    );
    pitch.rotation.x = 0.3;
    scene.updateMatrixWorld(true);
    assert.ok(muzzle.getWorldPosition(new THREE.Vector3()).y > 1.6, 'pitch raises actual muzzle');
    for (const yawAngle of [-2.09, 0, 2.09]) {
      for (const pitchAngle of [-0.52, 0, 0.61]) {
        yaw.rotation.y = yawAngle;
        pitch.rotation.x = pitchAngle;
        scene.updateMatrixWorld(true);
        const barrel = muzzle
          .getWorldPosition(new THREE.Vector3())
          .sub(pitch.getWorldPosition(new THREE.Vector3()))
          .normalize();
        const aim = muzzle.getWorldDirection(new THREE.Vector3()).negate();
        assert.ok(barrel.dot(aim) > 0.99999, 'muzzle axis follows the actual articulated barrel');
      }
    }
  } else if (id === 'raider-skiff') {
    assert.ok(
      size.x >= 3 && size.x <= 3.2 && size.z >= 5.5 && size.z <= 5.8,
      'skiff matches runtime collision envelope',
    );
    for (const name of ['CrewSeatLeft', 'CrewSeatRight']) {
      const seat = scene.getObjectByName(name);
      assert.ok(seat && Math.abs(seat.position.y - 1.2) < 0.001, 'crew seats stand on the deck');
    }
    for (const name of ['SkiffGunYaw', 'SkiffGunPitch', 'SkiffMuzzle']) {
      assert.ok(scene.getObjectByName(name), `skiff light gun has ${name}`);
    }
  } else {
    assert.ok(skins > 0, `${id}: actual skinned character`);
    assert.ok(size.y > 1.8 && size.y < 2.1, `${id}: human-scale feet-to-head size`);
    for (const name of ['Idle', 'Walking', 'Running', 'Climb', 'Punch', 'Death']) {
      const clip = gltf.animations.find((candidate) => candidate.name === name);
      assert.ok(
        clip && clip.duration > 0 && clip.tracks.length > 0,
        `${id}: ${name} has keyframes`,
      );
    }
    const actor = clone(scene);
    const thigh = actor.getObjectByName('ThighL') ?? actor.getObjectByName('Thigh.L');
    assert.ok(thigh, `${id}: leg joint resolves after skeleton cloning`);
    const mixer = new THREE.AnimationMixer(actor);
    const walking = gltf.animations.find((clip) => clip.name === 'Walking');
    mixer.clipAction(walking).play();
    mixer.update(0);
    const rest = thigh.quaternion.clone();
    mixer.update(walking.duration / 4);
    assert.ok(rest.angleTo(thigh.quaternion) > 0.1, `${id}: walking actually animates the leg`);
    const originalThigh = scene.getObjectByName(thigh.name);
    assert.ok(
      originalThigh.quaternion.angleTo(thigh.quaternion) > 0.1,
      `${id}: clones do not share a skeleton`,
    );
  }
  summaries.push({
    id,
    triangles,
    bytes: bytes.length,
    dimensions: size.toArray().map((v) => +v.toFixed(3)),
    skins,
    clips: gltf.animations.map((clip) => clip.name),
  });
}
console.log(
  JSON.stringify({ verified: true, source: fileURLToPath(folder), assets: summaries }, null, 2),
);
