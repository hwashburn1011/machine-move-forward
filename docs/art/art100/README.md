# Art 100 — native V1 art iteration

This iteration delivers **100 complete model assemblies: 59 new and 41 refined**, integrated into the native Godot game. The count excludes individual components, texture variants, hidden rig widgets, and duplicate placements. Six entries are refinements of complete existing characters, including their fitted equipment; they are not six new enemy behaviors.

| Collection | New | Refined | Runtime use |
| --- | ---: | ---: | --- |
| Desert vehicles and utilities | 0 | 25 | Replaces matching streamed scenery prototypes |
| Wasteland landmarks | 15 | 10 | Adds themed roadside variety and refines existing landmarks |
| Machine furnishings | 25 | 0 | Buildable cosmetic pieces in Decorations |
| Story equipment and robots | 19 | 6 | Receiving berth, expedition sites, existing character appearances |
| **Total** | **59** | **41** | **100 assemblies** |

## Review the work

- [Searchable model catalog](index.html): individual renders, dimensions, triangle counts, runtime use, editable sources, and robot before/rear views.
- [All 100 models in one image](overview.jpg).
- Detailed sheets: [desert refinements](collection-1.jpg), [wasteland](collection-2.jpg), [furnishings](collection-3.jpg), [story and robots](collection-4.jpg).
- [Blender review gallery](../../../assets/art100/Art100Review.blend): numbered collections, native metre scale, six complete rigged characters, and five review cameras.
- [Gallery count and source-hash audit](../../../assets/art100/gallery-audit.json).
- [Model inventory](../../../assets/art100/catalog.json).

The review gallery is open in the connected Blender session. Its previous scene was saved separately as `assets/art100/MCP-session-before-Art100.blend`. The gallery groups runtime assemblies for review; the linked collection masters retain editable component geometry.

## What changed

The desert pass replaces rough surfaces and unsupported details with restrained material wear, manufactured edge bevels, correct shading, connected wheel webs, hinge-aligned doors, tank-walkway supports, fitted grilles, and readable service hardware. New landmarks include a buried transformer, pipeline valve, scrap press, crawler wreck, checkpoint gate, rail switch, shelter, and condenser. The seeded route now draws from 75 landmark types without increasing the established chunk density or consuming gameplay randomness.

The 25 furnishings use a consistent palette of enamel, steel, rubber, canvas, ceramic, and subdued safety ochre. They include a chart desk, repair trestle, field chair, sleeping berth, radio cabinet, drawers, service cart, washstand, cable reel, and carried-memories board. These are cosmetic pieces with real material costs, movement, cutter removal, undo, and native save support. Their names do not imply new crafting, radio, sleeping, or charging mechanics.

Story equipment replaces primitive presentations at the receiving berth and supplies selected earlier expedition sites. The new seed propagation bench, reservoirs, receiving consoles, archive equipment, and communication masts retain existing interactions and progression. Visible plants, power lights, and policy indicators follow the saved finale state. All six character refinements retain their established skeletons, animations, combat roles, and movement capsules.

## Scale and physical quality

Source assemblies use metre dimensions and grounded origins. Review checks include connected detail supports, normal/tangent validity, runtime material filtering, true rotated route bounds, and native idle/walk/attack poses for the complete characters.

Buildable furnishings use compound collision shapes that preserve kneespace and openings. Placement and movement test those shapes against existing machine equipment, excluding only the moving piece, its same-level supporting floors, and a 10 cm bottom contact band. Solid legacy stations also reject overlap with an installed furnishing. A memory board can no longer be placed through the starter generator.

Story fixtures have physical collision appropriate to their visible shapes: separate round seed cups, open cup gaps, cylindrical reservoirs and rims, thin antenna stems, and supported bases. Replaced primitive meshes and their duplicate collision are retired. Desert landmarks remain scenery outside the supported platform areas; this pass does not make the radioactive ground an explorable surface.

## Editable sources and reproducibility

| Collection | Blender source | Build tools |
| --- | --- | --- |
| Desert refinements | [Art100_DesertRefinement.blend](../../../assets/art100/legacy/Art100_DesertRefinement.blend) | `tools/art/art100_legacy/` |
| Wasteland | [art100-wasteland.blend](../../../assets/art100/wasteland/art100-wasteland.blend) | `tools/art/art100_wasteland/` |
| Furnishings | [NomadFurnishings.blend](../../../assets/art100/machine/NomadFurnishings.blend) | `tools/art/art100_machine/` |
| Story equipment | [StoryRobots-editable.blend](../../../assets/art100/story-robots/StoryRobots-editable.blend) | `tools/art/art100_story_robots/` |
| Complete character review | [CompleteCharacterAssemblies.blend](../../../assets/art100/story-robots/CompleteCharacterAssemblies.blend) | Same story/robot tool directory |

The four runtime packages are `godot/art/art100-{legacy,wasteland,machine,story-robots}.glb`. Original asset sources are retained. The machine's compiled scene and crane collision bake were regenerated against the integrated sources.

`tools/art/art100_gallery.py` rebuilds the Blender gallery. `tools/art/art100_catalog.py` rebuilds the HTML catalog and rendered inventory sheets. `godot/tests/art100_review.gd` captures actual native materials, six legal furnishing placements, and three streamed route views.

## Verification and scope

The [acceptance report](../../godot-port/results/art100-2026-10-01.json) records **3,067 passing checks across 20 suites**, with one unchanged runtime source fingerprint throughout. All four runtime packages have zero glTF errors or warnings. The report also records package hashes and native rendering evidence. The rendered review uses an RTX 3070 at 1600 × 1000: median frame intervals were 16.66–16.67 ms across three static route views, with 27 streamed chunks. These samples are useful for spotting a large rendering regression; they are not a complete gameplay performance benchmark.

The catalog's model links, assets, dimensions, inventory counts, and JavaScript syntax were checked locally. Interactive browser review was unavailable because the browser tool rejects local file URLs. The individual model renders, contact sheets, native captures, and Blender gallery were reviewed directly.

This completes the requested 100-model iteration. It is an art and physical-quality milestone within V1, rather than a declaration that the entire beta is finished.
