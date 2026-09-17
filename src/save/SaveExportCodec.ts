import { migrate } from './migrations';
import type { SaveGameV1 } from './SaveSchema';
import { ITEM_IDS, ITEMS, PLAYER_INVENTORY_SLOTS, type ItemId } from '@/data/items';
import { BUILD_PIECES, CRATE_SLOTS, type PieceId } from '@/data/build-pieces';
import { SUBSYSTEMS } from '@/data/subsystems';
import { WEAPONS } from '@/data/weapons';
import { WEAPON_ATTACHMENTS, attachmentsForWeapon } from '@/data/weapon-loadouts';
import { UPGRADE_IDS, UPGRADES } from '@/data/upgrades';
import { ENEMIES, MAX_ACTIVE_ENEMIES } from '@/data/enemies';
import { FIRST_RUN_STEPS } from '@/game/FirstRunDirector';
import { STORY_EXPEDITIONS, storyExpedition } from '@/data/story';
import { routeDefinition } from '@/data/routes';
import { producerRoleOf } from '@/data/needs';
import { ROUTE_HISTORY_LIMIT } from '@/navigation/RouteChart';
import { TURRETS } from '@/data/turrets';
import { FUEL_TANK_CAP } from '@/data/power';

export const MAX_EXPORT_BYTES = 8 * 1024 * 1024;
const MAX_DEPTH = 40;
const MAX_COLLECTION = 50_000;
const MAX_STRING = 64_000;
const MAX_COUNTER = 100_000;
const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const WEAPON_IDS = ['rifle', 'shotgun'] as const;
const UNLOCK_IDS = new Set([
  'manual-turret',
  'automatic-salvage-collector',
  'automatic-defense-turret',
  'seed-garden',
]);
const OPENING_PHASES = new Set(['title', 'rooftop', 'landed', 'done']);
const STORY_PHASES = new Set([
  'signal',
  'crossfire',
  'raids',
  'route-selection',
  'approach',
  'braking',
  'docked',
  'departing',
]);
const LEGACY_STORY_PHASES = new Set([
  'locked',
  'signal',
  'crossfire',
  'raids',
  'route-selection',
  'approach',
  'braking',
  'docked',
  'departing',
  'complete',
]);
const STORY_EXPEDITION_IDS = new Set(STORY_EXPEDITIONS.map((entry) => entry.id));
const STORY_UNIQUE_IDS = new Set(STORY_EXPEDITIONS.flatMap((entry) => entry.requiredUniques));
const STORY_JOURNAL_IDS = new Set(
  STORY_EXPEDITIONS.flatMap((entry) => entry.journals.map((journal) => journal.id)),
);

export class SaveExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveExportError';
  }
}

function inspect(
  value: unknown,
  depth = 0,
  seen = new Set<object>(),
  allowNonFinite = false,
): void {
  if (depth > MAX_DEPTH) throw new SaveExportError('Save nesting is too deep');
  if (typeof value === 'number' && !Number.isFinite(value) && !allowNonFinite)
    throw new SaveExportError('Save contains a non-finite number');
  if (typeof value === 'string' && value.length > MAX_STRING)
    throw new SaveExportError('Save string is too long');
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) throw new SaveExportError('Save contains a cycle');
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_COLLECTION) throw new SaveExportError('Save collection is too large');
    value.forEach((entry) => inspect(entry, depth + 1, seen, allowNonFinite));
  } else {
    const keys = Object.keys(value);
    if (keys.length > MAX_COLLECTION) throw new SaveExportError('Save object is too large');
    for (const key of keys) {
      if (BAD_KEYS.has(key)) throw new SaveExportError('Save contains a forbidden key');
      inspect((value as Record<string, unknown>)[key], depth + 1, seen, allowNonFinite);
    }
  }
  seen.delete(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SaveExportError(`Save has invalid ${label}`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new SaveExportError(`Save has invalid ${label}`);
  return value;
}

function finite(
  value: unknown,
  label: string,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new SaveExportError(`Save has invalid ${label}`);
  return value;
}

function integer(
  value: unknown,
  label: string,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
    throw new SaveExportError(`Save has invalid ${label}`);
  return value as number;
}

function nonemptyText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new SaveExportError(`Save has invalid ${label}`);
  return value;
}

function validInstanceId(value: unknown): value is string {
  if (typeof value !== 'string' || !/^bp-\d+$/.test(value)) return false;
  return Number.isSafeInteger(Number(value.slice(3)));
}

