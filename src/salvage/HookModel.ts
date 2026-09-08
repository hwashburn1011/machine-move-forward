import * as THREE from 'three';
import { bevelledBox } from '@/machine/MachineGeometry';
import { salvageModel } from '@/art/SalvageModels';

/**
 * The grappling hook on the end of the reel.
 *
 * **Procedural, and that was a decision rather than a default.** A hook was
 * searched for first, because the reel is one of the few things in this game a
 * bought model would suit: it is a small, self-contained object with no rig and
 * no animation. What came back was one genuinely well-shaped grappling hook —
 * "Hook and chain" on Poly Pizza — under CC-BY, and nothing CC0 that was even
 * close. `ASSETS.md` rules CC-BY out on purpose so the project carries no
 * attribution obligations, and that rule is not worth bending for four flukes
 * and a shank.
 *
 * So it is built the way the machine is built, out of `bevelledBox`, which is
 * also why it MATCHES the machine: same bevel, same silhouette language, same
 * chunky read at distance. A bought hook would have needed re-tinting to sit
 * beside a hull built this way, which is most of the saving gone.
 *
 * It replaced an octahedron — a floating orange diamond, which said "something
 * is happening" and never said "this is a hook".
 */

/**
 * Flukes around the shank.
 *
 * Three, not four. Three is what a real grappling hook has, because three
 * points always seat on an uneven surface and four rock; it also reads as a
 * hook from every angle without ever presenting a flat face, which four does
 * twice per revolution as it flies.
 */
const FLUKES = 3;

/**
 * Overall length, nose to ring, in metres.
 *
 * Sized against the crate it catches, not against the hand it left: crates are
 * about a metre across and the hook has to read as biting one from across the
 * deck, at the distance the reel actually works over.
 */
export const HOOK_LENGTH = 0.62;

const SHANK_R = 0.028;

/**
 * Build the hook, pointing down its own -Z.
 *
 * -Z rather than +Z because that is the direction it TRAVELS: `Game` aims it
 * with `lookAt`, and three.js's `lookAt` points an object's -Z at the target.
 * Building it any other way means every caller remembers to add half a turn,
 * and one of them eventually will not.
 */
export function buildHook(material: THREE.Material): THREE.Group {
  const authored = salvageModel('forged-hook');
  if (authored) return authored;
  const hook = new THREE.Group();
  hook.name = 'reel-hook';

  const add = (geo: THREE.BufferGeometry, parent: THREE.Object3D = hook): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Every position below is DERIVED from these, and the joints are computed
  // rather than typed in. The first version placed each piece by eye and the
  // flukes came out floating a centimetre clear of the shank -- which is not a
  // thing you notice in the numbers and is the only thing you notice on screen.
  const NOSE = -HOOK_LENGTH / 2;
  const RING = HOOK_LENGTH / 2;
  /** Where the flukes leave the shank. Forward, so the hook bites nose-first. */
  const CROWN = NOSE + 0.2;
  const ARM = 0.17;
  const BARB = 0.085;
  /** Radians the arm sweeps back from square, and the barb again beyond it. */
  const ARM_SWEEP = 0.55;
  const BARB_SWEEP = 1.15;

  // --- Shank ---------------------------------------------------------------
  const shankLength = RING - NOSE - 0.09;
  const shank = bevelledBox(SHANK_R * 2, SHANK_R * 2, shankLength, 0.01);
  shank.translate(0, 0, NOSE + 0.05 + shankLength / 2);
  add(shank);

  // The point. A cone stands up +Y by default; the hook flies down -Z.
  const tip = new THREE.ConeGeometry(SHANK_R * 1.3, 0.1, 6);
  tip.rotateX(-Math.PI / 2);
  tip.translate(0, 0, NOSE + 0.05);
  add(tip);

  // --- The eye the cable ties to -------------------------------------------
  // Four short bars rather than a torus: a torus is two hundred triangles for
  // a shape that is four pixels across whenever anyone can actually see it.
  const eyeR = 0.05;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bar = bevelledBox(0.016, 0.016, 0.055, 0.005);
    bar.rotateX(Math.PI / 2);
    bar.rotateZ(a);
    bar.translate(Math.cos(a) * eyeR, Math.sin(a) * eyeR, RING - 0.03);
    add(bar);
  }

  // --- Flukes --------------------------------------------------------------
  // Each is an arm out from the shank and a barb turned further back. The barb
  // is what makes it a hook rather than a spike: it is the part that stops a
  // crate sliding off once the cable comes under tension.
  for (let i = 0; i < FLUKES; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i / FLUKES) * Math.PI * 2;

    // Start INSIDE the shank, so the joint is a joint and not a near miss.
    const rootY = SHANK_R * 0.4;
    const armMidY = rootY + (ARM / 2) * Math.cos(ARM_SWEEP);
    const armMidZ = CROWN + (ARM / 2) * Math.sin(ARM_SWEEP);
    const outer = bevelledBox(0.03, ARM, 0.03, 0.008);
    outer.rotateX(ARM_SWEEP);
    outer.translate(0, armMidY, armMidZ);
    add(outer, arm);

    // The arm's far end, which is where the barb has to begin.
    const tipY = rootY + ARM * Math.cos(ARM_SWEEP);
    const tipZ = CROWN + ARM * Math.sin(ARM_SWEEP);
    const barb = bevelledBox(0.028, BARB, 0.028, 0.008);
    barb.rotateX(BARB_SWEEP);
    barb.translate(
      0,
      tipY + (BARB / 2) * Math.cos(BARB_SWEEP),
      tipZ + (BARB / 2) * Math.sin(BARB_SWEEP),
    );
    add(barb, arm);

    hook.add(arm);
  }

  return hook;
}

/** Radians per metre flown, so a thrown hook tumbles instead of gliding. */
export const HOOK_SPIN = 7;
