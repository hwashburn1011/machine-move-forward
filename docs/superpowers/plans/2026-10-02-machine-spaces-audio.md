# Machine spaces and quiet information — October 2, 2026

The preceding progression, personalization, and combat delivery is verified in `docs/godot-port/results/beta-next-2026-10-02.json`. This is a separate iteration responding to the player's next requests.

## Intended result

The Nomad feels like a working machine with room to make a home. Its existing equipment forms small functional groups, with open areas on all three native decks. The lower deck accepts the recovered quiet-drive, the middle deck the battery bank, and an upper outboard connection accepts the recovered freight crane. Ordinary workshops, generators, drone docks, storage, and furniture remain freely placeable, including multiple instances. Placement must preserve usable access and drone cargo clearance without moving or deleting existing player construction.

Gunfire has a restrained lower body instead of a piercing transient. Original sparse music enters occasionally, fades out, and leaves long genuine silences. Threats communicate through visible machinery and spatial mechanical sounds. Routine story and system messages are retained in the wrist terminal instead of interrupting play with warnings and banners. Actual dialogue subtitles, aimed interaction prompts, and feedback inside a menu remain useful.

## Work and ownership

1. Machine composition: retain ten purposeful existing assemblies instead of twenty-four repeated props. Preserve functional stations, stairs, paint anchors, and occupied legacy footprints. Record spatial measurements and authoring decisions in the shared machine-space data.
2. Building: support permanent interior decks, guide three major modules to compatible connections, protect access routes and the player's exit, reserve drone launch and carried-cargo landing space, and preserve old saves and safe undo. Cache route checks against layout changes.
3. Audio: author and analyze revised gunfire and three original finite musical cues, implement independent music scheduling and volume, replace abstract alarms with quiet mechanical sounds at actual actors, and remove floating combat instructions while keeping physical tells.
4. Root integration: unify local interfaces with the S–07 wrist identity, retain silent story and activity logs, remove omniscient warning calls, keep build/menu failures readable, add meaningful presentation/save tests, and integrate spatial guidance.

## Acceptance and evidence

- Inspect the three decks in native rendered views and test support, contact height, stair/landing/control access, ordinary interior furniture, exact module connections, a last-exit obstruction, doors, legacy restoration, and drone landing with carried cargo.
- Verify no unsolicited story/transmission/approach banners or warning tones; story content remains reachable and saved. Menu actions retain inline results. Old saves default safely; malformed new log data rejects atomically.
- Review the wrist, station interface, log, building guidance, and sparse deck arrangement at 1440×810 and 1200×675. Keep actual subtitles and deliberate interaction feedback.
- Analyze audio peaks/spectrum and inspect/listen to preview assets where available. Exercise silence, fades, combat interruption, pauses, mute, reload, and bounded voice counts without touching gameplay RNG.
- Run affected gameplay, save, construction, combat, and narrative suites. Capture new reports under `test-results/deck-audio`; preserve earlier verified evidence.
- Bake the native machine only after static composition settles. Run isolated native performance workloads after engine/Blender jobs have stopped, including furnished construction and active drone cargo delivery. Report hardware and fixture limits, source hashes, errors, and any unresolved failures honestly.

## Baseline

Before edits, 324 runtime and test files were archived in `test-results/deck-audio/runtime-before.zip`, with per-file hashes in `runtime-before.json`. The prior compiled machine and manifest were copied alongside them. Baseline runtime hash: `e0bf970a3209a3268cfbf459e3ed33695e2b93422a6c7c32c99fbfce06069ccb`.

## Completed verification

The implementation and scoped checks are complete at runtime hash `f9bdad6ea812eb4be20fb281e85337106a207a0a0a73d44ac55c7c8659544bbe`. The final report is `docs/godot-port/results/machine-spaces-audio-2026-10-02.json`: 36 suites / 11,391 checks, 41 alternate compiled-construction checks, 39 audio assertions, 59 native views and 16 rendering workloads. The high-detail recovered modules and D3 cable clearance were included. Prior completion evidence remains unchanged; failing diagnostic setups were preserved and corrected explicitly.

The player's subsequent roof treatment and flashing floor report begin a separate iteration after this frozen evidence snapshot. This plan does not claim full V1 or human listening/playthrough acceptance.
