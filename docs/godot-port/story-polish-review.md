# Native campaign polish delivery

Implemented against the existing Godot campaign on `codex/godot-native-port`. The original Three.js game and its data/assets remain unchanged. The [task plan](story-polish-plan.md) contains the detailed scope and acceptance criteria.

## Delivered tasks

| Tasks | Result |
| --- | --- |
| J1–J4 | Bounded priority radio queue, once-only transmission history, destination briefs, load recap, optional two-minute reminders and a finite quiet interval before random boarding. Existing scripted encounters and scanner cinematic retain their triggers. |
| D1–D7 | Wake gyro interlocks; Foundry three-unit power allocation; Quiet Array live trace alignment; both Orchard isolator sequences; Meridian transmitter/archive verification. Real native controls operate local machinery, reject remote use, preserve partial progress and retain existing journal/reward gates. |
| C1–C4 | Sword-windup and Bastion-exposure labels/colours, armour/exposed/elimination feedback, camera-relative grapple direction with ship side/deck text, pooled directional shots/steps/hook effects. Combat data and attack durations are unchanged. |
| P1–P4 | Seven Blender-authored instrument assemblies, revised physical wrist hardware, earned archive readout and seed preservation tray mounted atop the receiver, contextual recovery/keepsake/L–12 captions. Existing helm upgrades remain in use. |
| U1–U5 | Responsive wrist terminal, live three-deck equipment schematic, select/service/repair/locate actions, category filters, persistent favourites, research and attachment comparisons, progress manifest and transmission archive. |

## Verification

- 108 integration assertions: all five chapters, their new local activities and the existing final arrival complete; original crafting, scanning, saving and construction checks pass.
- 56 input-parity assertions: grapple, menus, weapon inputs, build contexts, mounting, death/recovery and load cleanup pass.
- 132 broader parity assertions: production, power/research, attachments, construction transactions, navigation and save recovery pass.
- 13 traversal checks: actual side stairs, upper landing, elevated gangway and encounter profiles pass.
- 59 targeted feature assertions on the RTX 3070: partial console saves, malformed-state rejection, old-save compatibility, native sliders/buttons, radio priority/idempotence/expiry, optional reminders, physical reward visibility/collision, favourites/map selection, 4:3 layout, spatial audio limits, unchanged sword timing/Bastion damage and grapple warnings pass.
- A 65-second real-time GPU travel/boarding sample deliberately set the random director at its escalation threshold. It delivered the departure transmission at 0.13 seconds, held random escalation until 15 seconds and spawned the boarding craft at 34.02 seconds. The simulation advanced 64.52 seconds during 65.01 seconds of wall time. This verifies the briefing's quiet interval, not the typical interval between encounters or a full normal-speed campaign playthrough.
- Blender MCP inspection preserved existing scenes. Native captures were reviewed at 16:9 and 4:3; archive/seed placement was revised after the first view obscured it behind the receiver.

Reports are retained in `results/story-*` and `results/journey-pacing.json`. Reproduce with the launcher switches documented in `godot/README.md`. All runs isolate test saves and avoid writing personal settings.

## Review notes

Radio messages use captions and a quiet signal cue; there is no new recorded voice acting. Activities have no timers, consumable costs or failure penalties. They deepen the five established stops without adding chapters or changing the ending. Older completed objectives remain valid; revisit an unfinished destination or start a new campaign to see its new interaction.

Blender source, runtime GLB and render: [instrument kit](../../assets/native-story/README.md). The terminal is native Godot UI, allowing readable text, keyboard navigation and responsive sizing; Blender supplies its physical wrist case and world instruments.

The automated checks do not replace a complete human playthrough or a hardware performance comparison. No performance uplift is claimed for this feature pass. New spatial audio is capped at 12 voices, and static new geometry is batched by material. Changes are local until explicitly pushed or merged.
