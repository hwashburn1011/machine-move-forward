# Nomad campaign release — 21 September 2026

This release combines the accumulated expedition/operations/desert work, Nomad
foundations, expanded decks, Blender detail corrections, cinematic pacing and the
single-campaign menu. Earlier local-delivery notes describe their original
checkpoints; this release and the current README supersede their publication status.
The trailer remains the previously published cut.

## Player-facing changes

- Three wider decks, higher interiors, lower/middle wraparound platforms, usable
  exterior stairs and an open lower prow for cargo fishing. Art, collision,
  interactions, navigation, docking and saved construction share the updated layout.
- Refined Blender machine ladders, maintenance platforms, equipment mountings,
  cargo, fuel can, generator, scanner, storage, refinery, workbench and wrist device.
- Build/refine/craft/install scanner onboarding, then a calm powered scan. At 100%,
  a safe three-second delay starts the existing ship battle and recurring raid loop.
- A paused wrist terminal for inventory, workshop, machine operations, signal,
  records and the build catalog, with real storage/material/power requirements.
- More distinctive optional stops on connected platforms above radioactive ground,
  caretaker/operations refinements, and a richer decayed desert scenery library.
- A 10.2-second rooftop opening with real-time running and a ballistic jump,
  separated pursuers, landing recovery and two fire/ash explosions. Resident effects
  and camera prewarming remove the reproduced second-impact shader stall.
- One standard campaign: New Game no longer asks for a mode. Existing Survival
  records and JSON imports retain progress, inventory, construction and magazine
  contents while loading as Story with unlimited reserves and standard future
  encounter pacing. Existing saved threat deadlines remain intact. Save preservation,
  Continue and campaign snapshots remain available.

The separate finite-ammunition Survival preset is retired. The shared machine,
resource, food/water, building and combat systems retain their existing behavior.

## Verification

- TypeScript and production build; ESLint; 204 test files / 1,771 passing tests.
- Ten foundation/machine GLBs validated with no errors or warnings, plus the
  galley, workshop and progression art checks used by CI.
- A dedicated full-art browser check starts a campaign from the real title menu,
  writes a legacy Survival fixture, restarts Chrome, continues it, and verifies
  progress, inventory, structures, fuel, health and the partly used magazine.
  It also checks the preserve-existing-run prompt and Back behavior.
- Opening captures verify both impacts, natural handoff, three skip timings and
  restored movement. A 1440×900 medium-quality playback captured 16.7 ms median
  and 24.9 ms worst frame interval after startup, with no shader growth or changing
  light count during playback. This is an opening benchmark, not a whole-game
  performance guarantee.
- Earlier deck/collision, scanner, terminal, reel/save and cold-Continue evidence
  is recorded in the linked delivery notes. The entire multi-hour campaign was
  not replayed for this release.

Local evidence lives in ignored `test-results/main-merge-*`, `single-campaign`,
`opening-pace-release` and `opening-pace-visual`. Reproduce legacy compatibility
with `node tools/campaign/single-campaign-qa.mjs` against the preview on port 5206.
The retired finite-ammo runner was removed; the balance orchestrator now uses the
single Story campaign.

See [Nomad foundations](nomad-foundations-delivery.md),
[expanded decks](expanded-nomad-cinematic-delivery.md), and
[detail and cinematic refinement](nomad-detail-refinement.md) for implementation
and asset sources.
