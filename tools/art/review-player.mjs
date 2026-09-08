import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/art-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body><script type="module" src="/tools/art/fixture-entry.ts"></script></body></html>',
    }),
  );
  await page.goto('http://127.0.0.1:5193/art-fixture');
  await page.waitForFunction(() => globalThis.artReady || globalThis.artError, null, {
    timeout: 60000,
  });
  const failure = await page.evaluate(() => globalThis.artError);
  if (failure) throw new Error(failure);
  await page.screenshot({ path: 'docs/art/player-poses-front.png' });
  await page.evaluate(() => {
    const { camera, scene, renderer } = globalThis.artFixture;
    camera.position.set(-4, 2.9, -6);
    camera.lookAt(0, 1.1, 0);
    renderer.render(scene, camera);
  });
  await page.screenshot({ path: 'docs/art/player-poses-back.png' });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    'Three animated player poses, both actual held weapon assets, front/back images: no browser errors.',
  );
} finally {
  await browser.close();
}
