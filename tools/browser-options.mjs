/**
 * Shared Chromium launch options for the browser harnesses.
 *
 * CI and ordinary local runs deliberately stay on SwiftShader so the harness
 * does not depend on a GPU. Set MMF_HARDWARE=1 to exercise the installed
 * system Chrome with its real graphics stack when reviewing visual output.
 */
const SYSTEM_CHROME =
  process.env.MMF_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export const browserLaunchOptions =
  process.env.MMF_HARDWARE === '1'
    ? {
        executablePath: SYSTEM_CHROME,
        args: ['--use-angle=d3d11', '--enable-gpu'],
      }
    : {
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      };

