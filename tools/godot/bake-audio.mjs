/** Render the original WebAudio recipes offline; Godot plays the resulting WAVs. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
await fs.mkdir('godot/assets/audio', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.MMF_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto(`http://127.0.0.1:${process.env.MMF_PORT ?? 5207}/viewer/`);
  const ids = await page.evaluate(async () => {
    const bank = await import('/src/audio/SoundBank.ts');
    globalThis.bakeSound = async id => {
      const ambient = ['machine-loop', 'calm-loop'].includes(id);
      const spec = ambient ? null : bank.soundSpec(id);
      const duration = ambient ? 10 : spec.envelope.attack + spec.envelope.decay + .02;
      const ctx = new OfflineAudioContext(1, Math.ceil(duration * 44100), 44100);
      let seed = 982451653;
      const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
      for (const semitones of ambient ? [0] : spec.layers ?? [0]) {
        const ratio = 2 ** (semitones / 12);
        const envelope = ctx.createGain(); envelope.connect(ctx.destination);
        let node;
        if (ambient) {
          node = ctx.createOscillator(); node.type = id === 'machine-loop' ? 'triangle' : 'sine';
          node.frequency.value = id === 'machine-loop' ? 50 : 98;
          const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = id === 'machine-loop' ? 100 : 420; filter.Q.value = .6;
          node.connect(filter).connect(envelope); envelope.gain.value = .5;
        } else {
          const { peak, attack, decay } = spec.envelope;
          envelope.gain.setValueAtTime(0, 0);
          envelope.gain.linearRampToValueAtTime(peak, Math.max(.001, attack));
          envelope.gain.linearRampToValueAtTime(0, attack + decay);
          if (spec.source.kind === 'noise') {
            node = ctx.createBufferSource(); const buffer = ctx.createBuffer(1, ctx.length, ctx.sampleRate);
            const samples = buffer.getChannelData(0); for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;
            node.buffer = buffer;
            const filter = ctx.createBiquadFilter(); filter.type = spec.source.filter; filter.frequency.value = spec.source.hz * ratio; filter.Q.value = spec.source.q;
            node.connect(filter).connect(envelope);
          } else {
            node = ctx.createOscillator(); node.type = spec.source.wave; node.frequency.setValueAtTime(spec.source.hz * ratio, 0);
            if (spec.source.toHz) node.frequency.exponentialRampToValueAtTime(spec.source.toHz * ratio, duration - .02);
            node.connect(envelope);
          }
        }
        node.start(); node.stop(duration);
      }
      const audio = (await ctx.startRendering()).getChannelData(0);
      const wav = new ArrayBuffer(44 + audio.length * 2), view = new DataView(wav);
      const string = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
      string(0, 'RIFF'); view.setUint32(4, wav.byteLength - 8, true); string(8, 'WAVEfmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, 44100, true); view.setUint32(28, 88200, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      string(36, 'data'); view.setUint32(40, audio.length * 2, true);
      audio.forEach((sample, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true));
      const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      const link = document.createElement('a'); link.href = url; link.download = id + '.wav'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    };
    return [...bank.allSoundIds(), 'machine-loop', 'calm-loop'];
  });
  for (const id of ids) {
    const pending = page.waitForEvent('download');
    await page.evaluate(id => globalThis.bakeSound(id), id);
    await (await pending).saveAs(`godot/assets/audio/${id}.wav`);
  }
  console.log(`Baked ${ids.length} original sound recipes.`);
} finally { await browser.close(); }
