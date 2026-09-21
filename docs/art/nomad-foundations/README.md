# Nomad foundation art pass

Original Blender work, 21 September 2026. The shipped renderer remains Three.js.
Blender 5.1 authored the models; the running Blender MCP service rendered separate
review scenes without replacing the reference Nomad master. No downloaded models,
paid generators, or new external art licences are required.

## Delivered assets

| Runtime asset | Triangles | Visual work |
| --- | ---: | --- |
| salvage-chest | 9,640 | Freight silhouette, protected corners, latches, tow eye, CARGO / REEL RECOVER markings and amber strips. |
| fuel-canister | 4,252 | Pressed ribs, handle, filler cap, original chipped ochre enamel PBR maps, FUEL marking. |
| generator-refined | 9,820 | Insulated enclosure, separate reservoir, protected line, labelled fill port, live fuel gauge and power lamp. |
| salvaged-radio | 7,736 | Receiver pedestal, replacement-module socket, scanning bar, service label and antenna. |
| wrist-terminal | 2,068 | Forearm housing, straps, recessed screen and protected keys. |
| workbench-refined | 10,420 | Bolted frame, parts shelf, drawer, cutting mat, vice and sorted sockets. |
| refinery-refined | 12,464 | Hopper/grate, supported exhaust with inlet coupling, inspection panel, component drawer and clear function labels. |
| storage-refined | 8,064 | Gasketed lid, corner protection, toggle locks, side grips and onboard-inventory marking. |
| iron-nomad-playable | 233,191 | 14 x 18 m core, 16 x 20 m walking perimeter, 3.6 m floor spacing, 24-tread stairs with stringers/handrails, lifted equipment and anchors. Four-leg hierarchy and walking animation retained. |

All eight small props have embedded textures and five to nine materials. Runtime
files are about 1.4–2.4 MB each, with textures capped at 512 pixels for this close
prop set. Repeated hardware is merged by material while status/interaction groups
retain names. No additional shadow-casting dynamic lamps were introduced.
The cleaned Nomad game file is 17.2 MB; its separate triangle shell is 11.8 MB.
The source and full export retain additional editing detail.

## Whole-machine review inventory

| Family | Decision and evidence |
| --- | --- |
| Communications/navigation | New scanner and live module/progress groups. Existing helm's gauge/controls, navigation displays and masts retained after component review; physical helm action remains. |
| Fuel/propulsion | New carried can, generator, fill assembly and gauge. Existing detailed drive core, turbine, leg hatches, furnaces and piping retained; assemblies and semantic anchors follow the new floor heights. |
| Workshop/storage | New bench, refinery and storage chest replace the older ambiguous box silhouettes. Shared runtime piece IDs, inventory contents, costs, collision envelopes and placement ownership remain authoritative. |
| Galley/growing | Existing stove burners, condenser coils, planter and seed-garden fill/crop groups reviewed and retained. They already identify their purpose and use the same ivory/steel palette. |
| Collection/defense | Existing winch, reel drum, forged hook, manual gun and automatic turret components reviewed and retained. Their moving pivots, targeting arcs and existing state lamps are preserved. |
| Robotics | L-12's charging pad/contacts and tracked body reviewed with the fieldwork kit; retained. Live dock/power/ownership still govern remote configuration. |
| Construction | Added authored floor sections, supported stairs and guards. Fallback construction retains bevelled plate edges and matching 3.6 m links. Four collision strips per floor guarantee continuous perimeter support. |
| Furnishings/decor | Existing chair, desk, rug, shelf and keepsake fixtures reviewed individually; retained to avoid adding passage clutter. |
| Built-in machinery | Hull partitions, beams, rails and spanning cables were expanded structurally. Pumps, pressure vessels, lockers and control hardware move as rigid equipment rather than being stretched. |

Review PNGs in this directory include isolated new props and exploded component
views for retained families. Exploded sheets intentionally separate pivots and
status groups; the game reassembles them at their original local transforms.
Eye-level in-game captures and traversal results are recorded by
`tools/campaign/nomad-foundations-qa.mjs` in the ignored test-results directory.
Representative captures are retained here:
[expanded machine](in-game-exterior.png), [stairs](in-game-stairs.png) and
[terminal at 140% text](in-game-terminal-140.png).

## Runtime contracts

- Machine dimensions and decks are sourced from the v2 profile; build/navigation
  cells stay on the 14 x 18 m core. The wider ring is walkable without adding grid
  nodes on railings.
- Structural collision is exported separately; decks, ramps, perimeter strips
  and service housings have explicit runtime ownership to avoid coincident shells.
- Scanner hardware gets a toggleable hull-driven collider and a reserved footprint.
  It appears with the recovered receiver; it is not an invisible startup obstacle.
- Generator gauge and scanner progress read actual tank/scanner state. Emissive
  accents identify function; they do not invent production or repair state.
- Small station exports replace presentation only. Existing station colliders,
  IDs, health, storage and production buffers remain unchanged.
- Radioactive sand is excluded using valid support anchors and rendered terrain
  height, with recovery before contact.

## Rebuild and validation

1. Background Blender: `tools/art/nomad_foundations/build.py`.
2. Node: `tools/art/nomad_foundations/optimize.mjs`.
3. Blender MCP: `review_mcp.py` and `review_onboard_mcp.py`.
4. Background Blender: `tools/art/iron_nomad/prepare_runtime.py`; clean and optimize
   the generated game/full exports with the existing Iron Nomad scripts.
5. Node: `tools/art/nomad_foundations/validate.mjs`.

Editable source: `assets/nomad-foundations/source/NomadFoundations.blend`.
Layout source: `assets/iron-nomad/gameplay/source/IronNomad_Master.blend`.
Untouched reference: `assets/iron-nomad/source/IronNomad_Master.blend`.

The ten delivered GLBs passed Khronos validation with **zero errors and zero
warnings**, embedded resources, finite transforms and the four required hip roots.
Detailed measurements and machine-readable validation are in
`assets/nomad-foundations/model-report.json`, `optimization.json`, and
`gltf-validation.json`. Browser checks are not a guarantee of 60 FPS on every PC.
