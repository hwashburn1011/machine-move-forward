# Graphics v3 walker integration

This note records the runtime contract for the new modular walker export. The
existing graphics-v2 record in `docs/art/graphics-v2/README.md` remains the
authority for the earlier machine and station kit.

## Export contract

The runtime filename is `public/models/authored/machine-walker-v3.glb`.
The current editable source is `assets/blender/graphics-v3/machine-walker.blend`
and the staged source export is `assets/graphics-v3/staging/machine-walker.glb`;
the runtime promotion may rename the staged GLB without changing its roots.
`loadMachineStationVisualModels()` requests the promoted v3 export first and
falls back to the safe procedural machine when it is absent or undecodable. It
does not load the legacy v2 machine-kit beside v3: that pack still carries the
old floor-level cross-beam skin implicated in the lower-room walking report.

The exported body has these exact replacement roots:

```
MMF_HullSkin
MMF_EngineSkin
MMF_ProwSkin
MMF_DeckTrim
```

The current v3 export contains four static hip-housing roots and all 20 moving
articulated leg modules:

```
MMF_LegHousing_front-left
MMF_LegHousing_front-right
MMF_LegHousing_rear-left
MMF_LegHousing_rear-right
```

The moving roots use these exact names, one of each part for each leg:

```
MMF_WalkerLeg_<front-left|front-right|rear-left|rear-right>_<Hip|Thigh|Knee|Shin|Foot>
```

Static housings are authored at the existing hip coordinates and replace only
the procedural hip-housing mesh. The runtime keeps the existing
`leg-* / splay / thigh / knee / foot` hierarchy and applies its IK rotations
unchanged to the authored modules. Each module is in its matching local pivot
space; its root has zero local translation. A foot module's local rendered
bounds must have `minY = 0` at the pivot and extend upward to about `0.3m`.
That is the runtime contact contract: `MachineLegs` places the procedural pad
center at `FOOT_PAD.h / 2`, so the pad's bottom face, not its top face, is the
`footAt()` target. At runtime the foot group cancels its solved parent world
rotation, keeping that sole level to world-up while leaving the IK pivot at the
same `footPosition()` target through gait and body tilt.

The body export is visual only. The runtime keeps the existing 10×16m deck,
lower-room shell, stair ramp, gate, engine hitbox, repair targets, build cells,
and save/story behavior. The body GLB must not carry a physics collider or rely
on an imported collision mesh.

The six starting equipment skins use exact semantic roots:
`MMF_Equipment_generator`, `MMF_Equipment_fuel-tank`,
`MMF_Equipment_workbench`, `MMF_Equipment_crate-a`,
`MMF_Equipment_crate-b`, and `MMF_Equipment_collector`. An empty semantic
group does not replace its procedural fallback.

`Game.create()` retains the loaded walker source while `Machine` uses clones of
its scene nodes. Reapply and null only remove clones and restore fallbacks;
final `Game.dispose()` removes the machine first, then disposes this one
caller-owned walker scene's deduplicated geometry, materials, and textures.
Station and enemy model ownership remains unchanged.

## Lower-room collision fix

The lower room is level `-1`, with floor top at `HULL_BOTTOM = 0.6m` and deck
underside at `DECK_UNDERSIDE = 3.51m`. The old visual cross-members were placed
near the floor and stretched across the room, which suggested a solid obstacle
without an authoritative collider. They now sit against the ceiling and are
named `lower-room-ceiling-frame`; no authored root claims that exact opening,
so the corrected procedural frame remains visible. Its member over the stair
opening is split around the opening, as is the material-batched detail frame,
so the ramp has visual headroom as well as no decorative collider. No bounding
box was added around the stair opening or lower-room frame.

With the corrected v3 asset, the runtime hides only matching visual skins:
`engine` and `engine-exhaust-visual` under `MMF_EngineSkin`,
`plough-visual` and `prow-block-visual` under `MMF_ProwSkin`,
`static-deck-rails` and `stairwell-coaming` under `MMF_DeckTrim`, the batched
hull frame and bearing details under `MMF_HullSkin`, each authored equipment
root under its matching `MMF_Equipment_*` node, and each procedural leg segment
or hip housing when its exact named module is present. The retained procedural
visuals are the sponsons, `prow-hazard-stripe`, `ExpeditionGate`, tread lugs,
service markings, and the lower-room ceiling frame split around the stair
opening. The authoritative
deck plates, lower-room shell, engine lamp, hardpoint, expedition gate, stair,
starting equipment, and matching colliders remain procedural. With model
loading disabled, every fallback remains visible.

Any future large lower-room machinery must follow the existing pattern: add a
small authoritative collider in `MachineGeometry`, mark its occupied level -1
build cells in the machine's derived navigation/build data, and keep it clear
of the stair ramp. A visual-only module must not be treated as a solid.

## Validation

CPU/unit checks cover the ceiling-frame bounds and named authored segment
replacement while preserving leg IK. `tools/lower-room-regression.mjs` is the
focused browser regression harness. It drives the player down and back up the
ramp, checks all four lower-room walls and camera follow, checks rendered foot
contact across gait samples, and spawns a scavenger to verify a level -1
navigation route.

The final GLB was also inspected as a GLB JSON payload on CPU: 80 nodes, 34
meshes, 98,708 triangles, all four broad skin roots, six fixed equipment roots,
four static housing roots, and 20 moving segment roots. The staging manifest reports no lower-room visual
intrusions and foot module bounds of `0.0..0.3m`. Every moving segment root has
a zero local translation, so the runtime pivots do not receive a second hip or
knee offset.

The optimized v3 GLB is promoted as `public/models/authored/machine-walker-v3.glb`.
Normal browser runs use it; a failed load or `?nomodel=1` uses the safe procedural
fallback. Real-browser authored and fallback lower-room checks both pass,
including foot contact during body tilt and the complete stair route.