function nullableNonNegative(value: unknown, label: string): number | null {
  if (value === null) return null;
  return finite(value, label, 0);
}

function uniqueStrings(
  value: unknown,
  label: string,
  allowed?: ReadonlySet<string>,
  pattern?: RegExp,
  maxLength = MAX_COLLECTION,
): string[] {
  const values = array(value, label);
  if (values.length > maxLength) throw new SaveExportError(`Save has invalid ${label}`);
  const seen = new Set<string>();
  for (const entry of values) {
    if (
      typeof entry !== 'string' ||
      seen.has(entry) ||
      (allowed && !allowed.has(entry)) ||
      (pattern && !pattern.test(entry))
    )
      throw new SaveExportError(`Save has invalid ${label}`);
    seen.add(entry);
  }
  return values as string[];
}

function validateStack(value: unknown, label: string): void {
  if (value === null) return;
  const stack = record(value, label);
  if (typeof stack.itemId !== 'string' || !ITEM_IDS.includes(stack.itemId as ItemId))
    throw new SaveExportError(`Save has invalid ${label}`);
  integer(stack.count, label, 1, ITEMS[stack.itemId as ItemId].stackSize);
}

function validateSlots(value: unknown, label: string, capacity: number): void {
  const slots = array(value, label);
  if (slots.length > capacity) throw new SaveExportError(`Save has invalid ${label}`);
  for (const slot of slots) validateStack(slot, label);
}

function validatePlayer(value: unknown): void {
  const player = record(value, 'player state');
  const position = record(player.position, 'player position');
  finite(position.x, 'player position');
  finite(position.y, 'player position');
  finite(position.z, 'player position');
  finite(player.health, 'player health', 0, 100);
  validateSlots(player.inventory, 'inventory', PLAYER_INVENTORY_SLOTS);
  if (player.needs !== undefined) {
    const needs = record(player.needs, 'needs');
    finite(needs.hydration, 'hydration', 0, 100);
    finite(needs.nourishment, 'nourishment', 0, 100);
  }

  const equipment = record(player.equipment, 'equipment');
  if (equipment.currentWeapon !== '' && !WEAPON_IDS.includes(equipment.currentWeapon as never))
    throw new SaveExportError('Save has unknown current weapon');
  const weapons = array(equipment.weapons, 'weapon state');
  if (weapons.length > WEAPON_IDS.length)
    throw new SaveExportError('Save has invalid weapon state');
  const weaponIds = new Set<string>();
  for (const raw of weapons) {
    const weapon = record(raw, 'weapon state');
    if (
      typeof weapon.id !== 'string' ||
      !WEAPON_IDS.includes(weapon.id as never) ||
      weaponIds.has(weapon.id)
    )
      throw new SaveExportError('Save has invalid weapon state');
    weaponIds.add(weapon.id);
    const def = WEAPONS[weapon.id]!;
    const bonus =
      weapon.magazineBonus === undefined
        ? 0
        : integer(
            weapon.magazineBonus,
            'weapon magazine bonus',
            0,
            Math.floor(def.magazineSize * 0.5),
          );
    integer(weapon.ammoInMag, 'weapon magazine', 0, def.magazineSize + bonus);
    integer(weapon.reserveAmmo, 'weapon reserve', 0);
    if (weapon.attachments !== undefined) {
      const attachments = record(weapon.attachments, 'weapon attachments');
      const allowed = new Set(attachmentsForWeapon(weapon.id));
      const researched = uniqueStrings(attachments.researched, 'weapon attachments', allowed);
      if (
        attachments.active !== undefined &&
        (typeof attachments.active !== 'string' ||
          !(attachments.active in WEAPON_ATTACHMENTS) ||
          !allowed.has(attachments.active as never) ||
          !researched.includes(attachments.active))
      )
        throw new SaveExportError('Save has invalid active attachment');
    }
  }
  if (equipment.currentWeapon !== '' && !weaponIds.has(equipment.currentWeapon as string))
    throw new SaveExportError('Save is missing the current weapon state');
}

