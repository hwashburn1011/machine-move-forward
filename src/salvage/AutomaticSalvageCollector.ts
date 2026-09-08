import type { ItemId, ItemStack } from '@/data/items';
import { ITEMS } from '@/data/items';
import { Container } from '@/items/Container';
import type { SalvageClaimOwner } from './SalvageField';

export type CollectorState = 'idle' | 'claiming' | 'latched' | 'cooldown' | 'unpowered';
export interface CollectorTarget {
  id: string;
  position: { x: number; y: number; z: number };
}
export interface CollectorSave {
  state?: CollectorState;
  slots?: (ItemStack | null)[];
  cooldown?: number;
}
export interface AutomaticSalvageCollectorCallbacks {
  getPosition(): { x: number; y: number; z: number };
  getTargets(): readonly CollectorTarget[];
  claim(id: string, owner: SalvageClaimOwner): boolean;
  release(id: string, owner: SalvageClaimOwner): boolean;
  isClaimAlive?(id: string, owner: SalvageClaimOwner): boolean;
  pullClaimed(
    dt: number,
    id: string,
    owner: SalvageClaimOwner,
    toward: { x: number; y: number; z: number },
  ): boolean;
  transferContents(
    id: string,
    deposit: (itemId: ItemId, count: number) => number,
  ): { opened: boolean; remaining: readonly ItemStack[] };
  isPowered(): boolean;
  onState?(state: CollectorState): void;
}

export const COLLECTOR_SCAN_RANGE = 32;
export const COLLECTOR_PULL_SPEED = 12;
export const COLLECTOR_RESET_SECONDS = 4;
export const COLLECTOR_BUFFER_SLOTS = 6;

export class AutomaticSalvageCollector {
  readonly owner: SalvageClaimOwner;
  private stateValue: CollectorState = 'idle';
  private claimId: string | null = null;
  private cooldown = 0;
  private readonly buffer: Container;
  constructor(
    readonly instanceId: string,
    private readonly callbacks: AutomaticSalvageCollectorCallbacks,
    bufferOrSaved?: Container | CollectorSave,
    saved?: CollectorSave,
  ) {
    this.owner = `collector:${instanceId}`;
    this.buffer =
      bufferOrSaved instanceof Container ? bufferOrSaved : new Container(COLLECTOR_BUFFER_SLOTS);
    if (!(bufferOrSaved instanceof Container && saved === undefined))
      this.restore(bufferOrSaved instanceof Container ? saved : bufferOrSaved);
  }
  get state(): CollectorState {
    return this.stateValue;
  }
  get targetId(): string | null {
    return this.claimId;
  }
  get slots(): readonly (ItemStack | null)[] {
    return this.buffer.serialise();
  }
  get bufferFull(): boolean {
    return this.buffer.isFull();
  }
  get bufferedCount(): number {
    return this.buffer.slots.reduce((n, s) => n + (s?.count ?? 0), 0);
  }
  toSave(): CollectorSave {
    return { slots: this.buffer.serialise() };
  }
  restore(saved?: CollectorSave): void {
    this.releaseClaim();
    // Cooldown is presentation/transient state; a read-only save never
    // restores it, so loading cannot grant an artificial pause or shot edge.
    this.cooldown = 0;
    this.buffer.clear();
    for (const stack of saved?.slots ?? []) {
      if (
        !stack ||
        !Object.prototype.hasOwnProperty.call(ITEMS, stack.itemId) ||
        !Number.isInteger(stack.count) ||
        stack.count <= 0
      )
        continue;
      // Container owns stack caps and slot selection. Invalid excess is
      // intentionally discarded at the restore boundary rather than merged
      // into another slot or resurrected as a second reward.
      this.buffer.add(stack.itemId, Math.min(stack.count, ITEMS[stack.itemId].stackSize));
    }
    this.stateValue = 'idle';
    this.emitState();
  }
  reset(): void {
    this.releaseClaim();
    this.buffer.clear();
    this.cooldown = 0;
    this.stateValue = 'idle';
    this.emitState();
  }
  dispose(): void {
    this.releaseClaim();
  }
  update(dt: number): void {
    const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
    if (!this.callbacks.isPowered()) {
      this.releaseClaim();
      this.stateValue = 'unpowered';
      this.emitState();
      return;
    }
    if (this.stateValue === 'unpowered') this.stateValue = 'idle';
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - step);
      this.stateValue = this.cooldown > 0 ? 'cooldown' : 'idle';
      this.emitState();
      return;
    }
    if (this.claimId === null) {
      if (this.bufferFull) {
        this.stateValue = 'latched';
        this.emitState();
        return;
      }
      const p = this.callbacks.getPosition();
      const targets = this.callbacks
        .getTargets()
        .map((t) => ({
          t,
          d: Math.hypot(t.position.x - p.x, t.position.y - p.y, t.position.z - p.z),
        }))
        .filter((x) => x.d <= COLLECTOR_SCAN_RANGE)
        .sort((a, b) => a.d - b.d || a.t.id.localeCompare(b.t.id));
      const target = targets.find((x) => this.callbacks.claim(x.t.id, this.owner))?.t;
      if (!target) {
        this.stateValue = 'idle';
        this.emitState();
        return;
      }
      this.claimId = target.id;
      this.stateValue = 'claiming';
      this.emitState();
    }
    if (this.claimId !== null) {
      if (this.callbacks.isClaimAlive && !this.callbacks.isClaimAlive(this.claimId, this.owner)) {
        this.releaseClaim();
        this.stateValue = 'idle';
        this.emitState();
        return;
      }
      const arrived = this.callbacks.pullClaimed(
        step,
        this.claimId,
        this.owner,
        this.callbacks.getPosition(),
      );
      if (arrived) {
        this.stateValue = 'latched';
        this.emitState();
        const result = this.callbacks.transferContents(this.claimId, (itemId, count) =>
          this.deposit(itemId, count),
        );
        if (result.opened) {
          if (result.remaining.length === 0) {
            this.callbacks.release(this.claimId, this.owner);
            this.claimId = null;
            this.cooldown = COLLECTOR_RESET_SECONDS;
            this.stateValue = 'cooldown';
          }
        }
        this.emitState();
      }
    }
  }
  private deposit(itemId: ItemId, count: number): number {
    return this.buffer.add(itemId, count);
  }
  private releaseClaim(): void {
    if (this.claimId !== null) this.callbacks.release(this.claimId, this.owner);
    this.claimId = null;
  }
  private emitState(): void {
    this.callbacks.onState?.(this.stateValue);
  }
}
