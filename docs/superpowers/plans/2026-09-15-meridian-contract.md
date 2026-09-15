# Meridian implementation contract

Branch `codex/meridian-last-garden`, based on Orchard main `abc9661`.
This refines the task plan; nothing in this document is a delivery claim.

## Data and art

Expedition/model ID `last-garden-meridian`. Unique `meridian-solution`.
Objectives `meridian-transmitter-online` and `meridian-archive-installed`.
Both objectives start incomplete on either route; neither consumes or removes
the previously recovered Orchard memory-core fact.

Routes `meridian-quiet-line` (1,250m, skiff at 520m remaining) and
`meridian-cordon-gap` (1,050m, gunboat at 620m remaining). Both hold at 220m until
all active/queued combat clears. No enemy navigation on the detached destination.

Journals: `meridian-common-record`, `meridian-civilian-record`,
`meridian-defense-record`. Quiet Line permits civilian + common; Cordon Gap
permits defense + common. Both objective interactions and both permitted records
gate the solution and departure. Route choice cannot remove ending eligibility.
Write signed, in-world records about a maintained refuge channel, preserving
human names and seeds, and an ambiguous recent reply. No confirmed extinction
or guaranteed human community.

Root X17, Y same Nomad upper-deck surface; floor 18×20m, top Y0. Gangway
`(-9.5,-.08,0)`, entry `(-8,0,0)`, exit sightline `(-9.5,1,0)`.

| Anchor | Local X,Y,Z | Interaction |
| --- | --- | --- |
| `TransmitterConsole` | `(2.4,1.2,-3.1)` | `meridian-transmitter-online` |
| `ArchiveCradle` | `(-4,1.2,4.5)` | `meridian-archive-installed` |
| `MeridianSolution` | `(4,1.2,4.5)` | `meridian-solution` |
| `CommonJournal` | `(0,1.2,-6.8)` | `meridian-common-record` |
| `CivilianJournal` | `(-4,1.2,-2.4)` | `meridian-civilian-record` |
| `DefenseJournal` | `(5.8,1.2,.8)` | `meridian-defense-record` |
| `Gangway` | `(-9.5,-.08,0)` | `meridian-departure` |

Keep X0 and Z0 walking spines clear except the small common journal console in
the north aisle. Main transmitter foundation center `(5,.35,-6)`, half extents
`(2.25,.35,2.25)`, tower radius1.25 to Y10. Garden shelter center `(-5,0,-6)`,
5×5m, side glass at X=-7.5/-2.5, open centre south entrance. Archive bench center
`(-4,.5,6.5)`, half `(2.3,.5,1)`; solution bench center `(4,.5,6.5)`, same.
Rails follow Orchard's four boundaries with a split west gangway gap.
Root adds exact art-derived colliders after the source is generated.

Original models: explorable Meridian transmitter/garden platform plus a cheap
distant refuge facade for the ending. Astra owns models, source, optimization,
Blender MCP review, Unreal imports and all GPU work.

## Ownership

- Luna Noether: `EndingDirector.ts` and focused pure tests first, then a new
  view-only EndingUI module after root freezes its public view. No Game/data edits.
- Luna Ptolemy: story/routes data and validation tests, including the legacy
  journal proof table. No StoryDirector/Game/art edits.
- Sol Franklin: StoryDirector progression, archive persistence and restoration,
  pure story tests, then integration correctness review. No Game/art edits.
- Astra root: Game, Destination, model factories/loader, camera/ending state
  integration, helm/radio view wiring, runtime QA and release. UI edits can be
  explicitly delegated after data contracts land.

## Save and ending

Use the exact pure EndingDirector contract in the refined tasks. Campaign format
2 composes optional `journalArchive:string[]` and `ending:EndingSave`; ending
has inner `format:1`. StoryDirector owns archive/progression; Game owns the single
EndingDirector instance and composes its save. Never maintain two ending owners.

Known first reads enter the durable archive. Legacy migration includes valid
active journal reads plus records provable from recovered required uniques:
course actuator proves its two Quiet calibration records; vector governor
proves common Orchard memory only. Meridian solution proves common Meridian
memory only. Do not invent which route's testimony an old completed save saw.

Final bearing is +32 degrees. The deliberate helm commitment requires a
successful safe checkpoint and immediate state revalidation. Journey is 400m;
arrival presentation is 12 simulation seconds, with idempotent Skip/credits.
Normal travel resource use continues during the journey; the completion edge
does not reset, refund, duplicate or clear world/inventory/build/garden state.

Keep Walking preserves the same save and existing raid/discovery rules. Tier3
uses existing ±45-degree control and every third new contact can use a 265–290m
lateral depot band, beyond tier2 authority with the current +14m gangway offset.
Old tier1/2 contacts and saves retain their exact coordinates and rewards.

Ship only after the complete chapter, deliberate ending, save recovery, readable
archive and playable same-save continuation work together in the browser.