function validateStructureState(piece: Record<string, unknown>, definitionId: PieceId): void {
  if (piece.state === undefined) return;
  const state = record(piece.state, 'structure payload');
  if (definitionId === 'crate') {
    validateSlots(state.slots, 'crate contents', CRATE_SLOTS);
    return;
  }
  if (definitionId === 'collector-auto') {
    validateSlots(state.slots, 'collector contents', 6);
    return;
  }
  const producer = producerRoleOf(definitionId);
  if (producer) {
    finite(state.progress, 'producer progress', 0, producer.periodS);
    integer(state.stored, 'producer storage', 0, producer.capacity);
    return;
  }
  if (definitionId === 'seed-garden') {
    if (state.format !== 1) throw new SaveExportError('Save has invalid seed garden');
    integer(state.water, 'seed garden water', 0, 2);
    integer(state.greens, 'seed garden greens', 0, 6);
    finite(state.progressS, 'seed garden progress', 0, 180);
    return;
  }
  if (
    definitionId === 'shelf' &&
    state.factId !== undefined &&
    (typeof state.factId !== 'string' || state.factId.length === 0 || state.factId.length > 128)
  )
    throw new SaveExportError('Save has invalid keepsake state');
}

function validateMachine(value: unknown): void {
  const machine = record(value, 'machine state');
  if (machine.layout !== undefined) nonemptyText(machine.layout, 'machine layout');
  const structures = array(machine.structures, 'structures');
  const instanceIds = new Set<string>();
  for (const raw of structures) {
    const piece = record(raw, 'structure state');
    if (
      !validInstanceId(piece.instanceId) ||
      instanceIds.has(piece.instanceId) ||
      typeof piece.definitionId !== 'string' ||
      !Object.hasOwn(BUILD_PIECES, piece.definitionId)
    )
      throw new SaveExportError('Save has invalid structure state');
    instanceIds.add(piece.instanceId);
    const definitionId = piece.definitionId as PieceId;
    const definition = BUILD_PIECES[definitionId];
    const cell = record(piece.cell, 'structure cell');
    integer(cell.x, 'structure cell');
    integer(cell.y, 'structure cell');
    integer(cell.z, 'structure cell');
    integer(piece.rotation, 'structure rotation', 0, 3);
    finite(piece.health, 'structure health', 0, definition.maxHealth);
    if (piece.edge !== undefined) {
      const edge = record(piece.edge, 'structure edge');
      integer(edge.x, 'structure edge');
      integer(edge.y, 'structure edge');
      integer(edge.z, 'structure edge');
      if (edge.axis !== 'x' && edge.axis !== 'z')
        throw new SaveExportError('Save has invalid structure edge');
    } else if (definition.anchor === 'edge') {
      throw new SaveExportError('Save has missing structure edge');
    }
    if (definition.anchor !== 'edge' && piece.edge !== undefined)
      throw new SaveExportError('Save has unexpected structure edge');
    validateStructureState(piece, definitionId);
  }
  array(machine.devices, 'machine devices');
  finite(machine.fuel, 'machine fuel', 0, FUEL_TANK_CAP);
  finite(machine.coreHealth, 'machine core health', 0, 100);
  integer(machine.navigationTier, 'navigation tier', 0, 3);
  if (machine.course !== undefined) {
    const course = record(machine.course, 'course state');
    const tier = integer(course.tier, 'course tier', 0, 3);
    const limit = [0, 12, 28, 45][tier]!;
    finite(course.bearingDeg, 'course bearing', -limit, limit);
    finite(course.desiredDeg, 'course desired bearing', -limit, limit);
    finite(course.throttle, 'course throttle', 0.35, 1);
    finite(course.lateralM, 'course lateral position');
  }
  if (machine.subsystems !== undefined) {
    const subsystems = array(machine.subsystems, 'subsystems');
    const ids = new Set<string>();
    for (const raw of subsystems) {
      const subsystem = record(raw, 'subsystem state');
      if (
        typeof subsystem.id !== 'string' ||
        !Object.hasOwn(SUBSYSTEMS, subsystem.id) ||
        ids.has(subsystem.id)
      )
        throw new SaveExportError('Save has invalid subsystem state');
      ids.add(subsystem.id);
      finite(
        subsystem.health,
        'subsystem health',
        0,
        SUBSYSTEMS[subsystem.id as keyof typeof SUBSYSTEMS].maxHealth,
      );
    }
  }
}

