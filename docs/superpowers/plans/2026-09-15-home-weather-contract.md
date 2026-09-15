# Home, salvage risk and dust-front contract

Status: implemented and validated locally from main `0e3ddaa`.
See the [delivery record](../../campaign/home-weather-delivery.md) for final
results and the repository's PR/Pages workflow for publication state.

This iteration deepens the survival/build/chill loop. It adds no chapter,
currency, enemy archetype, time skip or finale fight. The peaceful, ambiguous
Meridian ending remains authoritative.

## Authorities

- `RoomDetector` alone decides enclosure and shelter.
- `HomeLife` owns transient maintenance state and pure eligibility.
- `PlayerStats.heal` owns health changes and applies `Needs.healScale`.
- Story and Progression own known journals and uniques. A shelf stores only
  presentation state `{ factId?: string }`.
- `RouteChart` owns optional choices and all unclaimed site rewards.
- Game's `optionalSalvageEncounterId` owns the live optional skiff transaction;
  ThreatDirector and VehicleScene retain encounter authority.
- `DustFrontDirector` owns its phase, simulation time and schedule. Needs owns
  meter drain.

No new system duplicates inventory, room, reward, story, health or clock state.

## Home maintenance

A chair works only in an actually enclosed room containing a table or rug in
that same room. The player must be alive, aboard, in range, stationary, and on
a calm deck with controls free. These facts are re-evaluated while active.

The normal interaction key beside the chair toggles maintenance on or off. S-07
stands beside the chair; there is no sitting-animation or camera promise.
Movement, fire/aim, damage or a new attack, panels, build/mounted/cinematic
control, range/target loss, a room breach or death cancels it immediately.

Maintenance requests **2 raw HP per simulation second** without skipping time.
Game calls `PlayerStats.heal`, so the existing hungry heal scale makes this 1
HP/s at zero nourishment. It grants no food, water, stamina, item, resource,
invulnerability or passive bonus. Full health produces no healing. New game,
load and disposal clear transient maintenance.

## Keepsake shelf

A shelf may display only a fact already known to the campaign: a journal in
StoryDirector's durable archive, a recovered story unique, or an existing
optional journal fact granted by Progression.

```ts
interface KeepsakeState { factId?: string }
```

BuildSystem preserves this state through relocation and save/restore. Selection
and load sanitize it against the current known-fact list; unread, unknown,
malformed and oversized IDs produce an empty shelf. Selection, clearing and
demolition cannot grant or remove the underlying fact, reward or item.

## Optional salvage

A docked salvage wreck offers:

- **Secure:** retain the original total of 24 scrap and 2 components.
- **Broadcast:** while aboard, call one existing port-side skiff. Successful
  defense changes the untouched site total to **48 scrap and 6 components**.

RouteChart stores `salvageMode?: 'secure' | 'broadcast' | 'defended'`. Absence
means undecided for a legacy contact; its first normal reward request
auto-secures. Broadcast blocks claims.

Game sets `optionalSalvageEncounterId` only after external admission, successful
`vehicleScene.spawn('port', false)` and successful RouteChart choice. The wreck
is opposite the skiff, and its gangway retracts for the fight. Saving,
departure, contact replacement, another broadcast and reward claims remain
blocked until resolution.

This ticket skips the generic skiff cache payout and `radioRaids.finished`;
actual enemy kill loot remains normal. Hook, hull, crew or defended success
resolves RouteChart once. Death marks failure but retains the ticket until the
encounter finishes; finish then aborts to secure 24/2, clears the ticket and
reopens the gangway. New game/load clears orphan tickets without payment.

RouteChart remains the only unclaimed-cargo owner. Partial inventory acceptance
leaves exact amounts at the wreck. Defended saves preserve every remaining
48/6 permutation, including values below base caps. A suspicious saved
`broadcast` normalizes to secure 24/2. Duplicate callbacks cannot add rewards.
Other skiff encounter types retain their existing payouts and progression.

## Dust fronts

| Phase | Duration | Intensity |
| --- | ---: | --- |
| Clear | distance scheduled | 0 |
| Forecast | 35 s | 0 |
| Front | 70 s | smooth 0→1 over first 10 s, then 1 |
| Clearing | 20 s | linear 1→0 |

New/invalid old saves schedule the first forecast 600 m ahead. Each later front
is seeded 1800–2400 m beyond the previous clearing at the current distance.
Seed plus monotonic sequence makes this deterministic across save/load and
frame rate. Only simulation time advances phases.

Opening/tutorial, story approach/braking/docking/route-selection, cinematics,
the ending, death and title/pause defer and freeze weather. Ordinary infantry,
skiff and gunboat combat intentionally overlaps it. Weather itself never spawns
enemies or damages health, structures, physics, speed or fuel.

Exposed hydration uses `1 + 0.5 * intensity`, reaching at most 50% extra drain.
Inside an actual enclosed RoomDetector room it remains 1. Nourishment is
unchanged. Shelter entry and room breach apply from live room state.

Fog and sky use shared uniform/state changes, and grit remains bounded. Low
quality reduces grit while retaining the visual cue. Weather does
not alter RouteChart's guaranteed 450 m runway, reachability, rewards or story
signals.

## Validation boundary

Focused tests cover HomeLife rates/gates, shelf sanitation/persistence,
deterministic weather/save behavior, Needs scaling, RouteChart choice and exact
defended partial reloads.

Real-Game browser acceptance passed **13/13 authored-model home/weather checks**
and **12/12 no-model checks**, plus **13/13 salvage checks**. Home/weather
browser coverage exercised W movement cancellation, damage cancellation,
active-E control, real shelf UI selection and save/load, hungry healing cap,
live room shelter, paused weather freeze, old-save rejection and roof
demolition. Fire, panel and build cancellation are unit-tested rather than
claimed as browser input coverage. Salvage browser coverage exercised vehicle
callbacks, hull damage and actual spawned boarder deaths, generic-payout/radio isolation, partial 48 scrap
acceptance with 6 components retained through save/load, and death fallback.
All 1,403 unit tests, lint, TypeScript and the production build passed. High and
Medium performance samples and 100-cycle shelf soaks are in the delivery record.
