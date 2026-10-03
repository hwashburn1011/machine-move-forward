# Grounded sites and roadside outposts

This iteration extends the destination buildings into the desert and adds occasional hostile watch towers along the normal journey. Acceptance and the rebuilt Windows beta are complete. This iteration was accepted at `0.3.0-beta.1-9ea7a59eeeb3`. The later UI refinement is `0.3.0-beta.1-0fb0ae4c02b9`; earlier ZIPs remain historical candidates.

## Buildings

The five main destinations, ordinary optional stops, survivor locations, equipment recovery platforms, mission variants and final receiving berth now share an explicit grounding contract. Their upper floors, interaction anchors and docking heights stay at their established positions. Lower architecture reflects the building's purpose: workshops have lower service floors, industrial sites have transfer frames and plant rooms, and inhabited places have enclosed storeys.

Continuous foundations extend below the dune field's conservative minimum height. Local grade collars are seated using the same deterministic height function as the rendered terrain, in world coordinates. These assemblies are created once; they do not stretch or rebuild as the machine passes. The opening rooftop and distant city already have tall building shells, so they receive buried base extensions instead of duplicate lower buildings.

The editable Blender master and its generation recipe live under `assets/site-grounding` and `tools/art/site_grounding`. `MMFSiteGrounding` connects the shared authored assemblies to the production destination paths.

## Watch towers

The first scheduled watch is a solo robot about 520â€“680 metres along the journey. Later slots are roughly 1.25 kilometres apart, with seeded variation and one or two guards. Protected encounters, docking and recovery can skip slots, so that spacing is not a guaranteed attack interval. Towers appear ahead of the machine and have an elevated firing platform with real structural supports and terrain-seated feet.

There is no warning pop-up or alarm. Guard movement, weapon sounds and tracers identify the threat. Player shots use the ordinary weapon collision and damage path. Distant watch towers do not become boarding threats or hold a destination's departure lock. Their individual health and consumed schedule slots survive saving and loading; late discovery skips an already-near tower rather than producing a close ambush.

Placement checks the actual seeded landscape envelopes and avoids approaching destinations. That work is spread across physics frames. Title preparation warms the guard's rig, fitted equipment and finish materials before travel. Defeated guards settle inside their platform rails, and their seated poses survive reloads. Sampled concrete feet and pile extensions have matching physical box collisions.

## Ranged fire

Hostile rifles now sample physical aim spread around their committed target point. Spread grows with range; close shots can still miss. The sampled direction drives both the visible tracer and the damage ray. A body-to-muzzle safety check prevents a barrel poking through thin cover from bypassing that cover.

Ship artillery keeps its existing warning delay, damage and boss salvo pattern. It commits the pattern around an imperfect aim centre, checks the physical projectile path and checks blast visibility. A wall can intercept a shot and shield the player. These changes do not modify enemy health, weapon damage or existing firing cadence.

## Review and release

Acceptance evidence belongs in `test-results/site-grounding` and `test-results/roadside-outposts`. Review includes low-angle terrain contact, upper-deck return fire, lower-deck shelter, save/load, bounded streaming, prior roof/floor stability contracts and native graphics performance. Statistical aim samples describe a stationary exposed test target, not a promised in-game hit rate.

The final source passed 24 affected suites with 3,488 checks. All nine native performance workloads passed at 1920Ã—1080 High, Forward+ and 4Ã— MSAA on the RTX 3070/i9-11900KF test host. The worst 95th-percentile frame time was 7.675 ms in combat. The two-guard pass measured 4.972 ms at the 95th percentile; its normal-travel reveal frame was 7.318 ms, with 2.670 ms of assembly work. These are scripted workloads with an invulnerable test player, not minimum-hardware claims or human playtest results.

Review covered 41 grounded-building views, 11 tower/guard views and five title/settings views. Earlier roof/floor, machine/audio and progression acceptance reports remain byte-identical. The frozen [acceptance report](results/grounded-sites-outposts-2026-10-02.json) records exact source and asset identities.

