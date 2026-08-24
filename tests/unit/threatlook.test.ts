import { describe, it, expect } from 'vitest';
import { hostileTint, luminance } from '@/enemies/ThreatLook';

/**
 * Recolouring the placeholder so it stops matching the desert.
 *
 * The CC0 model's dominant colour is #ca9337 — an amber almost exactly the
 * tone of the dunes behind it. A scavenger the same colour as the sand is one
 * the player walks past, which is what happened.
 */
describe('hostile tint', () => {
  const SAND = { r: 0.85, g: 0.66, b: 0.42 };
  const MAIN = { r: 0xca / 255, g: 0x93 / 255, b: 0x37 / 255 };

  it('darkens what it is given', () => {
    expect(luminance(hostileTint(MAIN))).toBeLessThan(luminance(MAIN));
  });

  it('moves the model away from the colour of the sand', () => {
    const before = Math.abs(luminance(MAIN) - luminance(SAND));
    const after = Math.abs(luminance(hostileTint(MAIN)) - luminance(SAND));
    // Contrast against the background is the entire point.
    expect(after).toBeGreaterThan(before);
  });

  it('keeps every channel inside 0..1', () => {
    for (const c of [MAIN, SAND, { r: 1, g: 1, b: 1 }, { r: 0, g: 0, b: 0 }]) {
      const out = hostileTint(c);
      for (const v of [out.r, out.g, out.b]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('leaves black black rather than driving it negative', () => {
    const out = hostileTint({ r: 0, g: 0, b: 0 });
    expect(out.r).toBeGreaterThanOrEqual(0);
    expect(luminance(out)).toBeLessThan(0.05);
  });

  it('runs warm, so what is left reads as rust rather than plastic', () => {
    const out = hostileTint({ r: 0.5, g: 0.5, b: 0.5 });
    expect(out.r).toBeGreaterThan(out.b);
  });

  it('keeps a lighter input lighter than a darker one', () => {
    // Flattening every material to one colour would lose the model's shapes.
    const light = hostileTint({ r: 0.8, g: 0.8, b: 0.8 });
    const dark = hostileTint({ r: 0.2, g: 0.2, b: 0.2 });
    expect(luminance(light)).toBeGreaterThan(luminance(dark));
  });

  it('is not applied twice by accident', () => {
    // Tinting an already-tinted material would compound into near-black. The
    // caller tints clones once; this asserts the two are distinguishable.
    const once = hostileTint(MAIN);
    const twice = hostileTint(once);
    expect(luminance(twice)).toBeLessThan(luminance(once));
  });
});
