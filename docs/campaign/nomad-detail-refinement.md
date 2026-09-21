# Machine detail and cinematic explosion refinement

Implementation, 2026-09-21. Included in the [combined Nomad release](nomad-release-2026-09-21.md).

The opening's two robot impacts now use an animated fireball, a brief warm
light flash, flying sparks and delayed translucent ash. The effect has soft
procedural edges and distinct expansion/fade phases, replacing the dark smoke
blob. It does not apply gameplay damage. The pacing follow-up below retimes the opening.
Skipping disposes the particles, materials and light.

## Blender machine pass

Inspected the full exterior, upper deck, both interior cutaways, underside,
bridge and furnaces through Blender MCP, then checked the exported game model.
The reference master remains unchanged; the playable master and rebuild pipeline
contain the corrections.

- Rebuilt the bridge ladder outside the roof overhang, with clear rungs,
  a transfer sill, handholds, feet and stand-off brackets. Its upper mounting
  attaches to the roof structure rather than the window glass.
- Rebuilt both furnace service ladders and added supported maintenance rings
  with guardrail openings that meet the ladder exits. Connected return pipes
  to deck couplings.
- Kept mast latticework, lookout windows, platforms and balcony rails together
  as rigid assemblies. Added dish brackets, mast foundations and anchored stays.
- Replaced offset riser collars with concentric fittings and sealed roof mounts.
- Reconnected canopy corners to anchored posts and clevises.
- Reattached locker bands/handles, drum rims, cabinet controls, lamps and vents
  to their assemblies. Grounded drums and lockers and seated the crane base.
- Kept underslung gearbox motors, fins and hoses together and added chassis
  hangers. Preserved the four articulated leg assemblies and playable stair routes.

Service ladders are visual maintenance access; this pass does not add a ladder
climbing mechanic. The exterior stairs remain the playable route between decks.

## Sources and verification

Editable source: `assets/iron-nomad/gameplay/source/IronNomad_Master.blend`.
The new `refine_service_details.py` runs inside `prepare_runtime.py` after deck
expansion. Visible GLB, collision GLB, obstacle reservations and shared-solid
bounds are regenerated together. `service-detail-report.json` records ladder
positions, landings and clearances. `inspect_refinement.py` performs the MCP review.

The final playable GLB has 254,712 triangles, 17 materials and 18,704,924 bytes.
Static collision has 143,596 triangles and 10,733,928 bytes. Compared with the
initial expanded model, visible detail rose about 9%; collision complexity fell.
No new sustained frame-rate benchmark is claimed.

Checks: TypeScript/production build, ESLint, the unit suite, and ten-model GLB
validation. Browser checks exercised both external stair flights up/down, both
bypasses, the lower prow, internal ascent and the docking gate using the actual
exported collision. Cinematic capture verified both impacts, natural handoff,
restored movement and skipping at three times, with no browser or shader errors.
Explosion lifecycle tests cover fading and resource cleanup during skip.

Evidence is under `test-results/nomad-refinement-*`, including eight Blender
views and the updated `nomad-v3-opening` browser captures. The broader campaign
and long-session performance were not replayed in full for this art pass.

## Opening pacing and hitch follow-up

The six-metre rooftop chase now takes 1.35 seconds at a steady 4.44 m/s,
with running cadence matched to actual displacement. The jump takes one second:
constant horizontal travel and a ballistic vertical arc using -22 m/s² gravity,
followed by a brief landing compression and a turn before return fire. Pursuers
keep roughly three metres of longitudinal separation, continue forward as the
hero launches, and brake at staggered positions on the roof. The full opening is
10.2 seconds instead of 20, with the same two robot defeats and gameplay handoff.

A real-time Chrome/D3D11 capture reproduced a 3,975 ms second-impact render
stall. The second flash had added another point light while the first explosion
was still alive, requiring a new lighting shader configuration. Both explosion
systems and the muzzle flash/tracer now allocate before playback. Flash lights
remain resident at zero intensity between impacts, and the actual cinematic
camera views (including the wide reveal) are rendered during preparation.
Particles and flashes reset without allocating or disposing resources mid-shot;
skip/handoff releases the entire pool. The approved orange fire/ash look remains.

At 1440×900, medium quality, a local real-time replay measured 16.7 ms median,
17.1 ms p95 and 22 ms maximum frame interval after the initial 0.3 seconds.
No shader growth or light-count changes occurred at either impact. This is a
short opening benchmark, not a general hardware performance guarantee; preparation
moves GPU setup before the sequence starts. Evidence: `test-results/opening-pace-before`,
`opening-pace-final`, and `opening-pace-visual`. The latter checks both impacts,
three skip timings, player movement after handoff, and unchanged health/ammo/fuel.

Regression tests cover jump acceleration and arrival, pursuit spacing, monotonic
one-shot events after dropped frames, animation cadence, reusable effect resources,
warmup without audio, and skip cleanup.
