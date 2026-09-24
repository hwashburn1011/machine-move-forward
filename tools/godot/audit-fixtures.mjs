import fs from 'node:fs/promises';
import path from 'node:path';
import { moduleData } from './ts-data.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const source = name => moduleData(path.join(root, 'src', name));
const { Producer } = source('building/Producer');
const { SeedGarden } = source('building/SeedGarden');
const { MachineDamage } = source('machine/MachineDamage');
const { UpgradeSystem } = source('progression/UpgradeSystem');
const { UPGRADES } = source('data/upgrades');
const { producerRoleOf } = source('data/needs');
const producers = [];
for (const kind of ['condenser', 'planter']) {
  const { periodS: period, capacity, needsPower } = producerRoleOf(kind);
  const device = new Producer(period, capacity);
  const steps = [];
  for (const [action, value] of [['tick', period / 2], ['off', period * 2], ['tick', period / 2], ['tick', 10000], ['claim', 1], ['tick', 0.01], ['claim', 10], ['tick', 0.01], ['tick', period]]) {
    if (action === 'claim') device.claim(value); else device.fixedUpdate(value, action !== 'off' || !needsPower);
    steps.push({ action, value, ...device.toSave() });
  }
  producers.push({ kind, steps });
}
const garden = new SeedGarden();
const gardenSteps = [];
for (const [action, value] of [['water', 2], ['tick', 179], ['tick', 181], ['water', 2], ['tick', 10000], ['harvest', 1], ['tick', 180], ['harvest', 2], ['tick', 90], ['tick', 90], ['harvest', 6], ['tick', 10000], ['water', 2], ['tick', 1]]) {
  if (action === 'water') garden.loadWater(value); else if (action === 'harvest') garden.harvest(value); else garden.fixedUpdate(value);
  gardenSteps.push({ action, value, ...garden.snapshot() });
}
const legs = [];
for (const fraction of [1, 0.75, 0.5, 0.25, 0]) {
  const damage = new MachineDamage();
  damage.restore(damage.toSave().map(p => ({ ...p, health: p.id === 'engine' ? p.health : p.health * fraction })));
  legs.push({ fraction, speedScale: damage.speedScale });
}
const upgrades = [];
const controller = new UpgradeSystem();
let charged = 0;
const purse = { canAfford: () => true, consume: () => { charged++; return true; } };
for (const id of Object.keys(UPGRADES)) {
  for (const action of ['research', 'research', 'fit', 'remove']) {
    const ok = action === 'research' ? controller.research(id, purse).ok : action === 'fit' ? controller.activate(id) : controller.setActive(UPGRADES[id].branch, null).ok;
    upgrades.push({ id, action, ok, charged, snapshot: controller.toSave(), modifiers: controller.modifiers() });
  }
}
const out = path.join(root, 'godot/data/audit-fixtures.json');
await fs.writeFile(out, JSON.stringify({ producers, garden: gardenSteps, legs, upgrades }, null, 2) + '\n');
console.log(`Wrote original-controller fixtures to ${out}`);