The rebuilt [Windows ZIP](../../test-results/windows-beta-grounded/distribution/MachineMoveForward-0.3.0-beta.1-windows-x86_64.zip) is 945,489,027 bytes. Its packed-resource audit passed 4,450 checks. A fresh extraction passed checksum verification and normal startup using the actual exported executable. Separate new-campaign/save/reload checks passed 43 assertions using the matching Godot engine with the unchanged extracted PCK, because official export templates disable external test scripts. Those two validation scopes are recorded separately in the [release report](../../test-results/windows-beta-grounded/completion.json).

Extract the entire ZIP and run `MachineMoveForward.exe`. The owner has deferred itch.io account/project setup and will provide the destination later. No upload or publication is scheduled.

## Matching Pause and Settings housing

The Escape menu, Settings, campaign library and checkpoint selector now use a graphite Linekeeper case with recessed glass, alloy bezel, fasteners, a copper selector and rubber keys matching the authored wrist device. Their muted control theme is scoped to these pages; inventory and records retain their actual forearm screen. Decorative hardware never receives focus or intercepts input. A deferred fit after minimum-size changes keeps the first Settings open inside the glass.

The UI pass accepted 131 checks and eleven native views across four window sizes, including real clicks, slider keys, rebinding, scrolling, inventory transitions and Resume. That [Windows beta](../../test-results/windows-beta-wrist/distribution/MachineMoveForward-0.3.0-beta.1-windows-x86_64.zip) passed 4,451 packed-resource checks, standalone EXE startup and 46 separate matching-engine packed-game checks. The earlier world/performance evidence above remains unchanged; it was not rerun for this static menu-only change. [UI evidence](../../test-results/pause-frame/completion.json) and [package evidence](../../test-results/windows-beta-wrist/completion.json) record exact identities.

## Animated desert title

The main menu now frames the walking Nomad against the dunes, with warm light, a restrained camera drift and sparse distant ruins. New Game, Continue, Load Game and Settings are the primary actions; playtest checkpoints remain a smaller secondary option. Settings and Load Game keep the Linekeeper housing over the live desert. Continue resumes the current session or loads its saved journey; the empty profile disables Continue and explains the empty save list.

The title uses a separate render-only world with shared model resources, independent gait state and terrain uniforms. Campaign simulation, player transforms and saves remain untouched. Its viewport, processing and visual assemblies turn off during gameplay. Window resizing and graphics quality apply to the title; its render height is capped at 1080 pixels while the interface keeps its own resolution.

The [title acceptance](../../test-results/title-screen/completion.json) passed 714 checks, including 33 native interaction/render checks and four existing regression suites. Reviewed layouts cover 960×540, 1440×810, 1200×900 and 1920×810. In a 600-frame 1920×1080 High sample on the RTX 3070, frame time was 5.758 ms at the 95th percentile and 6.127 ms maximum. This measures the menu, not campaign performance or minimum hardware.

The new [Windows beta](../../test-results/windows-beta-title/distribution/MachineMoveForward-0.3.0-beta.1-windows-x86_64.zip), build `0.3.0-beta.1-f3995cb5c855`, passed 4,453 packed-resource checks and fresh-extraction startup using the exported executable. The unchanged extracted PCK also passed 50 New Game/Continue/save checks with the matching engine. The [package report](../../test-results/windows-beta-title/completion.json) retains those distinct validation scopes. itch.io publication remains deferred.

## Cinematic New Game opening

New Game now begins with a 22-second lead-in before the existing 10.2-second escape. Three restrained fragments show an industrial transfer hall, a gloved hand throwing a disconnect, and a machine confrontation. Black holds separate the memories. A short synthetic pursuer line leads into a rooftop view of the passing Nomad, then the existing run, jump, return fire and quiet camera handoff. Letterboxing and slow camera movement keep a consistent presentation; Escape skips directly to the normal playable deck and autosave. The fragments deliberately leave their historical meaning open.

