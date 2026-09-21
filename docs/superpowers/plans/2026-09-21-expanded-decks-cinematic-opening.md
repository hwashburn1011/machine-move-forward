# Expanded decks and cinematic rooftop opening

Status: implemented locally; delivery checks completed on 2026-09-21.
See [delivery and verification](../../campaign/expanded-nomad-cinematic-delivery.md).
This is a follow-on to the Nomad foundation work; unrelated dirty work is preserved.

## Outcome and layout contract

Expand the v2 core by two 2 m build cells on every side: 14 × 18 m becomes
22 × 26 m. The lower and middle decks gain a continuous 2 m wraparound,
producing a 26 × 30 m envelope. The upper deck retains a 1 m rim, producing
a 24 × 28 m envelope. Floor heights remain 8.83, 12.43 and 16.03 m.

Forward/prow is local **-Z**, aft is +Z, starboard is +X, and port is -X.
The lower forward wall panels are removed; structural supports and a low
fore guard remain. The walkway stays above the radioactive sand.

| Surface | Core half extents | Walking half extents | Policy |
| --- | --- | --- | --- |
| Lower, level -2 | X 11, Z 13 | X 13, Z 15 | Core build/nav; wrap for player circulation |
| Middle, level -1 | X 11, Z 13 | X 13, Z 15 | Core build/nav; wrap for player circulation |
| Upper, level 0 | X 11, Z 13 | X 12, Z 14 | Core build/nav; rim and local stair landing for player circulation |

The profile in `src/data/iron-nomad.json` is authoritative.
`IronNomadGeometry.ts` supplies floor, ramp and guard collision.
The authored collision export excludes `Gameplay_Decks_And_Access` so the
Blender visuals cannot duplicate the runtime floor authority.
Level-aware aboard checks include the wider lower decks and stair bypass.

## Tasks and ownership

| ID | Owner | Task | Delivered |
| --- | --- | --- | --- |
| X-01 | Luna, root integration | Expand all deck bounds, physical support, build/nav cells, and exterior access. | v3 profile, lower/middle wraps, port stairs and supported bypass |
| X-02 | Luna, Sol, root | Update cargo, docking, aboard detection and save migration. | Wider cargo band, gate-derived story/optional docking, compatible v1/v2/v3 loading |
| X-03 | Astra/root | Rebuild and spread Blender structure and assemblies; regenerate art and collision. | Editable master, optimized GLB, collision, obstacles and shared solids |
| X-04 | Luna | Define deterministic opening actors and one-shot beats. | Pure timeline and event-cursor tests |
| X-05 | Luna, root integration/polish | Stage chase, leap, return fire, robot deaths, skip and control handoff. | 20-second presentation, cameras, FX, sound cues, cleanup and restore |
| X-06 | Luna, Sol, root | Re-anchor vehicle lanes, boarding, engine and leg service points. | Shared skiff lane, docking contract, leg assembly contract and repair alignment |
| X-07 | Sol, root | Review integration and verify geometry, saves, assets and cinematic. | Unit suite, browser fixtures, cold Continue, Blender and in-game visual inspection |

## Exterior access and authored content

Both external flights run from Z -3 to +3 at X -12, with 2 m width,
6 m run and 3.6 m rise. Stacking opposite-direction flights caused the
upper flight to obstruct the lower flight's headroom. Both now rise in the
same direction. A supported 2 m outside bypass connects their middle-deck
landings and preserves circulation around the lower and middle decks.
The upper landing extends locally to X -13.

Runtime ramps and Blender treads/guards consume
`src/data/iron-nomad-side-stairs.json`. The internal stairs remain the
ordinary enemy/caretaker vertical navigation route.

Spread machinery as complete assemblies rather than enlarging handles,
gauges and equipment. The delivered art moves the command house, turbine,
furnaces, crane, work benches, tanks, machinery banks, lights and four legs.
The port banner moves aft to clear the exterior stairs.
Helm, scanner, engine and leg repair coordinates follow their relocated art.

Leg hip, knee and foot assemblies share one translation per leg. The
authored IK, fallback rig and repair zones use `nomad-leg-contract.ts`;
independently scaling each joint would separate the mechanism.

Existing player structures retain their arrangement and IDs where valid.
The existing deterministic relocation/recovery process handles conflicts
with equipment and stair space. Fresh starter equipment uses reviewed cells.

## World and encounter alignment

The upper starboard gate sits at X 12. Destination roots derive from
`upperRimX - localGangwayX + gangwayHalfWidth` in `nomad-docking.ts`.
The optional dock root is 19; story roots are 19–22 depending on gangway
length. Build reservations cover the approach.

Cargo spawns at absolute lateral X 14.5–22, outside the lower/middle hull.
The reel range stays 34 m. Skiffs use the configured ±17 m lane in both
encounter motion and tutorial side selection. Supported boarding cells
remain inside the core, with grapple anchors around X ±11.
The existing ±18 m gunboat lane is retained.

The rooftop ledge is X 14.5, separated from the upper rim by 2.5 m.
During the cinematic the sun target follows the action; the shadow frustum
does not expand.

## Cinematic contract

New Game starts with presentation copies of S-07, Warden and Revenant.
Two robots chase S-07 to the rooftop ledge. S-07 jumps aboard, turns, and
shoots both pursuers while they remain on the rooftop. The two robots are
presentation actors, so their deaths do not grant loot or affect later raids.

| Time | Beat |
| --- | --- |
| 0–5.5 s | Rooftop chase |
| 5.5–7.6 s | Leap and supported upper-deck landing |
| 7.6–10.1 s | Turn and raise rifle |
| 10.1 / 10.28 s | First shot / robot death |
| 12.15 / 12.33 s | Second shot / robot death |
| 14–20 s | Pull back and blend toward normal camera |
| 20 s | Restore real player and gameplay |

The scene gates ordinary simulation, input, threats and needs while active.
Its event cursor emits each shot and death once even across irregular steps.
Camera shots frame the chase, player return fire and individual impacts.
Robot effects use sparks, smoke, recoil and death poses.

Hold Escape for one second to skip. Natural completion and skipping use the
same handoff: armed real player visible on supported deck, normal camera and
input, full initial health/ammo, machine travel and first salvage enabled.
Presentation actors, effects and camera overlay are disposed.
The rooftop recedes and is removed by the existing teardown path.

## Save compatibility

Write `iron-nomad-v3`; accept older/absent layouts.
Absent/v1 receives the prior vertical remap plus conflict relocation.
v2 receives expansion conflict relocation without another deck-height shift.
v3 retains the existing layout. Preserve inventory, fuel, structure IDs/state
and progression; do not spread a player's saved base.

The game does not save midway through the opening. Imported legacy rooftop
or landed phases normalize to done with a safe machine spawn, avoiding a
restore onto an orphaned rooftop. Continue never replays the cinematic.

## Verification boundary

The delivery record lists checks actually run. The broad regression wishlist
also includes extended human playtesting, complete both-side boarding/gunboat
encounters, automatic collection, every story site and long-session performance.
Those are not claimed as newly completed browser runs by this iteration.
Focused automated checks and the full unit suite cover the changed contracts.
