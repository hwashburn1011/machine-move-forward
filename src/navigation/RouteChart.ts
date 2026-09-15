import { hashSeed, Rng } from '@/core/math/Random';
import type { ItemId } from '@/data/items';

export const ROUTE_CONTACT_INTERVAL_M = 700;
export const ROUTE_CONTACT_RUNWAY_M = 450;
export const ROUTE_CONTACT_WINDOW_M = 180;
export const ROUTE_HISTORY_LIMIT = 128;

export type RouteContactKind = 'water-cache' | 'salvage-wreck' | 'memorial' | 'repair-depot';
export type RouteContactState =
  'detected' | 'committed' | 'docked' | 'visited' | 'missed' | 'suspended';
export type SalvageMode = 'secure' | 'broadcast' | 'defended';

export type RouteReward =
  | { type: 'item'; itemId: 'water' | 'scrap' | 'components' | 'repair-kit'; remaining: number }
  | { type: 'journal'; factId: 'memorial-transmission'; remaining: number };

export interface RouteContact {
  id: string;
  slot: number;
  kind: RouteContactKind;
  atDistanceM: number;
  worldX: number;
  confidence: number;
  hazard: 'calm' | 'uncertain' | 'hostile';
  detectedAtM: number;
  expiresAtM: number;
  state: RouteContactState;
  rewards: RouteReward[];
  salvageMode?: SalvageMode;
  suspendedFrom?: Exclude<RouteContactState, 'suspended' | 'visited' | 'missed'>;
  suspendedRemainingM?: number;
  suspendedWindowM?: number;
}

export interface RouteChartSave {
  format: 1;
  nextSlot: number;
  discovered: string[];
  visited: string[];
  missed: string[];
  active?: RouteContact;
}

export interface RouteObservation {
  distanceM: number;
  lateralM: number;
  storyPriority: boolean;
  tier?: number;
}

export interface InterceptPreview {
  contactId: string;
  remainingM: number;
  lateralM: number;
  bearingDeg: number;
  interceptM: number;
  estimatedFuel: number;
  expiresInM: number;
  reachable: boolean;
}

export interface CommitContext {
  distanceM: number;
  lateralM: number;
  maxBearingDeg: number;
  fuelPerM: number;
  poweredHelm: boolean;
  safe: boolean;
  storyPriority: boolean;
}

export type ChartResult =
  | { ok: true; contact: RouteContact }
  | {
      ok: false;
      reason:
        'missing' | 'unavailable' | 'story-priority' | 'helm-unpowered' | 'unsafe' | 'out-of-range';
    };

export type RewardClaim =
  | { token: string; contactId: string; type: 'item'; itemId: ItemId; count: number }
  | { token: string; contactId: string; type: 'journal'; factId: string; count: 1 };
export interface RewardResolution {
  claim: RewardClaim;
  acceptedCount: number;
  completed: boolean;
}
export type SalvageChoiceResult =
  | { ok: true; mode: 'secure' | 'broadcast' }
  | { ok: false; reason: 'missing' | 'unavailable' | 'already-chosen' };

const KINDS: readonly RouteContactKind[] = ['water-cache', 'salvage-wreck', 'memorial'];
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const cloneReward = (reward: RouteReward): RouteReward => ({ ...reward });
const cloneContact = (contact: RouteContact): RouteContact => ({
  ...contact,
  rewards: contact.rewards.map(cloneReward),
});

/** Pure deterministic side-contact chart. Scene, inventory and story remain external. */
export class RouteChart {
  private active: RouteContact | null = null;
  private nextSlot = 1;
  private readonly discovered = new Set<string>();
  private readonly visited = new Set<string>();
  private readonly missed = new Set<string>();
  private inFlight: RewardClaim | null = null;
  private claimCounter = 0;
  private scheduleArmed = false;

  reset(): void {
    this.active = null;
    this.nextSlot = 1;
    this.discovered.clear();
    this.visited.clear();
    this.missed.clear();
    this.inFlight = null;
    this.claimCounter = 0;
    this.scheduleArmed = false;
  }

  get contact(): RouteContact | null {
    return this.active ? cloneContact(this.active) : null;
  }

