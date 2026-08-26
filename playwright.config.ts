import { defineConfig } from '@playwright/test';

/**
 * Which port the harness drives.
 *
 * Overridable because `reuseExistingServer` will happily attach to whatever is
 * already answering on 5173 — including a dev server started from a DIFFERENT
 * checkout of this repo. That does not fail loudly: the suite boots, the game
 * runs, and the assertions measure someone else's code. Set `PORT` to give a
 * second checkout a lane of its own.
 */
const PORT = Number(process.env.PORT ?? 5173);
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: ORIGIN,
    // SwiftShader: CI machines have no GPU, and a software context still
    // exercises every code path that matters here.
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
