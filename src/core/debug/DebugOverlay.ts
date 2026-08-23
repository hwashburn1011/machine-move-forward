export interface DebugSources {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  programs: number;
  physicsBodies: number;
  activeEnemies: number;
  activeChunks: number;
  distance: number;
  machineSpeed: number;
  machineWeight: number;
  particles: number;
  quality: string;
  simTime: number;
  postBypassed: boolean;
  godMode: boolean;
}

/**
 * Debug overlay (handoff section 57).
 *
 * Updated at 5Hz, not per frame. A per-frame debug overlay measurably distorts
 * the very FPS number it exists to report.
 */
export class DebugOverlay {
  private readonly root: HTMLDivElement;
  private visible = false;
  private lastUpdate = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'debug-overlay';
    this.root.style.cssText = [
      'position:absolute',
      'top:26px',
      'right:26px',
      'padding:10px 13px',
      'background:rgba(8,7,6,0.82)',
      'border:1px solid rgba(216,160,90,0.24)',
      "font:11px/1.6 ui-monospace,'Cascadia Mono',Menlo,Consolas,monospace",
      'color:#cbd5c0',
      'white-space:pre',
      'pointer-events:none',
      'display:none',
      'font-variant-numeric:tabular-nums',
    ].join(';');
    parent.appendChild(this.root);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? 'block' : 'none';
  }

  update(now: number, s: DebugSources): void {
    if (!this.visible) return;
    if (now - this.lastUpdate < 200) return;
    this.lastUpdate = now;

    const rows = [
      `FPS        ${s.fps.toString().padStart(6)}   ${s.frameMs.toFixed(1)} ms`,
      `Draw calls ${s.drawCalls.toString().padStart(6)}`,
      `Triangles  ${formatCount(s.triangles).padStart(6)}`,
      `Programs   ${s.programs.toString().padStart(6)}`,
      `Particles  ${s.particles.toString().padStart(6)}`,
      '',
      `Bodies     ${s.physicsBodies.toString().padStart(6)}`,
      `Enemies    ${s.activeEnemies.toString().padStart(6)}`,
      `Chunks     ${s.activeChunks.toString().padStart(6)}`,
      '',
      `Distance   ${formatCount(Math.round(s.distance)).padStart(6)} m`,
      `Speed      ${s.machineSpeed.toFixed(2).padStart(6)} m/s`,
      `Weight     ${formatCount(s.machineWeight).padStart(6)} kg`,
      `Sim time   ${s.simTime.toFixed(1).padStart(6)} s`,
      '',
      `Quality    ${s.quality.padStart(6)}`,
      `Post       ${(s.postBypassed ? 'off' : 'on').padStart(6)}`,
      `God mode   ${(s.godMode ? 'on' : 'off').padStart(6)}`,
      '',
      'F3 overlay   F4 spawn    F5 ammo',
      'F6 god       F7 +500m    F8 quality',
      'F9 post      F10 time    F1/F2 save/load',
    ];

    this.root.textContent = rows.join('\n');
  }
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}
