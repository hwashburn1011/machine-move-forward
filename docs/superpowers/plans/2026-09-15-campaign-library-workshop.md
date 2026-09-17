# Campaign library and workshop polish

Status: next bounded iteration after the live PR23 release. This work advances the 1.0 requirement that a player can safely carry a campaign from opening to Keep Walking. It does not claim that the full-game duration or release matrix is complete.

## Shared constraints

- Preserve the browser Three/Rapier runtime, current campaign rules, peaceful Meridian ending, deterministic campaign seed adoption, and old `SaveGameV1` compatibility.
- `quicksave` remains the rolling manual/autosave authority. `meridian-checkpoint` remains the recoverable ending checkpoint. User snapshots use a separate `campaign:<uuid>` namespace and never win or lose through name sorting.
- No save operation may overwrite a different user snapshot implicitly. Starting New Game must preserve the current readable quicksave first or leave the existing campaign and title state untouched.
- Imported bytes are untrusted. Bound byte size, parse depth/collection sizes, string lengths, and accepted format before migration. Migrate and validate fully in memory before the first IndexedDB write. Import always creates a new UUID slot; duplicate names receive a visible suffix.
- Boarding optimization must preserve encounter start time, roster, health, hit targets, colliders, hook/crew transitions, rewards, cleanup, and deterministic simulation. Art changes preserve gameplay footprints, repair anchors, power/cost data, and saves.

## LIB — Durable campaign library

### Frozen data and APIs

Add optional `saveName?: string` to `SaveGameV1`; absence remains valid. The IndexedDB record continues to be a migrated `SaveGameV1`, so old records and current migrations remain readable without an envelope migration.

Create a pure `SaveExportCodec` with this external shape:

```ts
interface SaveExportV1 {
  format: 'machine-move-forward-save';
  formatVersion: 1;
  name: string;
  save: unknown;
}

encode(name: string, save: SaveGameV1): string;
decode(text: string): { name: string; save: SaveGameV1 };
```

`decode` rejects malformed JSON, unknown wrapper versions, empty/oversized names, unsupported save versions, non-finite numbers, oversized text/arrays, and payloads above the fixed documented byte limit. It calls the existing migration/validation path and returns no partially trusted object.

Extend `SaveManager` narrowly:

```ts
interface SaveEntry {
  slot: string;
  name: string;
  savedAt: number;
  seed: string;
  profile: CampaignProfile;
  distanceTraveled: number;
  chapterLabel: string;
  system: boolean;
}

listEntries(): Promise<readonly SaveEntry[]>;
createSnapshot(name: string, save: SaveGameV1): Promise<string>;
preserveQuicksave(name: string): Promise<string | null>;
exportSlot(slot: string): Promise<string>;
importNew(text: string): Promise<string>;
```

`createSnapshot` and `importNew` generate `campaign:<crypto.randomUUID()>` and commit one transaction. `preserveQuicksave` returns `null` only when no readable quicksave exists; otherwise it writes a distinct snapshot and resolves only after transaction completion. It never deletes or mutates the source. `listEntries` skips corrupt records, labels old unnamed saves conservatively from known saved facts, and marks the two system slots. `latestSlot()` keeps its existing recovery behavior and must not select `campaign:*`; Continue remains the latest system recovery save. Loading a library row uses the exact selected slot.

### UI and Game integration

**Luna save worker owns:** `SaveExportCodec`, `SaveManager`, save schema/migration additions, and focused tests. It does not edit `Game` or title UI.

**Luna UI worker owns:** a new `SaveLibraryUI` view and its DOM/accessibility tests. It receives immutable rows and callbacks only: `load(slot)`, `snapshot(name)`, `export(slot)`, `import(text)`, `delete(slot)`, and `close()`.

**Root owns:** `Game`, `TitleScreen`, pause/title routing, browser download/file selection, status messages, and integration tests. Title and pause menus both expose **Campaigns**. Pause permits a named snapshot only through the existing safe-save gate. Title permits exact-slot Load, Export, Import, and explicit Delete. Delete requires an in-view confirmation naming the snapshot; system slots cannot be deleted from this view.

Before New Game, if a readable quicksave exists, show **Preserve & Start**, **Back**, and an explicit destructive **Replace Current Run** choice. Preserve & Start calls `preserveQuicksave`, waits for its committed transaction, then starts the new game. A storage failure keeps the old game/title intact. Replace Current Run is never the default/focused action.

### Acceptance

- An old unnamed quicksave and Meridian checkpoint still Continue exactly as before. A library snapshot never displaces either as Continue authority.
- Starting New Game through the default path preserves the former quicksave; the new run may overwrite `quicksave` without changing the snapshot. Both load independently with their seed, profile, story/ending, inventory, structures, damage, needs, fuel, course, route contacts, journal archive, and companion state intact.
- Snapshot names handle Unicode, trimming, duplicates, and display escaping. Concurrent double-clicks yield one committed snapshot or two distinct UUID slots, never a partial overwrite.
- Export then import into a clean browser reproduces the complete built save. Import of truncated, oversized, malformed, unsupported, or hostile-key JSON performs zero writes and shows a readable error. Import never overwrites a slot.
- IndexedDB request-success followed by transaction abort remains a failed operation. List/load/delete failure leaves the menu usable and the active in-memory campaign untouched.
- Normal keyboard/mouse browser acceptance covers title Load, pause Snapshot, Save & Quit, cold Continue, New Game preservation, JSON download/import, delete confirmation, and an old published save.

