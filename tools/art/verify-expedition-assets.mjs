/**
 * Compatibility entry point for the retired Node-only expedition check.
 *
 * Asset validation now belongs to graphics_v3/validate.mjs because decoded
 * textures, browser loader behavior, and runtime material groups need a real
 * browser. Start the dev server on port 5193 before invoking this wrapper.
 */
if (process.env.MMF_PORT && process.env.MMF_PORT !== '5193') {
  throw new Error('graphics_v3 validation requires the dev server on port 5193');
}
process.env.MMF_PORT = '5193';
console.warn(
  'verify-expedition-assets.mjs is a compatibility wrapper; delegating to graphics_v3/validate.mjs',
);
await import('./graphics_v3/validate.mjs');