  get snapshot(): {
    active: RouteContact | null;
    discovered: string[];
    visited: string[];
    missed: string[];
  } {
    return {
      active: this.contact,
      discovered: [...this.discovered],
      visited: [...this.visited],
      missed: [...this.missed],
    };
  }

  observe(seed: number | string, input: RouteObservation): RouteContact | null {
    if (!finite(input.distanceM) || input.distanceM < 0 || !finite(input.lateralM))
      return this.contact;
    if (input.storyPriority) {
      this.suspend(input.distanceM);
      return null;
    }
    this.resume(input.distanceM);
    if (
      this.active &&
      ['detected', 'committed'].includes(this.active.state) &&
      input.distanceM > this.active.expiresAtM
    ) {
      this.active.state = 'missed';
      addBounded(this.missed, this.active.id);
      this.nextSlot = Math.max(this.nextSlot, this.active.slot + 1);
      this.active = null;
      this.inFlight = null;
      this.scheduleArmed = false;
    }
    if (!this.active) {
      if (!this.scheduleArmed) {
        const firstWithFullRunway = Math.ceil(
          (input.distanceM + ROUTE_CONTACT_RUNWAY_M) / ROUTE_CONTACT_INTERVAL_M,
        );
        this.nextSlot = Math.max(this.nextSlot, firstWithFullRunway);
        this.scheduleArmed = true;
      }
      const atDistanceM = this.nextSlot * ROUTE_CONTACT_INTERVAL_M;
      if (input.distanceM >= atDistanceM - ROUTE_CONTACT_RUNWAY_M) {
        this.active = makeContact(
          seed,
          this.nextSlot,
          atDistanceM,
          input.lateralM,
          input.tier ?? 1,
        );
        addBounded(this.discovered, this.active.id);
        this.scheduleArmed = false;
      }
    }
    return this.contact;
  }

  preview(
    id: string,
    context: Pick<CommitContext, 'distanceM' | 'lateralM' | 'maxBearingDeg' | 'fuelPerM'>,
  ): InterceptPreview | null {
    const contact = this.active;
    if (!contact || contact.id !== id || contact.state === 'suspended') return null;
    if (
      ![context.distanceM, context.lateralM, context.maxBearingDeg, context.fuelPerM].every(finite)
    )
      return null;
    const remainingM = contact.atDistanceM - context.distanceM;
    const lateralM = contact.worldX - context.lateralM;
    const bearingDeg = (Math.atan2(lateralM, Math.max(0.001, remainingM)) * 180) / Math.PI;
    const interceptM = Math.hypot(Math.max(0, remainingM), lateralM);
    return {
      contactId: id,
      remainingM,
      lateralM,
      bearingDeg,
      interceptM,
      estimatedFuel: Math.max(0, context.fuelPerM) * interceptM,
      expiresInM: contact.expiresAtM - context.distanceM,
      reachable: remainingM >= 0 && Math.abs(bearingDeg) <= Math.max(0, context.maxBearingDeg),
    };
  }

  commit(id: string, context: CommitContext): ChartResult {
    const contact = this.active;
    if (!contact || contact.id !== id) return { ok: false, reason: 'missing' };
    if (context.storyPriority) return { ok: false, reason: 'story-priority' };
    if (!context.poweredHelm) return { ok: false, reason: 'helm-unpowered' };
    if (!context.safe) return { ok: false, reason: 'unsafe' };
    if (contact.state !== 'detected') return { ok: false, reason: 'unavailable' };
    const preview = this.preview(id, context);
    if (!preview?.reachable) return { ok: false, reason: 'out-of-range' };
    contact.state = 'committed';
    return { ok: true, contact: cloneContact(contact) };
  }

  /** Return an undocked intercept to the chart without consuming its opportunity or rewards. */
  cancelApproach(id: string): boolean {
    if (!this.active || this.active.id !== id || this.active.state !== 'committed') return false;
    this.active.state = 'detected';
    return true;
  }

  markDocked(id: string): boolean {
    if (!this.active || this.active.id !== id || this.active.state !== 'committed') return false;
    this.active.state = 'docked';
    return true;
  }

  canDepart(id: string): boolean {
    return (
      !!this.active &&
      this.active.id === id &&
      (this.active.state === 'docked' || this.active.state === 'visited')
    );
  }