function validateTurrets(value: unknown, automatic: boolean): void {
  if (value === undefined) return;
  const saves = array(value, automatic ? 'automatic turrets' : 'turrets');
  const ids = new Set<string>();
  const def = TURRETS[automatic ? 'automatic-turret' : 'manual-turret'];
  for (const raw of saves) {
    const turret = record(raw, automatic ? 'automatic turret' : 'turret');
    if (!validInstanceId(turret.instanceId) || ids.has(turret.instanceId))
      throw new SaveExportError(`Save has invalid ${automatic ? 'automatic turret' : 'turret'}`);
    ids.add(turret.instanceId);
    finite(turret.yaw, 'turret yaw', def.traverse.yawMin, def.traverse.yawMax);
    finite(turret.pitch, 'turret pitch', def.traverse.pitchMin, def.traverse.pitchMax);
    if (!automatic && turret.filter !== 'all')
      throw new SaveExportError('Save has invalid turret filter');
  }
}

function validateRadio(value: unknown, label: string): void {
  const radio = record(value, label);
  if (!['unarmed', 'pending', 'found'].includes(String(radio.status)))
    throw new SaveExportError(`Save has invalid ${label}`);
  nullableNonNegative(radio.armedAtSimTime, `${label} armed time`);
  nullableNonNegative(radio.foundAtSimTime, `${label} found time`);
  nullableNonNegative(radio.foundAtDistance, `${label} found distance`);
  const opened = integer(radio.eligibleChestsOpened, `${label} chest count`, 0);
  if (radio.status === 'found' && opened < 1)
    throw new SaveExportError(`Save has invalid ${label}`);
}

function validateProgression(value: unknown): void {
  const progression = record(value, 'progression');
  uniqueStrings(progression.unlocks, 'unlocks', UNLOCK_IDS);
  if (progression.turretBlueprintProgress !== undefined)
    finite(progression.turretBlueprintProgress, 'turret blueprint progress', 0, 1);
  validateTurrets(progression.turrets, false);
  validateTurrets(progression.automaticTurrets, true);
  if (progression.firstRun !== undefined) {
    const firstRun = record(progression.firstRun, 'first-run progress');
    uniqueStrings(firstRun.completed, 'first-run completed steps', new Set(FIRST_RUN_STEPS));
    const counters = record(firstRun.counters, 'first-run counters');
    for (const [key, count] of Object.entries(counters)) {
      if (!key) throw new SaveExportError('Save has invalid first-run counters');
      finite(count, 'first-run counter', Number.MIN_VALUE, MAX_COUNTER);
    }
  }
  if (progression.upgrades !== undefined) {
    const upgrades = record(progression.upgrades, 'upgrades');
    const researched = uniqueStrings(
      upgrades.researched,
      'researched upgrades',
      new Set(UPGRADE_IDS),
    );
    const active = record(upgrades.active, 'active upgrades');
    for (const [branch, id] of Object.entries(active)) {
      if (
        !['propulsion', 'power', 'defense'].includes(branch) ||
        typeof id !== 'string' ||
        !UPGRADE_IDS.includes(id as never) ||
        UPGRADES[id as keyof typeof UPGRADES].branch !== branch ||
        !researched.includes(id)
      )
        throw new SaveExportError('Save has invalid active upgrades');
    }
  }
  if (progression.caretaker !== undefined) {
    const caretaker = record(progression.caretaker, 'caretaker');
    if (
      caretaker.format !== 1 ||
      typeof caretaker.recruited !== 'boolean' ||
      !['companion', 'steward'].includes(String(caretaker.mode))
    )
      throw new SaveExportError('Save has invalid caretaker');
  }
  if (progression.radio !== undefined) validateRadio(progression.radio, 'radio ledger');
  if (progression.radioDrop !== undefined)
    validateRadio(progression.radioDrop, 'legacy radio ledger');
  if (progression.opening !== undefined) {
    const opening = record(progression.opening, 'opening');
    if (!OPENING_PHASES.has(String(opening.phase)))
      throw new SaveExportError('Save has invalid opening');
  }
}

