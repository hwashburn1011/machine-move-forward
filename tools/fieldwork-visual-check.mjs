import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { configureFieldwork } from './campaign/fieldwork-performance.mjs';

const out = process.env.MMF_QA_OUT ?? 'test-results/fieldwork-visual';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    `${process.env.MMF_SITE ?? 'http://127.0.0.1:5201/'}?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=medium&seed=fieldwork-art`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.stop();
    g.opening.restore({ phase: 'done' });
    g.player.teleport(g.player.worldPosition.clone().set(5.6, 15.8, 1.5));
  });
  const fixture = await configureFieldwork(page);
  const model = await page.evaluate(() => {
    const g = globalThis.__game.game,
      a = g.caretakerActor;
    if (!a?.root.getObjectByName('L12Sensor')) throw Error('Authored L-12 missing');
    for (let i = 0; i < 120; i++) g.fixedUpdate(1 / 60);
    const cam = g.playerCamera.camera.clone(),
      p = a.position;
    cam.position.set(p.x + 2.5, p.y + 1.5, p.z + 2.8);
    cam.lookAt(p.x, p.y + 0.6, p.z);
    cam.fov = 42;
    cam.updateProjectionMatrix();
    g.freeCamera = cam;
    g.render(0);
    return {
      actor: [p.x, p.y, p.z],
      children: a.root.children.length,
      head: !!a.root.getObjectByName('L12Sensor'),
    };
  });
  await page.screenshot({ path: `${out}/l12-aboard.png` });
  const attachments = [];
  for (const [weaponId, id] of [
    ['rifle', 'rifle-stabilizer'],
    ['rifle', 'rifle-burst-cam'],
    ['shotgun', 'shotgun-choke'],
    ['shotgun', 'shotgun-scatter-brake'],
  ]) {
    const result = await page.evaluate(
      ({ weaponId, id }) => {
        const g = globalThis.__game.game;
        const weapon = g.combat.all.find((w) => w.def.id === weaponId);
        if (!weapon) throw Error('Unknown weapon ' + weaponId);
        weapon.researchAttachment(id, { canAfford: () => true, consume: () => true });
        weapon.setAttachment(id);
        g.combat.equip(weaponId);
        g.render(0);
        const visual = g.player.visual;
        const attachment = visual.object3D.getObjectByName('weapon-attachment');
        if (!attachment) throw Error('No visible attachment ' + id);
        const p = attachment.getWorldPosition(g.player.worldPosition.clone());
        const cam = g.playerCamera.camera.clone();
        cam.position.set(p.x + 1.2, p.y + 0.65, p.z + 1.2);
        if (id === 'rifle-burst-cam') {
          const right = p
            .clone()
            .set(1, 0.65, 0.7)
            .applyQuaternion(visual.recoilNode.getWorldQuaternion(cam.quaternion.clone()));
          cam.position.copy(p).add(right);
        }
        cam.lookAt(p);
        cam.fov = 35;
        cam.updateProjectionMatrix();
        g.freeCamera = cam;
        g.render(0);
        return { id, at: [p.x, p.y, p.z], children: attachment.children.length };
      },
      { weaponId, id },
    );
    attachments.push(result);
    await page.screenshot({ path: `${out}/${id}.png` });
  }
  await writeFile(
    `${out}/qa.json`,
    JSON.stringify({ fixture, model, attachments, errors }, null, 2),
  );
  console.log(JSON.stringify({ fixture, model, attachments, errors }));
} finally {
  await browser.close();
}
if (errors.length) process.exitCode = 1;
