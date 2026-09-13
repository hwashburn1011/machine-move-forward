/**
 * Authored-mech combat animation parity.
 *
 * Requires the baseline checkout on 5203 and the current checkout on 5201.
 * This script intentionally does not boot Game: each page imports the Vite
 * modules and loads the real public GLB, keeping the measurement limited to
 * EnemyVisual and its shipped animation data.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const currentOrigin = `http://127.0.0.1:${process.env.MMF_CURRENT_PORT ?? 5201}`;
const baselineOrigin = `http://127.0.0.1:${process.env.MMF_BASELINE_PORT ?? 5203}`;
const outDir = process.env.MMF_QA_OUT ?? 'docs/gameplay-polish/acceptance';
const ids = ['bastion', 'revenant', 'warden', 'sovereign'];
const rates = [30, 60, 144];
const tolerance = 1e-7;
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
async function pageAt(origin, tag) {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(`${tag}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${tag}: ${message.text()}`); });
  // Establish the server origin without evaluating the full game entry point.
  await page.goto(`${origin}/favicon.svg`, { waitUntil: 'load', timeout: 30000 });
  return page;
}
const baselinePage = await pageAt(baselineOrigin, 'baseline');
const currentPage = await pageAt(currentOrigin, 'current');

async function sample(page, origin, id, fps, current) {
  return page.evaluate(async ({ origin, id, fps, current }) => {
    const [{ loadModel }, { EnemyVisual }] = await Promise.all([
      import(`${origin}/src/art/ModelLoader.ts`),
      import(`${origin}/src/enemies/EnemyVisual.ts`),
    ]);
    const model = await loadModel(`${origin}/models/authored/${id}.glb`);
    if (!model) throw new Error(`failed to load ${id}`);
    const visual = new EnemyVisual(model, {}, { r: 1, g: 1, b: 1 });
    visual.object3D.position.set(2.25, 0.4, -1.75);
    visual.object3D.rotation.y = 0.63;
    visual.setState('idle');
    const authoritative = [], cosmetic = [];
    const out = visual.object3D.position.clone();
    const cosmeticOut = out.clone();
    const total = fps * 2;
    const at = second => Math.round(second * fps);
    for (let frame = 0; frame < total; frame++) {
      if (frame === at(0.2)) visual.setState('navigate');
      if (frame === at(0.5)) visual.setState('pursue');
      if (frame === at(0.7) || frame === at(0.9) || frame === at(1.3)) visual.attack();
      if (frame === at(1.1)) { visual.reset(); visual.setState('idle'); }
      if (frame === at(1.6)) visual.setState('dead');
      visual.update(1 / fps);
      visual.muzzlePosition(out);
      authoritative.push([out.x, out.y, out.z]);
      if (current && typeof visual.cosmeticMuzzlePosition === 'function') {
        visual.cosmeticMuzzlePosition(cosmeticOut);
        cosmetic.push([cosmeticOut.x, cosmeticOut.y, cosmeticOut.z]);
      }
    }
    const clips = model.clips.map(clip => ({ name: clip.name, duration: clip.duration }));
    visual.dispose();
    return { id, fps, clips, authoritative, cosmetic };
  }, { origin, id, fps, current });
}

const results = [], checks = [];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
for (const id of ids) for (const fps of rates) {
  const baseline = await sample(baselinePage, baselineOrigin, id, fps, false);
  const current = await sample(currentPage, currentOrigin, id, fps, true);
  let maxAuthoritativeDelta = 0, maxCosmeticDelta = 0;
  for (let frame = 0; frame < baseline.authoritative.length; frame++) {
    maxAuthoritativeDelta = Math.max(maxAuthoritativeDelta, distance(baseline.authoritative[frame], current.authoritative[frame]));
    if (current.cosmetic[frame]) maxCosmeticDelta = Math.max(maxCosmeticDelta, distance(baseline.authoritative[frame], current.cosmetic[frame]));
  }
  const originalNames = baseline.clips.map(clip => clip.name);
  const currentOriginals = current.clips.filter(clip => !clip.name.toLowerCase().startsWith('polish_')).map(clip => clip.name);
  const originalClipsExact = JSON.stringify(originalNames) === JSON.stringify(currentOriginals);
  const authoritativeExact = maxAuthoritativeDelta <= tolerance;
  const cosmeticSeparated = maxCosmeticDelta > 1e-4;
  checks.push({ name: `${id} ${fps}Hz original clip inventory`, ok: originalClipsExact });
  checks.push({ name: `${id} ${fps}Hz authoritative muzzle parity`, ok: authoritativeExact, maxDelta: maxAuthoritativeDelta });
  checks.push({ name: `${id} ${fps}Hz cosmetic muzzle separated`, ok: cosmeticSeparated, maxDelta: maxCosmeticDelta });
  results.push({ id, fps, originalClipsExact, maxAuthoritativeDelta, maxCosmeticDelta, baselineClips: baseline.clips, currentClips: current.clips });
}

await baselinePage.close(); await currentPage.close(); await browser.close();
const evidence = { generatedAt: new Date().toISOString(), baselineOrigin, currentOrigin, tolerance, results, checks, errors };
await writeFile(`${outDir}/combat-parity.json`, JSON.stringify(evidence, null, 2));
for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.maxDelta === undefined ? '' : ` -- max delta ${check.maxDelta}`}`);
console.log(`\n${checks.filter(check => check.ok).length}/${checks.length} checks passed; ${errors.length} browser errors`);
if (checks.some(check => !check.ok) || errors.length) process.exitCode = 1;
