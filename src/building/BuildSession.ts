export type BuildSessionState = 'closed' | 'catalog' | 'placement' | 'relocation';
export type BuildCloseReason =
  'user' | 'threat' | 'death' | 'load' | 'cinematic' | 'pause' | 'invalid';
export interface BuildSessionSnapshot {
  state: BuildSessionState;
  selectedPieceId?: string;
  selectedInstanceId?: string;
  equippedWeaponId?: string;
  demolitionHeld: boolean;
}
export type BuildCommand =
  'enter' | 'catalog' | 'place' | 'relocate' | 'rotate' | 'demolish' | 'cancel' | 'exit';
export type BuildSessionListener = (
  snapshot: BuildSessionSnapshot,
  reason?: BuildCloseReason,
) => void;

export class BuildSession {
  private snapshot: BuildSessionSnapshot = { state: 'closed', demolitionHeld: false };
  private readonly listeners = new Set<BuildSessionListener>();
  get state(): BuildSessionState {
    return this.snapshot.state;
  }
  get current(): BuildSessionSnapshot {
    return { ...this.snapshot };
  }
  subscribe(listener: BuildSessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  enter(equippedWeaponId?: string): boolean {
    if (this.snapshot.state !== 'closed') return false;
    this.snapshot = { state: 'catalog', equippedWeaponId, demolitionHeld: false };
    this.emit();
    return true;
  }
  openCatalog(): boolean {
    if (this.snapshot.state === 'closed') return false;
    const { equippedWeaponId } = this.snapshot;
    this.snapshot = { state: 'catalog', equippedWeaponId, demolitionHeld: false };
    this.emit();
    return true;
  }
  selectPiece(selectedPieceId: string): boolean {
    if (this.snapshot.state === 'closed') return false;
    const { equippedWeaponId } = this.snapshot;
    this.snapshot = {
      state: 'placement',
      selectedPieceId,
      equippedWeaponId,
      demolitionHeld: false,
    };
    this.emit();
    return true;
  }
  beginRelocation(selectedInstanceId: string): boolean {
    if (this.snapshot.state === 'closed') return false;
    const { equippedWeaponId } = this.snapshot;
    this.snapshot = {
      state: 'relocation',
      selectedInstanceId,
      equippedWeaponId,
      demolitionHeld: false,
    };
    this.emit();
    return true;
  }
  canAccept(command: BuildCommand): boolean {
    if (this.snapshot.state === 'closed') return command === 'enter';
    if (command === 'enter') return false;
    if (command === 'place' || command === 'demolish') return this.snapshot.state === 'placement';
    if (command === 'relocate') return this.snapshot.state === 'relocation';
    return true;
  }
  setDemolitionHeld(held: boolean): void {
    if (this.snapshot.demolitionHeld !== held) {
      this.snapshot = { ...this.snapshot, demolitionHeld: held };
      this.emit();
    }
  }
  cancel(reason: BuildCloseReason = 'user'): void {
    if (this.snapshot.state === 'closed') return;
    this.snapshot = { state: 'closed', demolitionHeld: false };
    this.emit(reason);
  }
  exit(reason: BuildCloseReason = 'user'): void {
    this.cancel(reason);
  }
  private emit(reason?: BuildCloseReason): void {
    const copy = this.current;
    for (const listener of this.listeners) listener(copy, reason);
  }
}
