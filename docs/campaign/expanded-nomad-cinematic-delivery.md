# Expanded Nomad and cinematic opening delivery

Implemented on 2026-09-21; included in the [combined Nomad release](nomad-release-2026-09-21.md).
This follows [Nomad foundations](nomad-foundations-delivery.md).

## Playable changes

- Every deck core grew from 14 × 18 m to 22 × 26 m: two additional 2 m tiles
  in each direction. The established 3.6 m floor spacing is retained.
- Lower and middle decks have full 2 m wraparound platforms, making their
  envelope 26 × 30 m. The upper deck has a 24 × 28 m rim and a local stair landing.
- Lower forward wall panels are removed for cargo fishing. Structure and a low
  guard remain above the radioactive ground.
- Two usable port-side stair flights connect all three decks. Their outside
  bypass keeps the lower/middle perimeter routes connected.
- Equipment, structural art and four leg assemblies are spread across the
  larger machine. Helm, scanner, engine, repair points, docking and boarding
  follow the new positions.
- New Game plays a 10.2-second cinematic after the pacing refinement: two robots chase S-07 from the roof;
  S-07 jumps aboard, turns and destroys the pursuers, then control returns.
  Hold Escape for one second to skip.
- Continue preserves the campaign and bypasses the cinematic. Imported old
  opening saves are normalized to a safe aboard state.

No new chapters, rewards or combat-balance changes are introduced here.
The lower/middle perimeter and exterior stairs are player circulation;
ordinary enemy/caretaker navigation still uses the internal core stairs.

## Sources and rebuild contracts

Editable source: `assets/iron-nomad/gameplay/source/IronNomad_Master.blend`.
The original reference master remains unchanged.
`prepare_runtime.py` derives the playable master from that reference;
`expand_decks.py` spreads rigid assemblies and `build_deck_access.py`
rebuilds plates, treads, landings, guards and supports.

Art/runtime share the Nomad profile and side-stair JSON contract.
The runtime owns walkable floor, ramp and guard collision; exported triangle
collision owns the remaining authored shell. The derived export manifest
identifies `iron-nomad-collision.glb` as canonical collision, without stale
reference-sized coarse proxies.

The optimized playable model is 17,795,592 bytes, 233,717 triangles and
17 materials. The collision mesh is 11,068,488 bytes and 147,448 triangles.
This is a model complexity report, not a new 60 FPS performance benchmark.

## Verification performed

| Check | Result |
| --- | --- |
| TypeScript / production build | Pass; existing large-bundle warning remains |
| ESLint | Pass |
| Full unit suite, two workers | 203 files / 1,765 tests passed |
| GLB validation | Ten current machine/foundation assets, zero errors or warnings |
| Browser layout fixture, actual exported collision | Both external flights up/down, both outside bypasses, open lower prow, internal ascent and gate crossing passed |
| Browser cinematic fixture | Natural finish, single shot/death cues, unchanged health/ammo, restored movement and skip at 0/9/15 s passed |
| Cold browser Continue | Nondefault seed, scanner progress, fuel, distance, crate identity and exact stored contents preserved |
| Lower-deck manual reel fixture | Successful cargo retrieval from both sides, no stuck hook; player remained aboard |
| Imported v2 rooftop fixture | Migrated to v3, opening done, safe aboard spawn, inventory and fuel preserved |
| Visual inspection | Blender MCP review and in-game deck, stair, chase, leap, shot, impact and handoff captures |

The manual reel fixture positions cargo at controlled reachable points; it
does not measure natural spawn pacing. Browser layout tests use real physics
capsules, while camera capture is deterministic. These checks do not replace
a human assessment of cinematic timing, sound or long-session play feel.
No fresh comprehensive campaign, gunboat, all-sites or frame-rate benchmark
is claimed here.

Reproducible browser scripts, run serially against the production preview:

```powershell
node tools/campaign/nomad-v3-layout-qa.mjs
node tools/campaign/nomad-v3-opening-qa.mjs
node tools/campaign/nomad-v3-reel-save-qa.mjs
$env:MMF_QA_OUT='test-results/nomad-v3-continue'
node tools/campaign/nomad-continue-qa.mjs
```

They default to port 5206 and accept `MMF_PORT`. Reports and screenshots are
under `test-results/nomad-v3-*`; generated QA output is not source content.
The implementation/task record is
[expanded decks and opening](../superpowers/plans/2026-09-21-expanded-decks-cinematic-opening.md).