function validateThreat(value: unknown): void {
  const threat = record(value, 'threat director');
  const phase = String(threat.phase);
  if (!['calm', 'buildup', 'contact', 'engagement', 'recovery'].includes(phase))
    throw new SaveExportError('Save has invalid threat phase');
  if (phase === 'contact' || phase === 'engagement') {
    if (threat.phaseEndsAt !== null) finite(threat.phaseEndsAt, 'threat phase distance', 0);
  } else {
    finite(threat.phaseEndsAt, 'threat phase distance', 0);
  }
  integer(threat.wavesSurvived, 'threat waves survived', 0, MAX_COUNTER);
  if (threat.lane !== undefined && threat.lane !== 'ordinary' && threat.lane !== 'radio-raid')
    throw new SaveExportError('Save has invalid recurring encounter lane');
  const pending = array(threat.pending, 'threat queue');
  if (
    pending.length > MAX_ACTIVE_ENEMIES ||
    pending.some((id) => typeof id !== 'string' || !Object.hasOwn(ENEMIES, id))
  )
    throw new SaveExportError('Save has invalid threat queue');
  finite(threat.nextReleaseAt, 'threat release time', 0);
  integer(threat.draws, 'threat draws', 0, MAX_COUNTER);
  if (threat.wavesSinceVehicle !== undefined)
    integer(threat.wavesSinceVehicle, 'threat vehicle wave count', 0, MAX_COUNTER);
  if (threat.vehicleQueued !== undefined && typeof threat.vehicleQueued !== 'boolean')
    throw new SaveExportError('Save has invalid queued vehicle state');
  if (
    threat.queuedVehicle !== undefined &&
    threat.queuedVehicle !== null &&
    threat.queuedVehicle !== 'skiff' &&
    threat.queuedVehicle !== 'gunboat'
  )
    throw new SaveExportError('Save has invalid queued vehicle');
  for (const key of ['externalEncounterActive', 'sanctuaryActive'])
    if (threat[key] !== undefined && typeof threat[key] !== 'boolean')
      throw new SaveExportError(`Save has invalid threat ${key}`);
  if (threat.sanctuaryActive === true && threat.sanctuaryReleaseAt === null)
    throw new SaveExportError('Save has invalid threat sanctuary release');
  if (threat.sanctuaryReleaseAt !== undefined && threat.sanctuaryReleaseAt !== null)
    finite(threat.sanctuaryReleaseAt, 'threat sanctuary release', 0);
}

/**
 * ThreatDirector deliberately uses Infinity for deadlines that are inactive or
 * owned by an engagement. IndexedDB preserves it, while JSON writes it as null.
 * Canonicalise those two documented sentinels before the normal finite-number
 * inspection so direct saves and imported exports have the same safe shape.
 */
function canonicalizeThreatDeadlines(save: SaveGameV1): void {
  const threat = save.world?.threatDirector as unknown as Record<string, unknown> | null;
  if (!threat) return;
  if (
    threat.phaseEndsAt === Number.POSITIVE_INFINITY &&
    (threat.phase === 'contact' || threat.phase === 'engagement')
  )
    threat.phaseEndsAt = null;
  if (threat.sanctuaryReleaseAt === Number.POSITIVE_INFINITY && threat.sanctuaryActive !== true)
    threat.sanctuaryReleaseAt = null;
}

function validateDust(value: unknown): void {
  const dust = record(value, 'dust front');
  const duration =
    dust.phase === 'forecast'
      ? 35
      : dust.phase === 'front'
        ? 70
        : dust.phase === 'clearing'
          ? 20
          : 0;
  if (dust.format !== 1 || !['clear', 'forecast', 'front', 'clearing'].includes(String(dust.phase)))
    throw new SaveExportError('Save has invalid dust state');
  finite(dust.elapsedS, 'dust elapsed time', 0, duration);
  finite(dust.nextAtM, 'dust distance', 0);
  integer(dust.sequence, 'dust sequence', 0);
}

function validateRaidCargo(value: unknown, label: string): void {
  const cargo = record(value, label);
  if (!['scrap', 'components', 'fuel'].includes(String(cargo.itemId)))
    throw new SaveExportError(`Save has invalid ${label}`);
  integer(cargo.count, label, 1, cargo.itemId === 'scrap' ? 6 : 2);
}

function validateRaidRecovery(value: unknown): void {
  const recovery = record(value, 'raid recovery');
  if (recovery.active !== undefined) {
    const active = record(recovery.active, 'raid recovery active state');
    if (
      !['assault', 'sabotage', 'theft'].includes(String(active.objective)) ||
      typeof active.carrierId !== 'string' ||
      active.carrierId.length === 0 ||
      typeof active.targetId !== 'string' ||
      active.targetId.length === 0 ||
      !['intent', 'carrying', 'escaped', 'recovered', 'cancelled'].includes(String(active.state))
    )
      throw new SaveExportError('Save has invalid raid recovery active state');
    const entry = record(active.entry, 'raid entry');
    finite(entry.x, 'raid entry');
    finite(entry.y, 'raid entry');
    finite(entry.z, 'raid entry');
    if (active.cargo !== null) validateRaidCargo(active.cargo, 'raid cargo');
  }
  if (recovery.recovered !== undefined)
    for (const cargo of array(recovery.recovered, 'raid recovery ledger'))
      validateRaidCargo(cargo, 'raid recovery ledger');
}

