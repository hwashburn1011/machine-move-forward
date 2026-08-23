import type { GameEvents, GameEventName } from './GameEvents';

type Listener<K extends GameEventName> = (payload: GameEvents[K]) => void;
type AnyListener = (payload: never) => void;

/**
 * Typed publish/subscribe bus (handoff section 45).
 *
 * Keeps UI, audio, FX, and gameplay decoupled: systems announce what happened
 * rather than reaching into each other.
 */
export class EventBus {
  private listeners = new Map<GameEventName, Set<AnyListener>>();

  /** Subscribe. Returns a disposer — prefer it over calling `off` by hand. */
  on<K extends GameEventName>(event: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as AnyListener);
    return () => this.off(event, fn);
  }

  /** Subscribe for exactly one delivery. */
  once<K extends GameEventName>(event: K, fn: Listener<K>): () => void {
    const off = this.on(event, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off<K extends GameEventName>(event: K, fn: Listener<K>): void {
    this.listeners.get(event)?.delete(fn as AnyListener);
  }

  emit<K extends GameEventName>(event: K, payload: GameEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;

    // Iterate a snapshot: a listener may subscribe or unsubscribe mid-dispatch.
    for (const fn of [...set]) {
      try {
        (fn as Listener<K>)(payload);
      } catch (err) {
        // One bad listener must not stop the rest of the game reacting.
        console.error(`EventBus listener for "${event}" threw:`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
