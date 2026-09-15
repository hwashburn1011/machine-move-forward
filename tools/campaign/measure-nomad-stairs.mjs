/** Physical clearance probe, deliberately independent of caretaker routing. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.MMF_QA_OUT ?? 'test-results/nomad-stair-measurement';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.goto('http://127.0.0.1:5201/?nomenu=1&nolock=1&nosound=1&nospawn=1&nomodel=1&notex=1&quality=low&seed=stairs-measure');
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120000 });
  const result = await page.evaluate(async () => {
    const { Vector3 } = await import('/node_modules/.vite/deps/three.js');
    const g = globalThis.__game.game;
    g.stop();
    g.machine.setPose({ heave: 0, pitch: 0, roll: 0 });
    g.machine.fixedUpdate(1 / 60);
    g.physics.step();
    const trials = [];
    const { loadModel } = await import('/src/art/ModelLoader.ts');
    const collision = await loadModel('/models/authored/iron-nomad-collision.glb');
    if (!collision) throw new Error('Missing authored Nomad collision');
    collision.scene.updateMatrixWorld(true);
    const authoredBody = g.physics.createDrivenBody();
    collision.scene.traverse((node) => {
      if (!node.isMesh) return;
      const geo = node.geometry.clone().applyMatrix4(node.matrixWorld);
      const p = geo.getAttribute('position');
      g.physics.addTrimeshTo(authoredBody, new Float32Array(p.array), geo.index ? new Uint32Array(geo.index.array) : Uint32Array.from({length: p.count}, (_, i) => i), {kind: 'authored-machine', name: node.name});
      geo.dispose();
    });
    for (const adhesion of [2, 0.2]) for (const moving of [false, true]) for (const lowerLevel of [-2, -1]) for (const up of [true, false]) {
      g.machine.setPose({ heave: 0, pitch: 0, roll: 0 });
      g.machine.fixedUpdate(1 / 60);
      g.machine.group.updateMatrixWorld(true);
      authoredBody.setTranslation(g.machine.group.position, true);
      authoredBody.setRotation(g.machine.group.quaternion, true);
      g.physics.step();
      let distance = 0;
      const feet = new Vector3(-2, 14.84 + 3 * (lowerLevel + (up ? 0 : 1)), up ? -3.4 : 3.4);
      const pos = feet.clone().add(new Vector3(0, 0.5, 0));
      const h = g.physics.addCharacter(0.28, 0.22, pos);
      const trace = [];
      let reached = false;
      for (let i = 0; i < 1200; i++) {
        // The previous and current pose advance once per controller/physics tick.
        distance += moving ? 7.4 / 60 : 0;
        g.machine.setPose(moving ? g.machine.poseAt(distance) : { heave: 0, pitch: 0, roll: 0 });
        const carry = g.machine.carryFor(feet);
        // Match caretaker ordering: machine applies colliders before its update.
        g.machine.fixedUpdate(1 / 60);
        g.machine.group.updateMatrixWorld(true);
        authoredBody.setTranslation(g.machine.group.position, true);
        authoredBody.setRotation(g.machine.group.quaternion, true);
        const local = g.machine.group.worldToLocal(feet.clone());
        const direction = new Vector3(Math.max(-0.5, Math.min(0.5, -2 - local.x)), 0, up ? 1 : -1);
        direction.applyQuaternion(g.machine.group.quaternion).setY(0).normalize().multiplyScalar(1.35 / 60);
        direction.y = -adhesion / 60;
        g.physics.moveCharacter(h, pos, direction, carry);
        feet.copy(pos).y -= 0.5;
        g.physics.step();
        const after = g.machine.group.worldToLocal(feet.clone());
        if (i % 60 === 0) trace.push({ tick: i, feet: after.toArray(), contacts: Array.from({ length: h.controller.numComputedCollisions() }, (_, n) => {
          const c = h.controller.computedCollision(n);
          return { normal: c.normal1, collider: c.collider?.handle, data: c.collider ? g.physics.getUserData(c.collider) : null };
        }) });
        if ((up ? after.z > 3 : after.z < -3) && Math.abs(after.y - (14.84 + 3 * (lowerLevel + (up ? 1 : 0)))) < 0.2) { reached = true; break; }
      }
      trials.push({ adhesion, moving, lowerLevel, up, reached, finalFeet: g.machine.group.worldToLocal(feet.clone()).toArray(), trace });
      g.physics.removeCharacter(h);
    }
    return { trials };
  });
  await writeFile(`${out}/qa.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.trials.map(({ trace, ...t }) => ({ ...t, end: trace.at(-1) })), null, 2));
} finally { await browser.close(); }