  chooseSalvage(id: string, mode: 'secure' | 'broadcast'): SalvageChoiceResult {
    const contact = this.active;
    if (!contact || contact.id !== id) return { ok: false, reason: 'missing' };
    if (contact.kind !== 'salvage-wreck' || contact.state !== 'docked')
      return { ok: false, reason: 'unavailable' };
    if (contact.salvageMode) return { ok: false, reason: 'already-chosen' };
    contact.salvageMode = mode;
    return { ok: true, mode };
  }

  resolveSalvage(id: string): boolean {
    const contact = this.active;
    if (!contact || contact.id !== id || contact.kind !== 'salvage-wreck') return false;
    if (contact.salvageMode !== 'broadcast' || contact.state !== 'docked') return false;
    contact.salvageMode = 'defended';
    for (const reward of contact.rewards) {
      if (reward.type === 'item' && reward.itemId === 'scrap')
        reward.remaining = Math.max(reward.remaining, 48);
      if (reward.type === 'item' && reward.itemId === 'components')
        reward.remaining = Math.max(reward.remaining, 6);
    }
    return true;
  }

  /** A failed/abandoned fight releases only the original untouched cache. */
  abortSalvage(id: string): boolean {
    const contact = this.active;
    if (!contact || contact.id !== id || contact.salvageMode !== 'broadcast') return false;
    contact.salvageMode = 'secure';
    return true;
  }

  /** Clear a docked opportunity after Game validates that the player is aboard. */
  depart(id: string, abandonUnclaimed = false): boolean {
    if (!this.canDepart(id) || !this.active) return false;
    const hasRewards = this.active.rewards.some((reward) => reward.remaining > 0);
    if (hasRewards && !abandonUnclaimed) return false;
    addBounded(this.visited, this.active.id);
    this.nextSlot = Math.max(this.nextSlot, this.active.slot + 1);
    this.active = null;
    this.inFlight = null;
    this.scheduleArmed = false;
    return true;
  }

  requestReward(id: string): RewardClaim | null {
    if (!this.active || this.active.id !== id || this.active.state !== 'docked') return null;
    if (this.active.kind === 'salvage-wreck') {
      if (this.active.salvageMode === 'broadcast') return null;
      if (!this.active.salvageMode) this.active.salvageMode = 'secure';
    }
    if (this.inFlight) return this.inFlight.contactId === id ? { ...this.inFlight } : null;
    const index = this.active.rewards.findIndex((reward) => reward.remaining > 0);
    const reward = this.active.rewards[index];
    if (!reward) return null;
    const token = `${id}:reward:${index}:${++this.claimCounter}`;
    this.inFlight =
      reward.type === 'item'
        ? { token, contactId: id, type: 'item', itemId: reward.itemId, count: reward.remaining }
        : { token, contactId: id, type: 'journal', factId: reward.factId, count: 1 };
    return { ...this.inFlight };
  }

  resolveReward(token: string, acceptedCount: number): RewardResolution | null {
    const claim = this.inFlight;
    if (!claim || claim.token !== token || !this.active || this.active.id !== claim.contactId)
      return null;
    if (!Number.isSafeInteger(acceptedCount) || acceptedCount < 0 || acceptedCount > claim.count)
      return null;
    const parts = token.split(':');
    const rewardIndex = Number(parts.at(-2));
    const reward = this.active.rewards[rewardIndex];
    if (!reward) return null;
    if (reward.type === 'item') reward.remaining = Math.max(0, reward.remaining - acceptedCount);
    else reward.remaining = acceptedCount > 0 ? 0 : 1;
    this.inFlight = null;
    if (this.active.rewards.every((entry) => entry.remaining === 0)) {
      this.active.state = 'visited';
      addBounded(this.visited, this.active.id);
      this.nextSlot = Math.max(this.nextSlot, this.active.slot + 1);
    }
    return {
      claim: { ...claim },
      acceptedCount,
      completed: this.active.state === 'visited',
    };
  }

  toSave(): RouteChartSave {
    return {
      format: 1,
      nextSlot: this.nextSlot,
      discovered: [...this.discovered],
      visited: [...this.visited],
      missed: [...this.missed],
      ...(this.active ? { active: cloneContact(this.active) } : {}),
    };
  }