function validateRouteReward(value: unknown, expectedId: string, cap: number): void {
  const reward = record(value, 'route reward');
  if (expectedId.endsWith('-record') || expectedId === 'memorial-transmission') {
    if (reward.type !== 'journal' || reward.factId !== expectedId)
      throw new SaveExportError('Save has invalid route reward');
  } else if (reward.type !== 'item' || reward.itemId !== expectedId) {
    throw new SaveExportError('Save has invalid route reward');
  }
  integer(reward.remaining, 'route reward', 0, cap);
}

function validateRouteContact(value: unknown): void {
  const contact = record(value, 'active route contact');
  const slot = integer(contact.slot, 'route contact slot', 1);
  if (contact.id !== `route-contact-${slot}`)
    throw new SaveExportError('Save has invalid route contact id');
  if (!['water-cache', 'salvage-wreck', 'memorial', 'repair-depot'].includes(String(contact.kind)))
    throw new SaveExportError('Save has invalid route contact kind');
  const atDistance = finite(contact.atDistanceM, 'route contact distance', 0);
  finite(contact.worldX, 'route contact lateral position');
  finite(contact.confidence, 'route contact confidence', 0, 1);
  if (!['calm', 'uncertain', 'hostile'].includes(String(contact.hazard)))
    throw new SaveExportError('Save has invalid route contact hazard');
  const detectedAt = finite(contact.detectedAtM, 'route contact detection distance', 0);
  const expiresAt = finite(contact.expiresAtM, 'route contact expiry distance', 0);
  if (detectedAt > atDistance || expiresAt < atDistance)
    throw new SaveExportError('Save has invalid route contact distances');
  if (
    !['detected', 'committed', 'docked', 'visited', 'missed', 'suspended'].includes(
      String(contact.state),
    )
  )
    throw new SaveExportError('Save has invalid route contact state');
  if (
    contact.salvageMode !== undefined &&
    !['secure', 'broadcast', 'defended'].includes(String(contact.salvageMode))
  )
    throw new SaveExportError('Save has invalid salvage mode');
  const rewards = array(contact.rewards, 'route rewards');
  const expected: [string, number][] =
    contact.kind === 'repair-depot'
      ? [
          ['repair-kit', 1],
          ['depot-linekeeper-record', 1],
        ]
      : contact.kind === 'water-cache'
        ? [['water', 4]]
        : contact.kind === 'salvage-wreck'
          ? [
              ['scrap', contact.salvageMode === 'defended' ? 48 : 24],
              ['components', contact.salvageMode === 'defended' ? 6 : 2],
            ]
          : [['memorial-transmission', 1]];
  if (rewards.length !== expected.length)
    throw new SaveExportError('Save has invalid route rewards');
  rewards.forEach((reward, index) => validateRouteReward(reward, ...expected[index]!));
  if (
    contact.state === 'visited' &&
    rewards.some((reward) => (reward as Record<string, unknown>).remaining !== 0)
  )
    throw new SaveExportError('Save has invalid visited route rewards');
  if (contact.state === 'suspended') {
    if (!['detected', 'committed'].includes(String(contact.suspendedFrom)))
      throw new SaveExportError('Save has invalid suspended route contact');
    finite(contact.suspendedRemainingM, 'suspended route distance');
    finite(contact.suspendedWindowM, 'suspended route window');
  } else if (
    contact.suspendedFrom !== undefined ||
    contact.suspendedRemainingM !== undefined ||
    contact.suspendedWindowM !== undefined
  ) {
    throw new SaveExportError('Save has unexpected suspended route state');
  }
}

function validateRouteChart(value: unknown): void {
  const chart = record(value, 'route chart');
  if (chart.format !== 1) throw new SaveExportError('Save has invalid route chart');
  integer(chart.nextSlot, 'route next slot', 1);
  for (const key of ['discovered', 'visited', 'missed'])
    uniqueStrings(
      chart[key],
      `route ${key}`,
      undefined,
      /^route-contact-[1-9]\d*$/,
      ROUTE_HISTORY_LIMIT,
    );
  if (chart.active !== undefined) validateRouteContact(chart.active);
}

