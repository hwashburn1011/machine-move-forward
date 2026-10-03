# Objectives and first-hour guidance

Status, 2026-09-28: **implemented; automated/native review passed, human acceptance pending**. Owner: lead, with independent construction/UI and expedition review. Parent: [five-priority delivery plan](2026-09-27-five-priority-delivery-plan.md). S/M/L denotes relative scope, not a delivery-time promise.

## Baseline behavior and specific gaps (before implementation)

`godot/scripts/session.gd::objective()` supplies a single text objective. It also changes refinery/workbench facts while rendering and still has a fallback referring to the old wrist Signal page. `journey.gd` already supplies chapter briefs, saved transmission history, load recaps, once-only messages, optional reminders after 120 seconds, and briefing quiet periods. `main.gd::interaction_target()` already resolves physical interaction priority and remapped prompts. `terminal_pages.gd` locates installed parts, and `workshop_guide.gd` already projects a supported construction route at the rooftop workshop.

Extend these systems with semantic task state, a useful destination marker and a material pin. Do not introduce another quest progression owner or undo completed milestones when equipment is damaged or removed.

## Decisions for implementation

- Show one active guidance target and one material pin. A player-selected pin takes precedence over the suggested task pin; it does not change the story objective.
- Guidance is informational. The personal wrist may display a checklist and recovered records; crafting, machine research, storage access and equipment operation remain at their physical stations. A pin must never become a remote Craft/Install/Refuel action.
- Markers default to enabled for a fresh profile and can be disabled in Settings. Tutorial reminders remain separately optional. Saved settings already present must be preserved.
- A proposed read-only `MMFObjectiveGuide` derives `{id, action, target_kind, target_id, deck, requirements, blocked_reason, completion_key}` from authoritative session/activity state. Stable IDs are for logic; text is presentation. Final names freeze at C02.
- Rendering must not mutate facts, inventory, timers or progression. Move any necessary historical fact updates into actual transactions/restore reconciliation without changing their meaning.
- Resolve an installed, healthy and reachable target on the current machine/site. Show deck and distance. For another deck, indicate the verified stair/gangway transition rather than an arrow through a floor or radioactive sand. When no safe path is known, show the target's deck and an explicit location hint; do not invent a navigable route.
- Hide or reduce markers during combat, aiming, cinematics and construction. Never cover the build target or interact prompt. Use shape/text as well as color; offer reduced motion and use remapped key labels.
- The checklist uses the same definition IDs, costs, available containers, unlocks, station health and power rules as the operation it describes. Distinguish carried fuel needed at a generator from materials available to ordinary crafting. Track counts after real transactions, including overflow and undo; never award supplies.
- Persist only a validated pin identity/type and necessary seen-hint IDs through C03. Derived counts, strings, node references and world positions are not save data. Loading resolves a valid current target or clears a stale pin without changing earned progress.

## Task board

The original acceptance criteria remain below. Current implementation dispositions:

| ID | Status and evidence |
| --- | --- |
| G01 | Technical review passed: `MMFObjectiveGuide` is a pure semantic provider; built facts are committed by transactions/restore reconciliation. All 19 checkpoint states resolve without mutating snapshots. Physical helm/receiver wording replaces obsolete wrist instructions. |
| G02 | Implemented: one depth-tested, distance-scaled marker, menu/combat/aim/build suppression, safe viewport bounds, stable target rebinding and deck/stair hints. Expedition traversal validates supported site routes; marker is a location hint, not a claimed navigation path through geometry. |
| G03 | Technical review passed: one manual recipe/build pin, authority-based costs/power/output-room checks and informational personal pack display. Pinning cannot craft, install or refuel. |
| G04 | Implemented: contextual opening tasks and useful deck-gun preparation during scanning; carried-fuel, station, power and pause reasons. Existing journal/recap and once-only radio behavior retained. |
| G05 | Native review passed: independent marker preference, remapped controls and menu priority. [21 input/layout checks](../../godot-port/results/five-priority-ui-review-2026-09-28.json) include 1440×900 and 1200×900 with large text. |
| G06 | Technical review passed: identity-only pin persistence, legacy empty default, invalid pin rejection before live mutation and no persisted world targets. |
| G07 | Technical review passed: [66 focused checks](../../godot-port/results/objective-guidance-2026-09-28.json), affected controls/checkpoint/story suites, independent native UI and real walking tests. These do not constitute an uncoached first-hour playthrough. |
| G08 | Awaiting evidence: no human pilot was available in this session; no discovery-rate or first-hour duration claim. |