## PERF — Ordinary boarding spawn hitch

### Diagnosis before optimization

The current `VehicleScene.spawnActors` constructs up to two authored `EnemyVisual` trees plus grip/tether geometry at encounter spawn, then `cleanup` disposes them. The observed High sample recorded one frame over 50 ms during an ordinary skiff spawn, but does not by itself assign the stall to a particular constructor, shader compile, collider, or GC operation.

**Luna performance worker owns:** a deterministic instrumentation harness and read-only counters around `VehicleScene.spawnActors`, `EnemyVisual` construction, grip geometry construction, collider creation, first render, cleanup, and the next GC-sensitive encounter. It first reproduces the hitch with actual ordinary rosters after the normal warmup.

If construction is confirmed, implement a bounded `BoardingCrewVisualPool` owned by `VehicleScene`: at most two presentation slots for each of the four shipped mech types, created and GPU-warmed behind the existing boot/menu warmup. Encounter spawn borrows the exact roster visuals, resets animation/presentation transforms, and attaches them to seats. Cleanup hides/detaches and returns them; only `VehicleScene.dispose` disposes pooled visuals. Create grip/tether geometry once and share it across the two live passenger wrappers, disposing it once with the scene. Pool exhaustion falls back safely without changing the encounter.

If profiling instead identifies collider or shader work, freeze the measured cause before changing the implementation; do not add a pool that leaves the measured stall intact.

**Root owns:** Game warmup timing, renderer measurements, and final browser performance evidence. No GPU compile is introduced during live combat merely to populate the pool.

### Acceptance

- Compare the same-process, same-quality, same-seed ordinary boarding sequence before/after at 60 Hz with identical roster, health, phase timestamps, landing positions, colliders, damage events, rewards, and terminal cleanup.
- Warmed High and Medium samples report spawn-frame, p95/p99, frames over 33/50 ms, renderer programs, geometry/textures, bodies/colliders, and heap where available. The ordinary spawn no longer creates authored crew trees or per-encounter grip geometry when the pool is ready.
- One hundred spawn/resolve/reset cycles keep scene children, pooled leases, bodies/colliders, materials, geometries, programs, and event subscriptions bounded. Death, hook cut, hull kill, load/new game, quality change, and disposal leave no visible or leased passenger.
- Existing tutorial procedural crew and all four authored ordinary roster identities remain visually and mechanically correct.

## ART — Authored engine and service machinery

### Scope

Root audits the remaining plain industrial-box visuals in the core engine/service area and selects only measured weak silhouettes. The bounded kit may replace the core engine housing and existing repairable service panels; it does not add a subsystem, recipe, resource, collider footprint, or interaction.

**Root owns:** Blender source, deterministic export script, GLB, registry/cache mapping, runtime integration, screenshots, GPU review, and any collider/anchor change justified by measured source bounds.

**Luna fixture worker owns:** read-only comparison tests for each selected object: gameplay ID, grid/deck footprint, fallback/authored bounds, collider boxes, repair/interaction anchor, aisle clearance for the radius-0.34 capsule, borrowed-material ownership, and fallback behavior. It does not author art or change gameplay data.

Keep the current piece/subsystem IDs, costs, mass, power behavior, health/armor, save state, damage/refund rules, repair pricing, and targeting radius. Borrow cache-owned geometry/materials consistently with the current authored kits. Procedural fallback remains readable when models fail or simpler visuals are chosen.

### Acceptance

- Side-by-side source renders and in-game full-art/fallback captures name every replaced object and show distinct engine, fuel/power, and repair functions without blocking the cabin, stairs, radio, galley, caretaker, or upper-deck firing lanes.
- A normal-input player can approach, damage, repair, relocate/demolish where currently allowed, save/load, and walk all existing service routes. Interaction IDs and repair costs match the pre-art baseline.
- Blender source, scripted export, GLB validation, manifest registration, array-palette/material ownership, and disposal tests pass. One hundred load/reset cycles remain bounded.
- Representative warmed deck, galley, engine, and eight-enemy samples show no material performance regression. Claims stay limited to measured hardware/settings.

## Delivery order

1. Freeze and test the pure save codec/manager behavior and the boarding hitch diagnosis in parallel; root measures the art candidates.
2. Root integrates Campaigns/New Game preservation while the UI worker builds the callback-only library view. Run corrupt/import/transaction tests before browser file handling.
3. Implement only the measured boarding remedy, then complete authored machinery and combined lifecycle/performance acceptance.
4. Release only after full tests, lint, production build, old-save loading, normal-input save-library flow, exact boarding parity, resource-owner soak, and visual/performance review pass. These tasks improve campaign safety and moment-to-moment quality; they do not establish the roadmap's unverified 8–15-hour duration by themselves.
