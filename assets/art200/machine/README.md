# Nomad / Living Archive

Twenty-five original, complete machine furnishings for the second hundred-model
iteration. Each is a distinct assembly, measured in metres, with its feet on
Godot Y=0 and a footprint contained within a two-metre deck cell. Their catalog
descriptions explicitly identify cosmetic behavior; no appliances, games,
storage, optics, or exercise simulation is implied.

The collection includes a card table, instrument bench, three-panel privacy
screen, lending cabinet, ration pantry, recliner, specimen bench, painter trolley,
return duct, sewing station, record console, typewriter desk, three-clock standard,
ceramic mural, optical observation seat, complete chess display, exercise rack,
boot-care stand, botanical bell jar, survey-scroll rack, shade awning, bagatelle
table, wash drum, guarded floor fan, and arrival bell.

## Authoring and runtime

- `NomadLivingArchive.blend` is the editable, unjoined Blender master. Controls,
  handles, brackets, fabric, lettering, and supporting components remain separate.
- `../../../tools/art/art200_machine/build.py` recreates all meshes, baked PBR
  textures, the master, runtime GLB, collision manifest, and catalog definitions.
- `../../../godot/art/art200-machine.glb` batches by shared material, with no more
  than eight batches per furnishing. No unnecessary tangent stream is exported.
- The shared `../palette.json` provides fourteen muted color families. Albedo PNGs
  preserve those exact sRGB values with fine grain; metal shows at small, localized
  handled-panel corner nicks. The collection contains no emissive materials.
- `manifest.json` contains the stable `nomad2-*` IDs, honest descriptions, purchase
  costs, weights, color families, dimensions, and compound collision boxes.
- `../../../godot/scripts/art200_decor.gd` provides `PIECES`, `apply(data)`,
  `runtime_contract(runtime)`, `model(id)`, and `clear_cache()`. Shared game hooks
  are coordinated by the integration owner.
- The recliner uses actual rotated collision boxes (`rotX`) for its canvas back
  and diagonal support legs. Table kneespace and frame openings stay open.

## Review and reproduction

Run Blender 5.1 with `--background --threads 4 --python
tools/art/art200_machine/build.py -- --render`. For selected images, use
`--render-only=nomad2-card-table,nomad2-folding-lounge`. Then run
`python tools/art/art200_machine/contact_sheet.py` and
`node tools/art/art200_machine/validate.mjs`.

All twenty-five `.png` images are actual rendered geometry. Five contact sheets
allow a complete first visual review. Initial-review fixes include the sewing
drive pulley, real spacebar linkages, sculpted boot last, differentiated chess
pieces, laundry cradle, fan guard bridges, and supported labels. This first pass
is separate from the requested later collection-wide review and second fine-comb.

`validation.json` records glTF validation, budgets, grounding, footprint, and solid
collision metadata checks. `support-gap-screen.json` checks both individual part
separation and connected groups back to a grounded component using conservative
mesh bounds and a 12 mm contact tolerance. It complements visual review, rather
than claiming exact mesh-intersection verification. The final first-review screen
has no isolated parts or unsupported groups across all twenty-five assemblies.
`godot/tests/art200_decor.gd` checks actual physics,
translated/rotated placement, deck support, the inclined lounge surface normal,
clear under-seat space, costs, idempotent catalog registration, and all twenty-five
IDs through the real native save schema. Native execution after the coordinated
Godot asset import is recorded in `native-tests.log`.

## First full refinement

`phase2-review.json` records all fifty old and new furnishing assemblies. The new
twenty-five received individual joint, seam or graphics work in `refine_pass.py`,
including connected book retainers, brush ferrules, clock identities, key legends,
optical collars, lid hinges, a canopy hub and bell gussets. Every new render was
regenerated and inspected. The phase-two export contains 151,667 triangles in
7,809,588 bytes and passes the glTF and grounded support checks. The
coordinated-import native suite passes
757 checks with zero failures or resource leak output, including real probes of
rotated lounge clearance, its open knee space, quarter turns and self-exclusion.

## Second independent fine-comb

Completed on 2026-10-02, separately from the first refinement. The independent
reviewer examined every old and new furniture master and final render, using a
stricter 4 mm component support screen. Small real mounting hardware now supports
the oscilloscope and knobs, microscope drawer unit and upper dumbbells. Individual
clock faces have retained backing mounts, and small raised labels sit against
their intended surfaces. Collapsed faces were removed without welding useful
surfaces or changing the compound collision definitions.

The final new collection has 150,363 triangles in 7,797,712 bytes, with at most
eight material batches per model. Khronos validation reports zero errors and
warnings. Across both fifty-model furniture collections, the independent final
geometry screen reports zero unsupported groups, nonfinite vertices or degenerate
faces. All changed renders and ten contact sheets were refreshed. The separate
reviewer closed every finding in `../fine-comb/machine-review.json`; evaluated
measurements and the preserved pre-fix audit are alongside that report.

`fine_comb.py` is shared by both furniture builders and reproduces the second
finishing pass. `finish_fine_comb.py` applies it to an existing editable master,
updates manifests and GLB, and rerenders only affected assemblies. The earlier
native suite results above precede these geometry-only finishing changes; final
whole-game regression and performance checks are coordinated by the integration
owner.
