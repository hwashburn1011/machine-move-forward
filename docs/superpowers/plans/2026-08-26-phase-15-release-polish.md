# Phase 15 — Release Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the finished game into a releasable 1.0: full menu flow,
in-world onboarding, settings and accessibility, performance hardening,
save-format lockdown, the licensing decision, a music pass, and an
itch.io-shaped deploy.

**Architecture:** Deepen the Phase 2 title screen into a real menu system
(settings, rebinding, credits) backed by a device-local settings store;
replace debug-key knowledge with contextual in-world onboarding driven by the
same event bus the HUD already listens to; lock the save schema at a final
version with a migration sweep; ship `dist/` as a static zip with a relative
base path.

**Tech Stack:** TypeScript, Vite static build, DOM UI (existing HUD pattern:
cached writes, CSS files per panel), localStorage for settings, IndexedDB for
saves (unchanged).

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Act V,
Phase 15)

**Status:** PROVISIONAL — requires redesign pass after Act IV and Phase 14
ship. Tasks are feature-level; file paths are indicative. The release
checklist (Task 10) is the durable part of this document.

**Depends on:** Phase 2 (title screen it deepens), Phase 14 (credits, ending,
storyComplete in the schema), and everything else being feature-complete.

## Global Constraints

- The machine never moves; fixed 60Hz simulation; typed event bus; stats in
  `src/data/`.
- Art/audio sourcing per `ASSETS.md`: CC0 preferred, CC-BY recorded,
  synthesised audio is the default and the fallback, loaders never reject.
- 60 FPS target, 30 FPS minimum acceptable (handoff §39).
- **1.0 definition of done:** a new player with no instructions can start,
  learn by playing, follow the story to the end in roughly 8–15 hours, and
  keep playing after.

## Design decisions

- **Settings are device-local** (localStorage), not part of the IndexedDB
  save: volumes, quality tier, FOV, motion/camera-shake toggles, caption
  toggle, key bindings. Saves remain about the world, settings about the
  machine the game runs on.
- **Onboarding is contextual, not a tutorial level.** The first 20 minutes
  already have a designed rhythm (opening → first calm → first salvage →
  first build → first contact). Onboarding attaches short prompts to the
  first occurrence of each event (`build:placed`, first reel catch, first
  threat warning...) and never blocks play. Completed prompts persist in the
  save so a reload doesn't re-teach.
- **Debug keys get gated, not deleted.** F1/F2 quicksave/quickload stay
  player-facing; F3–F10 move behind `?debug=1` (and stay available to the
  harnesses, which already pass query params).
- **Captions cover telegraphs, not dialogue.** The audio cues that carry
  gameplay information (threat warning, all-clear, boarding hook, damage
  alarm) get on-HUD text equivalents — the HUD already prints boarding
  alerts, so this extends an existing pattern.
- **Music: synthesised first, per `ASSETS.md`.** The engine drone and
  director stingers already exist. The pass adds calm-phase ambient beds and
  combat intensity layers via `SoundBank` recipes. If synthesis cannot be
  made to read, CC0 tracks (OpenGameArt, FreePD) are the alternative — the
  tradeoff is real: files bring licence bookkeeping, download weight, a
  loading state, and a decode path the synth route doesn't have.

## Open questions (recommended defaults)

- Difficulty options? — default: single tuned difficulty plus an "assist"
  toggle (reduced incoming damage) in settings; no full difficulty matrix
  for 1.0.
- Localisation? — default: English only for 1.0; keep strings gathered but
  don't build a system.
- Where does 1.0 live? — default: itch.io static upload; the build is a
  plain static site, so adding another host later is a copy.
- Quicksave keys in 1.0? — default: keep F1/F2, list them in the controls
  screen.

## Asset needs

| Need | Source (by name) | Licence rule | Note |
| --- | --- | --- | --- |
| Music (ambient + combat layers) | Synthesised via `SoundBank` first; else CC0 from OpenGameArt / FreePD | CC0; CC-BY recorded in `ASSETS.md` | See design decision above |
| Replacement player model | KayKit Adventurers (Kay Lousberg, CC0) — already identified in `ASSETS.md` | CC0 | Resolves the Mixamo question, Task 7 |
| Title/menu art | Live 3D scene from Phase 2; DOM/CSS chrome | — | No new sourcing |
| Icon/cover for itch.io page | Screenshot via `tools/shoot.mjs` + text | — | Produced, not sourced |

## File structure (indicative)

- Create: `src/ui/SettingsUI.ts` + `settings.css`, `src/ui/ControlsUI.ts`
- Create: `src/core/settings/SettingsStore.ts` (localStorage, versioned)
- Create: `src/core/input/Keymap.ts` (rebindable action→key map; input layer
  reads actions, not raw codes)
