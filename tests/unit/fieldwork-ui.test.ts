/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { FieldworkUI, type FieldworkView } from '@/ui/FieldworkUI';

const view: FieldworkView = {
  weaponId: 'rifle',
  title: 'Fieldwork',
  profileLabel: 'Rifle',
  available: true,
  scrap: 20,
  components: 10,
  researched: [],
  active: null,
  stats: {
    damage: 10,
    fireRate: 2,
    spread: 1,
    aimSpread: 0.5,
    recoil: 1,
    range: 20,
    reloadTime: 2,
  },
  ammoInMag: 6,
  reserveAmmo: 20,
  infiniteReserve: false,
};
describe('FieldworkUI', () => {
  it('renders both weapons, attachments, and readable stats', () => {
    const parent = document.createElement('main');
    const cb = { close: vi.fn(), research: vi.fn(), equip: vi.fn(), selectWeapon: vi.fn() };
    const ui = new FieldworkUI(parent, cb);
    ui.open(view);
    expect(parent.querySelector('[data-panel="fieldwork"]')).not.toBeNull();
    expect(parent.textContent).toContain('Damage');
    expect(parent.querySelectorAll('[data-weapon]').length).toBe(2);
    expect(parent.textContent).toContain('55% spread, 65% recoil');
    (parent.querySelector('[data-attachment="rifle-stabilizer"]') as HTMLButtonElement).click();
    expect(cb.research).toHaveBeenCalledWith('rifle', 'rifle-stabilizer');
  });
  it('guards research and allows free removal', () => {
    const parent = document.createElement('main');
    const cb = { close: vi.fn(), research: vi.fn(), equip: vi.fn(), selectWeapon: vi.fn() };
    const ui = new FieldworkUI(parent, cb);
    ui.open({ ...view, researched: ['rifle-stabilizer'], active: 'rifle-stabilizer' });
    (parent.querySelector('[data-equip="none"]') as HTMLButtonElement).click();
    expect(cb.equip).toHaveBeenCalledWith('rifle', null);
  });
});