The new editable source is `assets/opening-memory/OpeningMemory.blend`, rebuilt with `tools/art/opening_memory/build.py`. Its 228 source parts become 17 material batches and 57,788 triangles. The human hand, switch and suspended motor have separate transforms. Localized glass damage, restrained focus and muted surface wear replace large bright fracture marks. The passing machine is a render-only duplicate with independent gait and no collision; the gameplay machine never moves during this shot. Hidden cinematic assemblies stop processing after the handoff. All previous runtime art inputs remain byte-identical.

`tools/audio/opening/build.py` authors finite foley and a separate low score. Master volume, music volume and mute remain independent, and every stem pauses and releases with the cinematic. The pursuer line uses locally synthesized Microsoft David Desktop speech, processed into a restrained robotic voice and disclosed in package credits. No voice engine or voice model is distributed. Captured full-mix audio peaks at -16 dBFS. The [native video](../../test-results/opening-prelude/film/opening.mp4) includes the complete sequence and the first playable seconds; its fixed-rate capture is not a performance measurement.

The [frozen acceptance](results/cinematic-opening-2026-10-02.json) passed 1,808 checks covering title preparation, cancellation, skipping at five points, state/RNG preservation, grounded rooftop geometry, audio controls/lifetime, existing framing, campaign saves, controls and playtest checkpoints. Native views cover 16:9, 4:3 and ultrawide layouts, including Low graphics. A separate real-time 1080p High run on the RTX 3070 measured 5.820 ms at the 95th percentile and 6.619 ms at the 99th. The first fully black entry frame took 44.617 ms; the maximum after that entry was 26.552 ms. These host-specific measurements do not establish minimum hardware.

That opening iteration's [Windows beta](../../test-results/windows-beta-opening/distribution/MachineMoveForward-0.3.0-beta.1-windows-x86_64.zip), build `0.3.0-beta.1-1722c605387d`, is 949,402,227 bytes and passed 4,464 packed-resource checks. Fresh extraction verified all eight package checksums and normal boot using the exported EXE. The matching engine with the unchanged extracted PCK passed 56 further checks, including the full new opening, movement, saving and Continue. The [release evidence](../../test-results/windows-beta-opening/completion.json) keeps those scopes separate. SHA-256: `8b633ec7f95632001709659e2ea99999d05fd70980cb624f4f98530ff4a6709f`. Upload remains deferred until the owner creates an itch.io account and project.


## Opening performance refinement

Three refinement passes concentrate the memory around one physical incident: the blade unit drives the warden back against a service cart, the warden compresses at the knees with its feet planted, a worker retreats, and a cable spool clears the tray before falling and rolling away. The cart rocks around its grounded castors and the suspended motor swings from its actual trolley attachment. Held equipment follows the hands during the recoil.

The close-up now uses a shaped leather glove, twelve articulated finger joints, an opposed thumb, cuff and tapered canvas sleeve. Two fixed-length arm segments solve the elbow independently of the wrist. Reach, grip, preload, pull, settle and release have separate timing. Continuous sleeve UVs remove the patchwork artifacts from planar projection. The camera frames the arm entering from outside the shot and preserves that horizontal composition across aspect ratios. The editable Blender set now has 276 parts, exported as 52 material batches and 79,120 triangles.

On the rooftop, the pursuer line overlaps the reveal. S-07 looks toward the voice, turns toward the passing Nomad, rises and steps into the original escape starting position. Head movement leads the body turn. Clean neutral subtitles stay within the cinematic frame. Restrained contact sounds, cloth movement, footsteps and the spool landing follow the revised action; the full recording peaks at -16 dBFS. Total opening duration and the original chase remain unchanged.

The [refinement acceptance](results/cinematic-refinement-2026-10-02.json) passed 832 checks: 37 native presentation/contact/lifecycle checks and 795 affected regression checks. Review includes 29 native stills at 16:9, 4:3 and ultrawide, Low graphics, and sampled frames from a complete [native recording](../../test-results/opening-refinement/film/opening.mp4). Checks cover sleeve continuity, finger-joint clearance, tray/floor support, planted feet, state/RNG preservation, skip, sound controls, saves, and restoration of gameplay framing and poses. Only the opening set GLB and cinematic foley WAV changed among runtime art/audio inputs; previous acceptance evidence is retained.