| ID | Task and deliverable | Dependencies | Owner / files | Size | Acceptance |
| --- | --- | --- | --- | --- | --- |
| G01 | Audit all objective/station terminology and introduce a pure semantic objective provider; handle missing/damaged prerequisites without resetting story progress. | C01, C02 | Guidance: proposed `scripts/objective_guide.gd`; lead integrates `session.gd`, `journey.gd` | M | Every opening/chapter/checkpoint state resolves one truthful next action; destroyed refinery/workbench requests rebuilding; scanner repair points to workbench then receiver; no instruction sends the player to a wrist machine page; reading objectives is state-neutral. |
| G02 | Add one optional world target with deck-aware transitions, visible target state and safe stale-target cleanup. Reuse the installed-part locator where appropriate. | G01 | Guidance: proposed `scripts/objective_marker.gd`; lead hooks `main.gd`, `world.gd`, `campaign.gd` | M | Real walking reaches indicated equipment on each deck and a docked site; moving/demolishing equipment or departing clears/rebinds targets; occluded targets cannot look like nearby usable objects; no route crosses unsupported ground. |
| G03 | Add Pin/Unpin at recipe and construction details plus a compact personal checklist. Support ingredients, prerequisite station and relevant power reason. | G01, C02; B preview contract when available | Guidance owns checklist module; lead edits `terminal_workshop.gd`, `terminal_pages.gd`, `terminal_inventory.gd`, `ui.gd` | M | Pinning spends nothing; totals agree with real payment authority; successful crafts, transfers, full bags, damage and construction undo update correctly; only one manual pin; existing wrist/station separation retained. |
| G04 | Write contextual opening steps and interruptions: salvage, refinery, refining, workbench, module, physical receiver, scan, reveal and defense. Explain why progress is held. | G01–G03 | Guidance: objective/provider data; lead `journey.gd` | M | No repeated popups on ordinary percentage/distance changes; power loss, full storage and missing parts name the actionable reason; resuming a save gives a brief relevant recap; hints never trigger the action or reveal future sites. |
| G05 | Integrate settings, input, readable layouts and priority with HUD/reticle/captions. | G02–G04 | Lead owns `ui.gd`, `main.gd`, `controls.gd`; guidance supplies controls/data | S | Default and remapped inputs work; hints/markers independently disable; keyboard and pointer reach Pin/Unpin; no clipping at 1440×900, 1200×900 and existing large text; aiming, boarding, building and cinematics retain their prompts. |
| G06 | Integrate optional persisted pin/seen state and legacy defaults through central validation. | G01, G03, C03 | Lead owns `session.gd`, `save_validation.gd`, `playtest_checkpoints.gd`; guidance supplies normalization cases | S | Old saves retain progress/settings; malformed IDs are safely rejected or cleared per schema policy before live mutation; a save/restore does not replay a reward or retain a freed target; campaign/playtest directories stay isolated. |
| G07 | Exercise actual input and walking through the guided opening and interrupted states; capture the final HUD/wrist/station layouts. | G01–G06 | Guidance: proposed `tests/objective_guidance.gd`; extend focused existing fixtures | M | First-steps, scanner, defense, workshop and both late routes pass; include low supplies, no powered station, destroyed station, several copies on different decks, held inputs, menu close, death and load. Scripted checks assert state and movement, not just label text. |
| G08 | Observe an uncoached first-time opening/first expedition; record confusion and revise the guidance from evidence. | G07, P01, P02; early observation can precede final polish | Lead with playtester; evidence under `docs/godot-port/results/` | M | Target a small five-player qualitative pilot if participants are available. Record unaided task completion, wrong-station visits, menu dead ends, help requests and first-build/first-scan timings. Target at least four of five finishing the opening chain without verbal directions; sample size and outcomes remain explicit, with no population claim. If unavailable, this human gate stays unverified. |

## Integration and review

G01 is also the task/target provider for physical expeditions. The expedition agent supplies step IDs, reachable anchors and lock reasons; guidance formats them. B's material/placement preview remains read-only and is shared with G03. P01 records semantic transitions and hint use, not every draw or a player's free-form text.

Run the new focused suite plus `controls_interactions.gd`, `wrist_terminal.gd`, `story_polish.gd`, `play_parity.gd` and affected checkpoint cases. C04 owns the final combined regression. G08 reports player experience separately from automated correctness. Opening duration changes belong to P04 after baseline collection, not hidden inside tutorial text or UI code.