  restore(raw?: Partial<RouteChartSave> | null): void {
    this.reset();
    if (!raw || raw.format !== 1) return;
    this.nextSlot = Number.isSafeInteger(raw.nextSlot) && raw.nextSlot! > 0 ? raw.nextSlot! : 1;
    const active = validContact(raw.active);
    if (active) {
      this.active = active;
      this.nextSlot = Math.max(
        this.nextSlot,
        active.slot + (active.state === 'visited' || active.state === 'missed' ? 1 : 0),
      );
    }
    restoreIds(this.discovered, raw.discovered);
    restoreIds(this.visited, raw.visited);
    restoreIds(this.missed, raw.missed);
    if (active) addBounded(this.discovered, active.id);
    this.inFlight = null;
  }

  private suspend(distanceM: number): void {
    if (!this.active || (this.active.state !== 'detected' && this.active.state !== 'committed'))
      return;
    this.active.suspendedFrom = this.active.state;
    this.active.suspendedRemainingM = this.active.atDistanceM - distanceM;
    this.active.suspendedWindowM = this.active.expiresAtM - distanceM;
    this.active.state = 'suspended';
    this.inFlight = null;
  }

  private resume(distanceM: number): void {
    if (!this.active || this.active.state !== 'suspended') return;
    this.active.atDistanceM =
      distanceM + Math.max(0, this.active.suspendedRemainingM ?? ROUTE_CONTACT_RUNWAY_M);
    this.active.expiresAtM =
      distanceM +
      Math.max(ROUTE_CONTACT_WINDOW_M, this.active.suspendedWindowM ?? ROUTE_CONTACT_WINDOW_M);
    this.active.detectedAtM = distanceM;
    this.active.state = this.active.suspendedFrom ?? 'detected';
    delete this.active.suspendedFrom;
    delete this.active.suspendedRemainingM;
    delete this.active.suspendedWindowM;
  }
}

function makeContact(
  seed: number | string,
  slot: number,
  atDistanceM: number,
  lateralM: number,
  tier: number,
): RouteContact {
  const rng = new Rng(hashSeed(seed, 'route-chart', slot));
  const kindOffset = hashSeed(seed, 'route-chart-kind') % KINDS.length;
  const depot = (tier === 2 || tier === 3) && slot % 3 === 0;
  const kind = depot ? 'repair-depot' : KINDS[(kindOffset + slot - 1) % KINDS.length]!;
  const offset = depot
    ? rng.range(tier === 3 ? 265 : 120, tier === 3 ? 290 : 150) * (rng.next() < 0.5 ? -1 : 1)
    : rng.range(45, 70) * (rng.next() < 0.5 ? -1 : 1);
  const rewards =
    kind === 'repair-depot'
      ? [
          { type: 'item', itemId: 'repair-kit', remaining: 1 },
          { type: 'journal', factId: 'depot-linekeeper-record', remaining: 1 },
        ]
      : kind === 'water-cache'
        ? [{ type: 'item', itemId: 'water', remaining: 4 }]
        : kind === 'salvage-wreck'
          ? [
              { type: 'item', itemId: 'scrap', remaining: 24 },
              { type: 'item', itemId: 'components', remaining: 2 },
            ]
          : ([{ type: 'journal', factId: 'memorial-transmission', remaining: 1 }] as RouteReward[]);
  return {
    id: `route-contact-${slot}`,
    slot,
    kind,
    atDistanceM,
    worldX: lateralM + offset,
    confidence: 1,
    hazard:
      kind === 'repair-depot' || kind === 'water-cache'
        ? 'calm'
        : kind === 'salvage-wreck'
          ? 'hostile'
          : 'uncertain',
    detectedAtM: atDistanceM - ROUTE_CONTACT_RUNWAY_M,
    expiresAtM: atDistanceM + ROUTE_CONTACT_WINDOW_M,
    state: 'detected',
    rewards: rewards as RouteReward[],
  };
}