A separate real-time full-opening sample at 1920×1080 High on the RTX 3070 measured 3.698 ms median, 5.702 ms at the 95th percentile and 6.710 ms at the 99th. The initial fully black entry frame took 42.414 ms; the maximum after entry was 9.420 ms. This is a host-specific scripted workload, not a minimum-hardware or human-playtest claim. Package verification is recorded separately under `test-results/windows-beta-opening-refined`.

The current [Windows beta](../../test-results/windows-beta-opening-refined/distribution/MachineMoveForward-0.3.0-beta.1-windows-x86_64.zip), build `0.3.0-beta.1-941f79bf1d73`, is 950,145,790 bytes. It passed 4,465 packed-resource checks, fresh-extraction checksum verification and normal startup with the actual exported EXE. The matching engine with its unchanged extracted PCK passed 56 New Game/save/Continue checks, with no warnings or errors. The [release report](../../test-results/windows-beta-opening-refined/completion.json) records these scopes separately. ZIP SHA-256: `df556168ad4fbc41cfd5fb16a21fcb6113b4d5352e7a0fd3d10ac5775cc0dd18`. Earlier ZIPs remain preserved; itch.io publication remains deferred.


## Human letter and visible pursuer arrival — 2026-10-03

New Game now opens on a worn tan page against black. Its 115-word human account from Transfer Hall 04 remains visible throughout; readable cursive ink darkens word by word over 38 seconds, with no narration. The final words hold for two seconds, followed by a five-second irregular paper burn, quiet crackling and a black transition into the factory memory. The entire opening lasts 83.7 seconds and remains skippable with Escape. The burn consumes the text and paper together, and the letter viewport stops drawing after the transition or any skip.

The revenant has a cinematic-only Blender-authored overhead wind-up, descending slash and low follow-through. S-07 follows a curved diagonal route using a forward walk and turns with its movement. A new rooftop view shows both pursuers taking the rear coping, pulling up, lifting their knees across, vaulting and landing before the original chase. Their equipment is stowed while both hands climb. The original chase positions, jump, gunshots, kills and playable landing remain unchanged. Animation sources are reproducible with `tools/art/opening_performance/build.py`; sampled bone poses add no duplicate character meshes.

The [frozen acceptance](results/opening-letter-2026-10-03.json) records 859 source checks: 45 native acting/contact/lifecycle checks, 19 native letter/layout/skip checks and 795 gameplay regressions. Rendered-pose checks verify the raised blade, downward travel, hand contact at the coping, boot clearance, movement heading and continuous chase placement. Letter layouts were reviewed at 1440×810, 1024×768, 1920×810 and 960×540. The [complete native recording](../../test-results/opening-letter/film/opening.mp4) includes the opening and three playable seconds, with captured engine audio peaking at -16 dBFS; fixed-rate movie capture is not a performance measurement.

A separate real-time run at 1920×1080 High on the RTX 3070 measured 4.009 ms median, 6.799 ms at the 95th percentile and 7.505 ms at the 99th. The sole frame above 25 ms was the initial black entry frame at 59.724 ms. This final pass ran without capture, export or other validation processes. These measurements describe this host and scripted opening, not minimum hardware or a full-game benchmark.

The [new Windows beta](../../test-results/windows-beta-letter/distribution/MachineMoveForward-0.3.0-beta.1-windows-x86_64.zip), build `0.3.0-beta.1-302c7f1a20a1`, passed 4,478 packaged-resource checks and all nine extracted checksums. The exported EXE passed normal startup; the matching engine with the unchanged extracted PCK passed 59 New Game/save/Continue checks. The [release report](../../test-results/windows-beta-letter/completion.json) retains those distinct scopes. The unmodified Marck Script font and its full SIL OFL 1.1 notice are included, with authors credited. Archive SHA-256: `5e6f4f24369012c37f84814ae3c5bcad178dff42665feb77d0a06b737216631e`. itch.io publication remains deferred to the owner.

To limit disk use, packaging shares immutable staging files with the export on the same volume. The verified MP4 replaces this pass's raw AVI, and intermediate failed-review PNGs were removed; source assets and final acceptance evidence remain.
