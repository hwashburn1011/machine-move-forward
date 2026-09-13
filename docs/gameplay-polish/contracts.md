# Integration contracts

This records ownership and invariants before the first code handoffs. Concrete
module APIs are reviewed with their owners and recorded below when delivered.

- Game remains the sole owner of simulation order, combat mode transitions,
  encounter eligibility and saved campaign state. Input/catalog callbacks queue
  intent; they do not run physics, award loot or directly mutate the scene.
- World axes are Three.js Y-up. Grid coordinates are machine-local and include
  levels -2..2. Build targeting transforms camera/chest into the actual build
  group's coordinate space; the current machine pose is not ignored.
- Build preview validity is advisory. A command checks current reach, LOS,
  resources/support/occupancy and threat guard again at commit.
- Build access threat projection, raid eligibility and save safety are separate.
  Only the build-mode/catalog exemption is removed from radio raid eligibility.
- Input contexts resolve physical key/button state; movement survives a placement
  interruption, while fire/aim/use/place/demolish require a new press after release.
- Catalog cursor -> threat -> paused Resume is atomic before another world step.
  Successful pointer lock (or explicit harness bypass) precedes unpause.
- Device relocation retains instance identity and containers. It does not invoke
  removal/placement reward paths, heal, refund, reset production or erase claims.
- Presentation observes authoritative weapon/AI clocks. New clips do not drive
  damage, reload completion, attack readiness, movement or loot.
- S-07 player firing keeps the camera ray. Enemy firing retains original mixer
  timing and original muzzle path via a separate bone-only original hierarchy;
  new cosmetic poses feed visual flashes/tracers only.
- Root owns public model promotion; original clips and source files remain
  available until deterministic and visual checks pass.
- UI modules accept readonly view models and callbacks. They do not pull global
  Game state; labels are supplied from the active binding registry.
- New preferences preserve existing volume, ambience and quality. Legacy saves
  remain compatible, and preview/session state never becomes persistent geometry.

## S-07 animation contract

Keep existing clip names and `S07_Rig`, `WeaponSocket` and bones intact. Added
clips are `armed_walk_fwd/back/left/right`, `armed_run_fwd/back/left/right`,
`armed_crouch_walk_fwd/back/left/right`, `reload_rifle`, `reload_shotgun`.
Existing armed/unarmed idle, crouch, jump and forward clips remain fallbacks.
Blender bone names include `pelvis`, `thigh_l/r`, `calf_l/r`, `foot_l/r`,
`upperarm_l/r`, `lowerarm_l/r`, `hand_l/r`. Spine/head names are inventoried by
the authoring script rather than guessed. Clips use in-place root transforms.
Runtime blends directional clips, applies bounded upper-body aim/grip and foot
contact after the base mixer, and plays reload progress from the actual weapon.

## Mech animation contract

Keep all original `idle/walk/run/attack/death` clips and `EnemyMuzzle` unchanged.
Add `polish_attack`, `polish_hit`, `polish_death` for visual presentation. The
original clip data must survive optimization and drives the authoritative socket
hierarchy with original mixer transitions. Each new visual clip shares the old
skeleton names and dimensions. There is no extra skinned mesh or new damage zone.
