# Signal crossfire and mech boarding

The radio found in the first salvage chest now leads new games to a repeatable combat loop. These changes are on `codex/signal-crossfire-boarders`; the published v0.2.0 trailer and release are unchanged.

## Playing the sequence

1. Recover the radio and finish the guided boarding/repair tutorial. Travel 2,200 metres after signal acquisition to reach 100% reception, shown on the HUD and radio. A loaded signal retains its acquisition distance.
2. Finish any current fight, return aboard, close crafting/inventory panels and exit the deck gun/build mode. The radio panel itself hands off automatically when reception reaches 100%.
3. The 17-second camera sequence establishes two fighting ships off the forward-right bow, moves onto the robot ship, follows the Revenant's turn and zooms into its face. Gunfire, restrained distant audio, fires, smoke and explosions accompany the pass. Hold Esc for 0.8 seconds to skip.
4. After 24 seconds of safe play, the first robot boarding skiff arrives. Further encounters wait 75–115 safe seconds after the prior fight has fully ended. Cooldowns pause during combat, construction/panels, while off the machine, or below 35% health.
5. Each ship brings two different mech archetypes. A seeded shuffle uses all four across every two encounters, with a separately randomized arrival side. The crew climb on visible powered grapple trolleys and hoist over the upper rail before landing.

The loop stops story progression here, as requested. Older saves already approaching, docked at, or departing an expedition continue their existing path. Old signal saves without an acquisition distance establish one on the next update.

## Persistence and counterplay

There is one encounter owner at a time. Ordinary deck-spawned infantry and random gunboats are suspended after the reveal. Crew are visible, targetable passengers until they land; the landed enemy retains its identity and remaining health. Destroying the hull, killing passengers, shooting the hook or cutting it remain valid defenses. A ship's retreat does not finish the encounter until landed enemies are gone.

The cinematic freezes player movement, attacks and needs while the machine and world keep moving. HUD, camera, sun shadow focus and held input restore at completion/skip. Saving waits for a safe boundary; signal origin, completed reveal, wave index and remaining raid cooldown survive reload. The older expedition paths and tutorial skiff remain supported.

## Art and verification

The set reuses the authored S-07, Revenant, Warden, Bastion and gunboat assets. Human crew carry the existing animated rifle; faction flags, armor rails, hover strips and particle effects distinguish the ships. Actors use independent skeletons and bounded reusable effect pools. No downloaded assets or new external services are required.

- [Wide shot](01-crossfire.png), [robot ship](02-robot-ship.png), [turn](03-turn.png), [face close-up](04-revenant.png), [grapple crossing](05-grapple-crossing.png).
- [Silent real-time preview](preview.mp4).
- [Browser integration evidence](visual-review.json) checks genuine 100% gating, receiver-panel handoff, camera/control/health restoration, real mech landings, health carryover, encounter completion, hook counterplay, saved cooldowns, skip cleanup and route selection in older expedition saves.
- 1,082 unit tests, lint and the production build pass. The existing large JavaScript bundle advisory remains.
- [Capture performance](performance.json) reports one local Chrome/medium-quality capture, not a hardware-independent performance guarantee.

Run Vite on port 5200, then `node tools/signal-battle-qa.mjs` for the isolated browser checks or `node tools/capture-signal-preview.mjs` to recapture the scene. Set `MMF_PORT` for another port. The capture tool uses FFmpeg; raw recordings are ignored under `assets/trailer/`.
