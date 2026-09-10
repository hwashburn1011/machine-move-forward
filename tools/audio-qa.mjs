/** Real Chrome WebAudio rendering and persisted settings smoke test. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'docs/audio';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${process.env.MMF_PORT ?? 5193}/?nolock=1&nospawn=1&quality=medium`);
  await page.waitForFunction(() => globalThis.__game, null, { timeout: 120000 });
  const report = await page.evaluate(async () => {
    const { AudioEngine } = await import('/src/audio/AudioEngine.ts');
    const Original = globalThis.AudioContext;
    const rate = 24000, seconds = 48;
    const rms = (data, start, end) => {
      let sum = 0;
      for (let i = start * rate; i < end * rate; i++) sum += data[i] ** 2;
      return Math.sqrt(sum / ((end - start) * rate));
    };
    async function render(mode) {
      const ctx = new OfflineAudioContext(1, rate * seconds, rate);
      let time = 0;
      Object.defineProperty(ctx, 'state', { get: () => 'running' });
      Object.defineProperty(ctx, 'currentTime', { get: () => time });
      globalThis.AudioContext = function () { return ctx; };
      const engine = new AudioEngine();
      globalThis.AudioContext = Original;
      if (mode === 'legacy') {
        const make = (hz, detune, cutoff, q, gain) => {
          const osc = ctx.createOscillator(), filter = ctx.createBiquadFilter(), level = ctx.createGain();
          osc.type = 'sawtooth'; osc.frequency.value = hz; osc.detune.value = detune;
          filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = q;
          level.gain.value = gain * .8;
          osc.connect(filter).connect(level).connect(ctx.destination); osc.start();
        };
        make(58, 0, 180, .6, .09);
        make(98, -11, 420, .5, .05); make(98, 11, 420, .5, .05);
      } else {
        if (mode === 'off' || mode === 'effects') engine.setAmbienceVolume(0);
        for (time = 0; time < seconds; time += .1) {
          engine.updateDrone(7.5, 7.5); engine.updatePad(true);
          if (mode === 'paused' && time >= 10) engine.setActive(false);
          if (mode === 'hidden' && time >= 10) { engine.hidden = true; engine.syncOutput(); }
        }
        if (mode === 'effects') { time = 20; engine.play('radio-signal'); }
      }
      const rendered = (await ctx.startRendering()).getChannelData(0);
      const result = { phraseRms: rms(rendered, 5, 12), restRms: rms(rendered, 25, 30), lateRms: rms(rendered, 40, 45), cueRms: rms(rendered, 20, 21), peak: Math.max(...rendered.subarray(20 * rate, 21 * rate).map(Math.abs)) };
      engine.dispose();
      return result;
    }
    const results = {};
    for (const mode of ['legacy', 'normal', 'off', 'effects', 'paused', 'hidden']) results[mode] = await render(mode);
    results.reductionDb = 20 * Math.log10(results.normal.phraseRms / results.legacy.phraseRms);
    return results;
  });
  if (!(report.reductionDb < -15 && report.off.lateRms < 1e-6 && report.effects.cueRms > .01 && report.paused.lateRms < 1e-6 && report.hidden.lateRms < 1e-6)) throw new Error(JSON.stringify(report));
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#title-ambience').fill('0');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mmf-settings')));
  if (stored.ambienceVolume !== 0 || stored.volume !== .8) throw new Error('Independent settings failed');
  await page.screenshot({ path: `${out}/settings.png` });
  await page.reload();
  await page.waitForFunction(() => globalThis.__game, null, { timeout: 120000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  if (await page.locator('#title-ambience').inputValue() !== '0') throw new Error('Setting did not survive reload');
  await writeFile(`${out}/verification.json`, JSON.stringify({ ...report, persisted: true, errors }, null, 2));
  console.log(JSON.stringify({ ...report, persisted: true, errors }));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
