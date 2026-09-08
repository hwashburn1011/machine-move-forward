import type { TurretView } from '@/defense/DefenseSystem';
import { TURRETS } from '@/data/turrets';

/** Mounted controls and aim limits, using the same definition as the gun. */
export class DefenseHUD {
  private readonly panel = document.createElement('div');
  private readonly status: HTMLElement;
  private readonly angles: HTMLElement;
  private readonly traverse: HTMLElement;
  private readonly ready: HTMLElement;

  constructor(private readonly root: HTMLElement) {
    this.panel.id = 'hud-deck-gun';
    this.panel.className = 'hud-panel';
    this.panel.hidden = true;
    this.panel.innerHTML = `
      <div class="hud-label">Manual deck gun</div>
      <div class="deck-gun-status"></div>
      <div class="deck-gun-ready"><i></i></div>
      <div class="deck-gun-traverse"><i></i></div>
      <div class="deck-gun-angles"></div>
      <div class="deck-gun-controls">Mouse aim · LMB fire<br>E / Esc leave gun</div>
    `;
    this.status = this.panel.querySelector('.deck-gun-status')!;
    this.angles = this.panel.querySelector('.deck-gun-angles')!;
    this.traverse = this.panel.querySelector('.deck-gun-traverse i')!;
    this.ready = this.panel.querySelector('.deck-gun-ready i')!;
    root.append(this.panel);
  }

  update(view: TurretView | null): void {
    this.panel.hidden = !view;
    this.root.classList.toggle('is-crewing-gun', Boolean(view));
    if (!view) return;
    const def = TURRETS['manual-turret'];
    const status = !view.powered
      ? 'NO POWER — check generator'
      : view.cooldownFraction > 0.01
        ? 'CYCLING'
        : `READY · ${def.powerDraw} POWER`;
    if (this.status.textContent !== status) this.status.textContent = status;
    this.panel.classList.toggle('is-unpowered', !view.powered);
    const yaw = Math.round((view.yaw * 180) / Math.PI);
    const pitch = Math.round((view.pitch * 180) / Math.PI);
    const angles = `${Math.abs(yaw)}° ${yaw < 0 ? 'L' : 'R'} / ±120° · elevation ${pitch}°`;
    if (this.angles.textContent !== angles) this.angles.textContent = angles;
    const fraction = (view.yaw - def.traverse.yawMin) / (def.traverse.yawMax - def.traverse.yawMin);
    this.traverse.style.left = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    this.ready.style.transform = `scaleX(${view.powered ? 1 - view.cooldownFraction : 0})`;
  }

  dispose(): void {
    this.root.classList.remove('is-crewing-gun');
    this.panel.remove();
  }
}
