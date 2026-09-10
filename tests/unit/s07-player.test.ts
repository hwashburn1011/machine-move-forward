import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { s07MotionClip } from '@/player/PlayerVisual';

describe('S-07 playable character contract', () => {
  const bytes = readFileSync('public/models/authored/s07-player.glb');
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const clips = new Set(gltf.animations.map((clip: { name: string }) => clip.name));

  it('provides every armed/unarmed posture selected during play', () => {
    for (const armed of [false, true]) {
      for (const grounded of [false, true]) {
        for (const crouching of [false, true]) {
          for (const speed of [0, 2, 6, Number.NaN]) {
            const name = s07MotionClip(speed, grounded, crouching, armed);
            expect(clips.has(name), name).toBe(true);
          }
        }
      }
    }
    expect(s07MotionClip(6, true, true, true)).toBe('armed_crouch_walk');
    expect(s07MotionClip(4.5, true, false, true)).toBe('armed_walk');
    expect(s07MotionClip(7.5, true, false, true)).toBe('armed_run');
    expect(s07MotionClip(0, false, false, false)).toBe('unarmed_jump');
  });

  it('ships a skinned body with a hand socket within the gameplay budget', () => {
    expect(gltf.skins[0].joints).toHaveLength(50);
    expect(gltf.nodes.some((node: { name: string }) => node.name === 'WeaponSocket')).toBe(true);
    expect(gltf.nodes.some((node: { name: string }) => node.name === 'S07_Rig')).toBe(true);
    const triangles = gltf.meshes
      .flatMap((mesh: { primitives: { indices: number }[] }) => mesh.primitives)
      .reduce(
        (sum: number, primitive: { indices: number }) =>
          sum + gltf.accessors[primitive.indices].count / 3,
        0,
      );
    expect(triangles).toBeLessThan(105_000);
    expect(bytes.length).toBeLessThan(8_000_000);
  });
});