function validContact(value: unknown): RouteContact | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const c = value as Partial<RouteContact>;
  if (typeof c.id !== 'string' || !/^route-contact-[1-9]\d*$/.test(c.id)) return null;
  if (!Number.isSafeInteger(c.slot) || c.slot! <= 0 || c.id !== `route-contact-${c.slot}`)
    return null;
  if (!KINDS.includes(c.kind as RouteContactKind) && c.kind !== 'repair-depot') return null;
  if (![c.atDistanceM, c.worldX, c.detectedAtM, c.expiresAtM, c.confidence].every(finite))
    return null;
  if (
    c.confidence! < 0 ||
    c.confidence! > 1 ||
    !['calm', 'uncertain', 'hostile'].includes(c.hazard ?? '')
  )
    return null;
  if (c.atDistanceM! < 0 || c.detectedAtM! > c.atDistanceM! || c.expiresAtM! < c.atDistanceM!)
    return null;
  if (
    !['detected', 'committed', 'docked', 'visited', 'missed', 'suspended'].includes(c.state ?? '')
  )
    return null;
  if (c.salvageMode !== undefined && !['secure', 'broadcast', 'defended'].includes(c.salvageMode))
    return null;
  if (!Array.isArray(c.rewards) || !validRewards(c.kind!, c.rewards, c.salvageMode)) return null;
  if (c.state === 'visited' && c.rewards.some((reward) => reward.remaining !== 0)) return null;
  const contact = cloneContact(c as RouteContact);
  if (contact.kind === 'salvage-wreck') {
    if (contact.salvageMode === 'broadcast') contact.salvageMode = 'secure';
    const partialLegacy = contact.rewards.some(
      (reward) =>
        (reward.type === 'item' && reward.itemId === 'scrap' && reward.remaining < 24) ||
        (reward.type === 'item' && reward.itemId === 'components' && reward.remaining < 2),
    );
    if (
      contact.salvageMode === 'secure' ||
      (!contact.salvageMode && (contact.state === 'visited' || partialLegacy))
    ) {
      contact.salvageMode = 'secure';
      for (const reward of contact.rewards) {
        if (reward.type === 'item' && reward.itemId === 'scrap')
          reward.remaining = Math.min(reward.remaining, 24);
        if (reward.type === 'item' && reward.itemId === 'components')
          reward.remaining = Math.min(reward.remaining, 2);
      }
    }
  }
  if (contact.state === 'suspended') {
    if (
      !['detected', 'committed'].includes(contact.suspendedFrom ?? '') ||
      !finite(contact.suspendedRemainingM) ||
      !finite(contact.suspendedWindowM)
    )
      return null;
  } else {
    delete contact.suspendedFrom;
    delete contact.suspendedRemainingM;
    delete contact.suspendedWindowM;
  }
  return contact;
}

function validRewards(
  kind: RouteContactKind,
  rewards: readonly unknown[],
  salvageMode?: SalvageMode,
): rewards is RouteReward[] {
  const expected: [string, number][] =
    kind === 'repair-depot'
      ? [
          ['repair-kit', 1],
          ['depot-linekeeper-record', 1],
        ]
      : kind === 'water-cache'
        ? [['water', 4]]
        : kind === 'salvage-wreck'
          ? [
              ['scrap', salvageMode === 'defended' ? 48 : 24],
              ['components', salvageMode === 'defended' ? 6 : 2],
            ]
          : [['memorial-transmission', 1]];
  if (rewards.length !== expected.length) return false;
  return rewards.every((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const reward = value as Partial<RouteReward> & { itemId?: string; factId?: string };
    const [id, cap] = expected[index]!;
    return (
      (reward.type === 'item'
        ? reward.itemId === id
        : reward.type === 'journal' && reward.factId === id) &&
      Number.isSafeInteger(reward.remaining) &&
      reward.remaining! >= 0 &&
      reward.remaining! <= cap
    );
  });
}

function restoreIds(target: Set<string>, values: unknown): void {
  if (!Array.isArray(values)) return;
  for (const id of values)
    if (typeof id === 'string' && /^route-contact-[1-9]\d*$/.test(id)) addBounded(target, id);
}

function addBounded(target: Set<string>, id: string): void {
  target.delete(id);
  target.add(id);
  while (target.size > ROUTE_HISTORY_LIMIT) {
    const oldest = target.values().next().value as string | undefined;
    if (oldest === undefined) break;
    target.delete(oldest);
  }
}