function validateEnding(value: unknown): void {
  const ending = record(value, 'ending');
  if (
    ending.format !== 1 ||
    !['available', 'committed', 'arrival', 'credits', 'complete'].includes(String(ending.phase))
  )
    throw new SaveExportError('Save has invalid ending');
  const distance = nullableNonNegative(ending.committedAtDistance, 'ending distance');
  const elapsed = finite(ending.arrivalElapsedS, 'ending elapsed time', 0, 12);
  if ((ending.phase === 'available') !== (distance === null))
    throw new SaveExportError('Save has invalid ending distance');
  if ((ending.phase === 'available' || ending.phase === 'committed') && elapsed !== 0)
    throw new SaveExportError('Save has invalid ending elapsed time');
}

function validateStory(value: unknown): void {
  const story = record(value, 'story');
  if (story.format !== 2) {
    validateLegacyStory(story);
    return;
  }
  const completed = uniqueStrings(story.completed, 'completed expeditions', STORY_EXPEDITION_IDS);
  uniqueStrings(story.recoveredUniques, 'recovered story items', STORY_UNIQUE_IDS);
  if (story.journalArchive !== undefined)
    uniqueStrings(story.journalArchive, 'story journal archive', STORY_JOURNAL_IDS);
  for (const key of ['radioTraceEligible', 'chapterComplete'])
    if (story[key] !== undefined && typeof story[key] !== 'boolean')
      throw new SaveExportError(`Save has invalid story ${key}`);
  if (story.active !== null) {
    const active = record(story.active, 'active story');
    if (
      typeof active.expeditionId !== 'string' ||
      !STORY_EXPEDITION_IDS.has(active.expeditionId as never)
    )
      throw new SaveExportError('Save has invalid active expedition');
    const expedition = storyExpedition(active.expeditionId)!;
    if (!STORY_PHASES.has(String(active.phase)))
      throw new SaveExportError('Save has invalid active story phase');
    const arrival =
      active.arrivalDistance === null
        ? null
        : finite(active.arrivalDistance, 'story arrival distance', 0);
    const phase = active.phase as string;
    const route =
      active.routeId === null
        ? undefined
        : typeof active.routeId === 'string'
          ? routeDefinition(active.routeId)
          : undefined;
    const phaseValid =
      expedition.id === 'wreck-one'
        ? ['signal', 'crossfire', 'raids'].includes(phase)
          ? arrival === null
          : ['approach', 'braking', 'docked', 'departing'].includes(phase) && arrival !== null
        : ['glass-orchard', 'last-garden-meridian'].includes(expedition.id) &&
            phase === 'route-selection'
          ? arrival === null
          : ['approach', 'braking', 'docked', 'departing'].includes(phase) && arrival !== null;
    const routeValid =
      expedition.id === 'wreck-one' || expedition.id === 'quiet-array'
        ? active.routeId === null
        : phase === 'route-selection' &&
            ['glass-orchard', 'last-garden-meridian'].includes(expedition.id)
          ? active.routeId === null
          : !!route && route.destinationId === expedition.id;
    if (!phaseValid || !routeValid || completed.includes(expedition.id))
      throw new SaveExportError('Save has contradictory active story');
    uniqueStrings(
      active.journalsRead,
      'active story journals',
      new Set(expedition.journals.map((journal) => journal.id)),
    );
    if (!['not-due', 'queued', 'resolved'].includes(String(active.scriptedEncounter)))
      throw new SaveExportError('Save has invalid scripted encounter state');
    if (active.signalStartedAt !== undefined)
      finite(active.signalStartedAt, 'story signal start', 0);
    if (active.objectivesCompleted !== undefined)
      uniqueStrings(
        active.objectivesCompleted,
        'story objectives',
        new Set(expedition.requiredObjectives ?? []),
      );
  }
  if (story.ending !== undefined) validateEnding(story.ending);
}

