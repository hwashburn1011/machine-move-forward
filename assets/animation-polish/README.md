# Gameplay animation polish

Editable Blender 5.1 sources and original project animation, derived from the
existing S-07 and four mech masters. No downloaded or paid assets were introduced.
The supplied gunner/mech references remain the visual design source; this pass
retains their existing modeled armor, cloth, weapons, colors and surface detail.

## Delivered motion

- S-07: forward, backward, left and right clips for armed walk, run and crouch;
  rifle and shotgun reload hand motions. Directional clips share a cycle and
  match visual cadence to movement speed. Reload progress follows the existing
  weapon clock and overrides only upper-body transforms.
- Bastion, Warden, Revenant and Sovereign: separate recoil/strike, bounded upper
  body hit reaction and held death poses. The blade attack starts at contact and
  recovers to guard so the existing immediate damage event is preserved.
- Runtime foot contact uses a two-bone visual solve, boot-sole clearance, bounded
  ankle tilt and stance weights. Swing feet remain free. It does not move the
  player capsule or change stair movement.

## Preserved contracts

The promotion script appends animation accessors to the original runtime GLB.
Original geometry, material/texture definitions, node transforms, skins, socket
nodes, animation definitions and the complete original binary buffer stay exact.
Triangle counts and texture resolution are unchanged. An invisible bone-only
copy of the original enemy pose supplies combat muzzle queries; the new rendered
pose supplies tracer presentation. No second character mesh is rendered.

| Runtime file | Original bytes | Final bytes | Added bytes |
| --- | ---: | ---: | ---: |
| s07-player.glb | 5,887,692 | 6,223,472 | 335,780 |
| bastion.glb | 3,939,144 | 4,033,660 | 94,516 |
| warden.glb | 4,861,652 | 4,957,504 | 95,852 |
| revenant.glb | 3,467,912 | 3,564,696 | 96,784 |
| sovereign.glb | 4,682,464 | 4,763,588 | 81,124 |

All five exports pass glTF validation with zero errors. The S-07 file retains
seven existing skin/attribute warnings; the enemy files have none. Machine,
scenery, collision geometry and texture files were not replaced by this pass.

## Reproduce

Set `MMF_ORIGINAL_ROOT` to a checkout of commit `1cf3835` with its original models.
Do not append into an already appended GLB. From the repository root, for each
of `s07`, `bastion`, `warden`, `revenant`, and `sovereign`:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/animation_polish/build.py -- s07
node tools/art/animation_polish/append_clips.mjs s07
```

Then run `node tools/art/animation_polish/validate.mjs` and promote the reviewed
files from `optimized/` to `public/models/authored/`. Raw/optimized GLB duplicates
are ignored by Git; `.blend` sources, manifests, append reports and final runtime
GLBs are retained. Review scripts use the running Blender MCP at port 9876 and
append a separate review scene, preserving the user's loaded scene.

`review/` contains Blender stills and actual PlayerVisual/EnemyVisual captures.
The in-game acceptance and performance evidence is in
[docs/gameplay-polish](../../docs/gameplay-polish/README.md).

## Limits

Reloads are weapon-specific hand/arm motions, not detachable magazine objects.
Foot correction is bounded to small stair/contact adjustments, not ragdoll or
whole-body terrain locomotion. Corpses use authored animation and the unchanged
retirement clock. Rear armor and cloth remain the existing weighted meshes.
