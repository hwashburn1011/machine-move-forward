import './fieldwork.css';
import {
  attachmentsForWeapon,
  WEAPON_ATTACHMENTS,
  type AttachmentId,
} from '@/data/weapon-loadouts';
export type { AttachmentId } from '@/data/weapon-loadouts';
export interface FieldworkStats {
  damage: number;
  fireRate: number;
  spread: number;
  aimSpread: number;
  recoil: number;
  range: number;
  reloadTime: number;
}
export interface FieldworkView {
  weaponId: 'rifle' | 'shotgun';
  title: string;
  profileLabel: string;
  available: boolean;
  refusal?: string;
  scrap: number;
  components: number;
  researched: readonly AttachmentId[];
  active: AttachmentId | null;
  stats: FieldworkStats;
  ammoInMag: number;
  reserveAmmo: number;
  infiniteReserve: boolean;
}
export interface FieldworkCallbacks {
  close(): void;
  research(weaponId: string, attachmentId: AttachmentId): void;
  equip(weaponId: string, attachmentId: AttachmentId | null): void;
  selectWeapon(id: 'rifle' | 'shotgun'): void;
}
const attachmentText: Record<AttachmentId, string> = {
  'rifle-stabilizer': '55% spread, 65% recoil; reload is 15% slower.',
  'rifle-burst-cam': 'Three rounds at 12/s, then a 0.50s recovery.',
  'shotgun-choke': '60% cone, 135% range, 125% falloff; rate is 80%.',
  'shotgun-scatter-brake': '120% cone, 75% range, 80% falloff; rate is 125%.',
};
export class FieldworkUI {
  private readonly root: HTMLElement;
  private readonly content: HTMLElement;
  private key = '';
  constructor(
    parent: HTMLElement,
    private readonly callbacks: FieldworkCallbacks,
  ) {
    this.root = document.createElement('section');
    this.root.className = 'fieldwork';
    this.root.dataset.panel = 'fieldwork';
    this.root.hidden = true;
    this.content = document.createElement('div');
    this.content.className = 'fieldwork-content';
    this.root.append(this.content);
    parent.append(this.root);
  }
  get isOpen(): boolean {
    return !this.root.hidden;
  }
  open(view: FieldworkView): void {
    this.root.hidden = false;
    this.setView(view);
  }
  setView(view: FieldworkView): void {
    const key = JSON.stringify(view);
    if (key === this.key) return;
    const focus =
      document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)
        ? (document.activeElement.dataset.weapon ??
          document.activeElement.dataset.attachment ??
          document.activeElement.dataset.equip ??
          document.activeElement.dataset.action)
        : null;
    this.key = key;
    this.content.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = 'Fieldwork';
    this.content.append(heading);
    for (const weapon of ['rifle', 'shotgun'] as const) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.dataset.weapon = weapon;
      tab.textContent = weapon === 'rifle' ? 'Rifle' : 'Shotgun';
      tab.disabled = view.weaponId === weapon;
      tab.addEventListener('click', () => this.callbacks.selectWeapon(weapon));
      this.content.append(tab);
    }
    const title = document.createElement('h3');
    title.textContent = view.title;
    this.content.append(title);
    const profile = document.createElement('p');
    profile.textContent = `${view.profileLabel} · Scrap ${view.scrap} · Components ${view.components} · Ammo ${view.ammoInMag}/${view.infiniteReserve ? '∞' : view.reserveAmmo}`;
    this.content.append(profile);
    const stats = document.createElement('p');
    const rounded = (value: number) => Number(value.toFixed(2));
    stats.textContent = `Damage ${rounded(view.stats.damage)} · Fire ${rounded(view.stats.fireRate)}/s · Hip spread ${rounded(view.stats.spread)} · Aim spread ${rounded(view.stats.aimSpread)} · Recoil ${rounded(view.stats.recoil)} · Range ${rounded(view.stats.range)}m · Reload ${rounded(view.stats.reloadTime)}s`;
    this.content.append(stats);
    const list = document.createElement('div');
    for (const id of attachmentsForWeapon(view.weaponId)) {
      const attachment = WEAPON_ATTACHMENTS[id];
      const row = document.createElement('article');
      const label = document.createElement('h4');
      label.textContent = attachment.name;
      const text = document.createElement('p');
      text.textContent = attachmentText[id];
      row.append(label, text);
      const researched = view.researched.includes(attachment.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.attachment = id;
      button.textContent = researched
        ? view.active === id
          ? 'Installed'
          : 'Equip'
        : `Research (${attachment.cost.scrap} scrap, ${attachment.cost.components} components)`;
      button.disabled =
        !view.available || (!researched && (view.scrap < 12 || view.components < 8));
      button.addEventListener('click', () =>
        researched
          ? this.callbacks.equip(view.weaponId, attachment.id)
          : this.callbacks.research(view.weaponId, attachment.id),
      );
      row.append(button);
      list.append(row);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.equip = 'none';
    remove.textContent = 'Remove attachment';
    remove.disabled = !view.available || view.active === null;
    remove.addEventListener('click', () => this.callbacks.equip(view.weaponId, null));
    list.append(remove);
    this.content.append(list);
    if (view.refusal) {
      const refusal = document.createElement('p');
      refusal.textContent = view.refusal;
      this.content.append(refusal);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.dataset.action = 'close';
    close.textContent = 'Close';
    close.addEventListener('click', () => {
      this.close();
      this.callbacks.close();
    });
    this.content.append(close);
    if (focus)
      this.root
        .querySelector<HTMLElement>(
          `[data-weapon="${focus}"], [data-attachment="${focus}"], [data-equip="${focus}"], [data-action="${focus}"]`,
        )
        ?.focus();
  }
  close(): void {
    this.root.hidden = true;
    this.key = '';
  }
  dispose(): void {
    this.root.remove();
  }
}