/** The first published expedition shape is still accepted by StoryDirector.restore. */
function validateLegacyStory(story: Record<string, unknown>): void {
  if (
    story.chapterId !== 'wreck-one' ||
    !LEGACY_STORY_PHASES.has(String(story.phase)) ||
    typeof story.uniqueCollected !== 'boolean' ||
    typeof story.nextSignal !== 'boolean'
  )
    throw new SaveExportError('Save has invalid legacy story');
  if (story.arrivalDistance !== null)
    finite(story.arrivalDistance, 'legacy story arrival distance', 0);
  uniqueStrings(
    story.journalsRead,
    'legacy story journals',
    new Set(storyExpedition('wreck-one')!.journals.map((journal) => journal.id)),
  );
}

function validateWorld(value: unknown): void {
  const world = record(value, 'world');
  integer(world.chunkIndex, 'world chunk', 0);
  if (world.threatDirector !== null) validateThreat(world.threatDirector);
  if (world.story !== undefined) validateStory(world.story);
  if (world.radioRaids !== undefined) {
    const raids = record(world.radioRaids, 'radio raids');
    integer(raids.wave, 'radio raid wave', 0);
    finite(raids.remaining, 'radio raid remaining time', 0, 115);
  }
  if (world.raidRecovery !== undefined) validateRaidRecovery(world.raidRecovery);
  if (world.routeChart !== undefined) validateRouteChart(world.routeChart);
  if (world.dustFront !== undefined) validateDust(world.dustFront);
}

function validateSave(raw: unknown): SaveGameV1 {
  // The first pass enforces shape limits and cycle/prototype safety before
  // migration. Known runtime Infinity sentinels are canonicalised below; the
  // second pass rejects every other non-finite value, including opaque bags.
  inspect(raw, 0, new Set<object>(), true);
  let save: SaveGameV1;
  try {
    save = migrate(raw);
  } catch (error) {
    throw new SaveExportError(error instanceof Error ? error.message : 'Invalid save');
  }
  canonicalizeThreatDeadlines(save);
  inspect(save);
  const root = record(save, 'save');
  if (save.version !== 1) throw new SaveExportError('Save has invalid version');
  finite(save.savedAt, 'save timestamp', 0);
  nonemptyText(save.seed, 'seed');
  finite(save.distanceTraveled, 'distance traveled', 0);
  if (root.saveName !== undefined) {
    const saveName = nonemptyText(root.saveName, 'save name');
    if (!saveName.trim() || saveName.length > 80) throw new SaveExportError('Save name is invalid');
  }
  if (root.profile !== undefined && root.profile !== 'story' && root.profile !== 'survival')
    throw new SaveExportError('Save has invalid campaign profile');
  validatePlayer(save.player);
  validateMachine(save.machine);
  validateProgression(save.progression);
  validateWorld(save.world);
  return structuredClone(save);
}

export function validateSaveForExport(raw: unknown): SaveGameV1 {
  return validateSave(raw);
}

function nameOf(name: unknown): string {
  if (typeof name !== 'string') throw new SaveExportError('Snapshot name must be text');
  const value = name.trim();
  if (!value || value.length > 80)
    throw new SaveExportError('Snapshot name must be 1–80 characters');
  inspect(value);
  return value;
}

export const SaveExportCodec = {
  encode(name: string, save: SaveGameV1): string {
    const cleanName = nameOf(name);
    const cleanSave = validateSave(save);
    const textValue = JSON.stringify({
      format: 'machine-move-forward-save',
      formatVersion: 1,
      name: cleanName,
      save: cleanSave,
    });
    if (new TextEncoder().encode(textValue).byteLength > MAX_EXPORT_BYTES)
      throw new SaveExportError('Export is too large');
    return textValue;
  },
  decode(textValue: string): { name: string; save: SaveGameV1 } {
    if (
      typeof textValue !== 'string' ||
      new TextEncoder().encode(textValue).byteLength > MAX_EXPORT_BYTES
    )
      throw new SaveExportError('Export is too large');
    let value: unknown;
    try {
      value = JSON.parse(textValue);
    } catch {
      throw new SaveExportError('Export is not valid JSON');
    }
    inspect(value);
    const wrapper = record(value, 'export wrapper');
    if (wrapper.format !== 'machine-move-forward-save' || wrapper.formatVersion !== 1)
      throw new SaveExportError('Unsupported export format');
    return { name: nameOf(wrapper.name), save: validateSave(wrapper.save) };
  },
};

export type SaveExportV1 = {
  format: 'machine-move-forward-save';
  formatVersion: 1;
  name: string;
  save: unknown;
};
