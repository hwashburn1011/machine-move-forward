# Home, salvage risk and dust-front execution tasks

Status: implementation and local acceptance complete. See the
[delivery record](../../campaign/home-weather-delivery.md) for evidence.

## HOME

- **HOME-01 — Pure HomeLife rules — complete.** Same-room enclosed chair plus
  table/rug eligibility; active-E toggle; exact 2 raw HP/s; interruption and
  reset cases covered.
- **HOME-02 — Health integration — complete.** Game applies only through
  `PlayerStats.heal`, preserving 2 HP/s nourished and 1 HP/s hungry behavior,
  and restores weapon presentation on terminal paths.
- **HOME-03 — Shelf persistence — complete.** BuildSystem round-trips `{factId}`
  on shelves, preserves relocation, validates current known facts, and leaves
  Story/Progression/resources untouched.
- **HOME-04 — UI/art integration — complete.** Chair and shelf use the normal
  interaction and menu/pointer-lock paths. Furnishings borrow the retained art
  cache. No sit pose or camera takeover is claimed.

Browser coverage exercised a real sealed room, W movement and damage
cancellation, active E, hungry healing cap, roof demolition, real shelf UI
selection and save/load. Fire, panel and build cancellation are unit coverage.

## DUST

- **DUST-01 — Pure director — complete.** First runway 600 m; phases 35/70/20
  seconds; 10-second rise and 20-second clearing; seeded later spacing
  1800–2400 m; validated saves and equivalent one-second integration at 60 and
  144 Hz. Full phase-boundary equivalence at 30/60/144 Hz is not yet claimed.
- **DUST-02 — Needs and shelter — complete.** Exposed multiplier is
  `1 + 0.5 * intensity`; enclosed rooms retain ordinary drain; food and other
  gameplay remain unchanged.
- **DUST-03 — Atmosphere and forecast — complete.** Fog/sky uniform updates and
  bounded grit, story/pause deferral, intentional ordinary
  combat overlap, and unchanged chart runway.

Real-Game home/weather acceptance passed **13/13** checks with authored models
and **12/12** in the no-model fallback.

## SALVAGE RISK

- **RISK-01 — RouteChart choice — complete.** Secure/broadcast/defended modes,
  legacy auto-secure, claim block, 48/6 success and 24/2 failure.
- **RISK-02 — Exact restore/conservation — complete.** Duplicate operations,
  broadcast downgrade, abort, and defended partial saves including 0/6, 20/4,
  48/0 and 0/0 preserve exact legal amounts.
- **RISK-03 — Optional skiff ownership — complete.** One port skiff, opposite
  gangway closure, save/depart/claim block, generic payout and radio-wave skip,
  normal kill loot, death fallback and ticket cleanup.
- **RISK-04 — UI and real encounter — complete.** UI states secure 24/2 versus
  defended total 48/6 before confirmation and allows broadcast only aboard.

Real-Game salvage acceptance passed **13/13** checks, including actual secure
and broadcast UI, hull damage and spawned boarder deaths, partial defended save/load,
nonoptional payout isolation and death downgrade.

## Release gates

- High and Medium performance and dust resource bounds: complete; 100-cycle
  shelf soaks retain identical warmed renderer and physics counts.
- Final full unit suite, TypeScript, lint and production build: complete,
  1,403 tests across 153 files.
- Merge/publish and perform the public smoke check without changing validated
  reward, timing or save contracts.

The release record must distinguish unit tests, fixtures and real input/physics
coverage. It must not claim a new chapter, currency, enemy, sit animation, time
skip, passive comfort meter or finale combat.