- Create: `src/ui/OnboardingUI.ts` + `src/game/Onboarding.ts` (event-driven
  prompt scheduler; state in save)
- Modify: `src/save/SaveSchema.ts` — final version lock, onboarding state
- Modify: `src/core/debug/` — debug-gate for F3–F10
- Modify: `vite.config.ts` — `base: './'` for itch.io's iframe hosting
- Test: unit tests per new module; migration sweep; Playwright pass over the
  menu flow

## Tasks

### Task 1: Redesign pass gate

- [ ] Re-scope this plan against the real 1.0 feature set; confirm the open
      questions' defaults with the user; turn indicative files into real
      ones.

### Task 2: Settings store and menu depth

- [ ] `SettingsStore`: versioned localStorage settings with defaults and a
      corrupt-value fallback; unit-tested.
- [ ] Settings UI on the title screen and in the pause path: master/music/SFX
      volume, quality tier (the `?quality` tiers, exposed), FOV slider,
      motion/camera-shake toggles, caption toggle, assist toggle.
- [ ] Every setting applies live and persists across boots
      (harness-checked).
- [ ] Commit per module.

### Task 3: Key rebinding

- [ ] `Keymap`: action-based input indirection, rebind UI with conflict
      detection, reset-to-defaults; persisted in `SettingsStore`.
- [ ] Controls screen lists every binding including F1/F2.
- [ ] Unit-test rebind/conflict/reset logic; commit.

### Task 4: Accessibility pass

- [ ] Captions for gameplay-critical audio cues (threat warning, all-clear,
      boarding hook, damage alarm) behind the caption toggle.
- [ ] Camera-shake and motion-effect toggles actually zero the effects.
- [ ] Text size sanity check at 1280×720 through 4K.
- [ ] Commit.

### Task 5: In-world onboarding

- [ ] `Onboarding`: event-driven first-occurrence prompts for movement,
      sprint/jump, the reel, build mode, inventory, crafting, repair,
      turrets, and the first threat warning; never blocking; dismiss on the
      taught action being performed.
- [ ] Onboarding state in the save (one migration) so prompts don't repeat.
- [ ] A fresh save sees every prompt exactly once across the first session
      (harness proof).
- [ ] Commit.

### Task 6: Debug gate

- [ ] F3–F10 and any finale/story debug actions behind `?debug=1`; F1/F2
      remain; harnesses updated to pass the flag.
- [ ] Commit.

### Task 7: Player-model licensing resolution (release blocker)

- [ ] Replace `public/models/player.glb` (Mixamo — redistribution unclear,
      flagged in `ASSETS.md`) with a CC0 rigged model — KayKit Adventurers
      is the identified candidate; `HeldItem`/`fitToCapsule`/`resolveClip`
      make this a file copy plus a test-pin update.
- [ ] Update `ASSETS.md`; delete the Mixamo caveat.
- [ ] Commit.

### Task 8: Music pass

- [ ] Calm ambient bed + combat intensity layer as `SoundBank` recipes,
      driven by threat-director phase events; volumes on the music channel.
- [ ] Evaluate against the read test; only if synthesis fails, source CC0
      tracks and record them in `ASSETS.md`.
- [ ] Commit.

### Task 9: Performance and save lockdown

- [ ] Performance sweep against 60 FPS on the reference machine and 30 FPS
      floor at low tier: draw calls, pooled allocations, load time budget;
      fix regressions found.
- [ ] First-boot quality auto-pick (existing tier heuristics, applied once,
      stored in settings).
- [ ] Save-format lockdown: bump to the final schema version, migration
      sweep test loading a fixture save from EVERY shipped version, corrupt
      save → clean error → new game path.
- [ ] Commit.

### Task 10: Release checklist and deploy

- [ ] `vite.config.ts` `base: './'`; verify `dist/` runs from `file:`-less
      static hosting and inside an itch.io iframe (pointer lock + IndexedDB
      need the iframe permissions itch provides — verify, don't assume).
- [ ] Full definition-of-done playtest: new profile, no instructions,
      opening → story end → post-game; log every stumble; fix or ticket.
- [ ] `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build` all
      green; zip `dist/`; itch.io page with cover, controls, licence
      credits.
- [ ] Tag `v1.0.0`.

## Interfaces other phases rely on

- None forward — this is the last phase of 1.0. Post-1.0 expansion inherits:
  the settings store (add keys, never repurpose), the locked save version
  (expansions migrate up from it), the debug gate, and the onboarding
  scheduler (new systems add first-occurrence prompts rather than tutorials).
