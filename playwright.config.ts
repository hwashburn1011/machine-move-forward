import { defineConfig } from '@playwright/test';

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
    // SwiftShader: CI machines have no GPU, and a software context still
    // exercises every code path that matters here.
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
