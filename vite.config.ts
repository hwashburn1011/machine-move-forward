import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // rapier3d-compat inlines its wasm as base64, so no wasm plugin is needed,
  // but it must skip dependency pre-bundling or the init path breaks.
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
  server: { port: 5173 },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1200 },
});
