import { defineConfig } from '@playwright/test';
import { browserLaunchOptions } from './tools/browser-options.mjs';

/**
 * Which port the suite talks to.
 *
 * `reuseExistingServer` means a dev server already on this port is used as-is,
 * which is exactly right on one checkout and exactly wrong on two: a second
 * worktree's server answering on 5173 would have this suite silently testing
 * someone else's code. `MMF_PORT` is the way out, and the harnesses in
 * `tools/` read the same variable.
 */
const PORT = Number(process.env.MMF_PORT ?? 5173);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    // SwiftShader remains the default. MMF_HARDWARE=1 opts into installed
    // Chrome/D3D11 for visual review on a machine with a real GPU.
    launchOptions: browserLaunchOptions,
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
