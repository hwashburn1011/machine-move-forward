import type { WeaponDefinition } from './weapons';

export type AttachmentId =
  'rifle-stabilizer' | 'rifle-burst-cam' | 'shotgun-choke' | 'shotgun-scatter-brake';
export type WeaponLoadoutWeapon = 'rifle' | 'shotgun';
export interface AttachmentDefinition {
  readonly id: AttachmentId;
  readonly weaponId: WeaponLoadoutWeapon;
  readonly name: string;
  readonly cost: Readonly<{ scrap: number; components: number }>;
}
export const WEAPON_ATTACHMENTS: Readonly<Record<AttachmentId, AttachmentDefinition>> = {
  'rifle-stabilizer': {
    id: 'rifle-stabilizer',
    weaponId: 'rifle',
    name: 'Rifle Stabilizer',
    cost: { scrap: 12, components: 8 },
  },
  'rifle-burst-cam': {
    id: 'rifle-burst-cam',
    weaponId: 'rifle',
    name: 'Rifle Burst Cam',
    cost: { scrap: 12, components: 8 },
  },
  'shotgun-choke': {
    id: 'shotgun-choke',
    weaponId: 'shotgun',
    name: 'Shotgun Choke',
    cost: { scrap: 12, components: 8 },
  },
  'shotgun-scatter-brake': {
    id: 'shotgun-scatter-brake',
    weaponId: 'shotgun',
    name: 'Shotgun Scatter Brake',
    cost: { scrap: 12, components: 8 },
  },
};
export const attachmentsForWeapon = (weaponId: string): readonly AttachmentId[] =>
  (Object.keys(WEAPON_ATTACHMENTS) as AttachmentId[]).filter(
    (id) => WEAPON_ATTACHMENTS[id].weaponId === weaponId,
  );

export function applyAttachment(def: WeaponDefinition, id: AttachmentId): WeaponDefinition {
  const attachment = WEAPON_ATTACHMENTS[id];
  if (!attachment || attachment.weaponId !== def.id) return def;
  const next = { ...def };
  if (id === 'rifle-stabilizer') {
    next.spread *= 0.55;
    next.aimSpread *= 0.55;
    next.recoil *= 0.65;
    next.reloadTime *= 1.15;
  } else if (id === 'rifle-burst-cam') {
    next.fireRate = 12;
  } else if (id === 'shotgun-choke') {
    next.spread *= 0.6;
    next.aimSpread *= 0.6;
    next.range *= 1.35;
    next.falloffStart *= 1.25;
    next.fireRate *= 0.8;
  } else {
    next.spread *= 1.2;
    next.aimSpread *= 1.2;
    next.range *= 0.75;
    next.falloffStart *= 0.8;
    next.fireRate *= 1.25;
  }
  return Object.freeze(next);
}
