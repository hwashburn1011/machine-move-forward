# Roof detail and stable floor panels — October 2, 2026

The preceding machine-space/audio iteration is complete at runtime `f9bdad6ea812eb4be20fb281e85337106a207a0a0a73d44ac55c7c8659544bbe`, with 36 suites, 59 native views and sixteen performance workloads. Its report remains frozen. The player subsequently supplied a Relay Foundry screenshot, requested higher purposeful roofs or visibly torn remnants, and reported flashing primarily on the Nomad's floor panels and the visitable buildings.

## Intended result

Enclosed working buildings have credible overhead shelter with useful headroom, supported framing, seams, panel thickness and restrained material variation. A missing roof reads as damage through retained bent sheets, torn edges and exposed supporting structure. Places whose function needs open sky remain open.

Floor panels remain stable while standing, walking and moving the camera. Remove coincident visible surfaces and repair layering at its source. Preserve permanent deck elevations, actual support, stairs, rails, doors, docking approaches and existing player construction. A player-built floor over a permanent deck must have coherent seated geometry rather than share its exact visible surface.

## Work and ownership

- Machine/floor agent: reproduce bare-machine and constructed-floor flicker, audit overlapping native slabs, repair source geometry and per-instance floor presentation where needed, verify walking/support and old saves. Own native moving-camera floor evidence.
- Architecture agent: refine Relay Foundry roof and selected analogous enclosed locations, including the Foundry's shallow floor-cassette layering; preserve authoring masters, materials, working machinery and story markers. Coordinate roof collision and headroom.
- Independent review agent: inspect floor layers and rendering settings across all visitable sites, report concrete omissions and regression risks.
- Root: coordinate imports and native render work, integrate remaining site fixes and tests, review before/after evidence, compile the machine, run affected correctness/performance checks, and record limits.

## Evidence and acceptance

1. Save the supplied reference and exact baseline. `test-results/roof-floor/before.zip` contains 682 files (runtime, tests, recipes, compiled machine, floor geometry, targeted authored buildings and textures), with hashes in `before.json`. Edited Blender masters receive individual backups before overwrite.
2. Record the issue before changing geometry: bare port connectors and transfer landings on three decks, a constructed plate over the native deck versus an exterior extension, and site floors including Relay Foundry. Use shallow camera angles, nearby/midrange views, frozen simulation, and actual walking.
3. Quantify duplicate or near-coplanar floor areas using actual transformed geometry. Verify that the repaired floor coverage still includes required walkable surfaces and excludes stair openings. Keep ordinary LOD, shadows, quality and depth settings unless evidence identifies a specific defect in them.
4. Inspect roof support, torn panel edges, surface variation, headroom and collision in native views, including from player height. Check story interaction locations and combat/arrival paths after changes.
5. Compare moving-camera sequences and full-size frames after the fixes. Use isolated saves. Run meaningful affected tests, then measure native rendering with code and assets frozen and no competing Blender jobs.
6. Retain failures and corrected diagnostic setups. Report what was inspected and measured without claiming human acceptance or universal driver/hardware coverage.

## Initial evidence

The Foundry source intentionally leaves its overhead gantry open. The floor audit found authored native port strips, bypass connectors and transfer landings covering common regions, plus constructed floor tops at the same elevation as permanent deck slabs. Foundry cassettes sit only about 2.5 mm above their foundation with bevels crossing it. These are specific hypotheses to reproduce and correct; additional site inspection remains in progress.

## Completion

Completed at source `65a30803dde2ff8c862ab586b7aaebb339eba306005a474041c2c6acf97a987c`. The [delivery guide](../../godot-port/roofs-and-stable-floors.md) and [frozen report](../../godot-port/results/roofs-floor-stability-2026-10-02.json) record 19 passing suite runs, ten paired motion clips, four real-input walking clips, seventeen roof/lettering views and nine passing performance workloads. Initial failures, source backups and the superseded intermediate capture revision remain separate. Windows packaging is the next iteration; it must not rewrite this evidence.
