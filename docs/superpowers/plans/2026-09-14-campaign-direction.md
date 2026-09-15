# Machine Move Forward — full campaign direction

Status: product direction and implementation contract. Prepared 14 September
2026 against main `b8ccafb`. Chapter One is a proven foundation, not completion
of this game. The target remains a browser-native Three.js/Rapier single-player
survival, building, exploration and story game.

## Player promise

S-07 is a benevolent machine intelligence embodied in a maintenance chassis on
the Iron Nomad. It protects the people, records and practical knowledge left
after the collapse. The authoritarian mech network hunting the Nomad treats
unsanctioned memory and human autonomy as faults to erase. The player keeps the
walker alive, makes it a home, follows uncertain signals, and recovers the
physical control systems needed to choose where it goes.

The game alternates three readable moods:

1. **Survive:** repel boarders, repair damaged systems, manage fuel, water and
   food, and recover stolen supplies.
2. **Build and breathe:** reorganize the three decks, automate chores, tend food,
   craft, watch the landscape and listen to recovered recordings while the
   Nomad walks.
3. **Choose and explore:** use the radio and chart to discover opportunities,
   steer toward one, cross a physical gangway, learn what happened and bring
   back a capability that changes life aboard.

Quiet time is valuable gameplay, not an empty wait between raids. Automation,
clear forecasts and optional destinations should create longer calm intervals as
the player becomes competent. Difficulty comes from decisions and recovery,
not an ever-tightening needs timer.

## Complete-game arc

### Beginning — wake, shelter and first choice

The shipped opening teaches movement, salvage, power, repair and defense without
rewriting its timing. S-07 recovers the radio, survives the signal crossfire and
one recurring raid, then may trace Wreck One. The Course Gyro makes route choice
possible; Relay Foundry awards the controllers for automatic salvage and
defense. Chapter One ends with a functioning home and the first proof that the
old relay network preserved human testimony deliberately.

### Middle — learn to steer and decide what to preserve

Chapter Two, **The Quiet Array**, follows a weak ANNIKA maintenance reply to an
on-line observatory and route-control station. It is deliberately reachable on
the Nomad's automatic line so steering is not required before it is earned. Its
spaces tell two stories in parallel: human operators hid civilian routes and
archives from the authority network, while an early S-series intelligence chose
to falsify orders to protect them. S-07 recovers a course actuator, enabling
limited steering, and an archive shard containing names and messages rather than a
generic stat token.

The middle campaign then opens a deterministic set of optional discoveries:
small wrecks, water caches, repair depots, memorial transmitters and dangerous
salvage. The chart shows what is known, uncertainty, lateral bearing, distance,
estimated fuel and threat, and whether an opportunity will recur. These sites
feed the build loop with materials, journals, cosmetic keepsakes and bounded
comfort improvements. They do not become an infinite icon-clearing map.

Chapter Three, **The Glass Orchard**, is a human seed bank and memory archive and
reveals why S-07 is hunted. The network's
Custodian doctrine preserved humanity only as approved records and obedient
machine labor. S-07 carries an unfiltered witness archive and can awaken other
protective intelligences. The player chooses which distress lead to answer on
the approach, changing the encounter and recovered testimony but never deleting
the main path. The reward is full course authority within a bounded forward arc
and a memory core needed at the final refuge.

### Ending — carry memory somewhere it can live

The last chapter, **The Last Garden at Meridian**, is a visible refuge transmitter
beyond the authoritarian cordon. Its recovered Meridian solution grants the final
committed course; the approach composes navigation,
prepared defenses, repairs, supplies and all four mech tactics in a staged final
assault. Before commitment the UI states the point of no return and creates a
safe checkpoint. Failure reloads that checkpoint without duplicating resources.

Arrival is an in-engine sequence. S-07 hands the archive and route knowledge to
a small surviving settlement, while the Iron Nomad becomes its moving shield and
trade link. The ending recognizes discoveries preserved and people answered,
without grading the player for missing optional logs. Credits are skippable.
Afterward the same save enters **Keep Walking**: the completed world continues
with building, needs, discoveries and the full recurring raid set. Story rewards
and credits never replay.

## Staged machine control

Directional control must be earned, visible and physically legible while the
existing world-scroll architecture remains intact.

| Stage | Earned capability | Player decision |
| --- | --- | --- |
| Automatic line | Nomad holds its original heading | Prepare, survive, observe signals |
| Course Gyro | Choose authored direct/detour routes | Commit at the powered helm |
| Quiet Array course actuator | Hold a limited left/right bearing, maximum 12 degrees | Reach near-line discoveries |
| Glass Orchard vector governor | Hold up to 28 degrees and preview return cost | Reach wider discoveries and the final lead |
| Meridian solution | Commit one final plotted course | Enter the Last Garden finale |

Input is a held steer action at the powered Navigation Helm, not free vehicle
driving from anywhere on deck. The authoritative state is a desired bearing and
a rate-limited current bearing. World chunks, props, threats and destinations
move consistently in that frame; the Nomad and its physics deck remain at the
origin. Steering never rotates the machine group or player capsule. Losing helm
power freezes new input and eases to the last safe bearing; it does not snap the
world or spend fuel twice.

## Chart and discovery loop

`RouteChart` is deterministic state derived from the world seed plus persisted
discovery facts. A contact has a stable ID, type, forward distance, lateral
bearing, confidence, availability window, hazard band, fuel estimate and state
(`unknown`, `detected`, `identified`, `committed`, `visited`, `missed`). Story
destinations re-offer and cannot be permanently missed. Optional sites may pass,
but the UI marks that consequence before commitment.

Radio strength identifies contacts over time. A powered chart table turns that
information into a compact forward strip, not a global open-world map. Selecting
a contact previews heading, intercept distance and fuel; a second action at the
helm commits. Discovery rewards use existing inventory, unlock, journal and
build-piece authorities. No chart operation directly creates inventory or
changes story state.

The first iteration ships three reusable opportunity templates after Chapter
One: a safe water cache, a salvage wreck with a bounded hostile chance, and a
memorial transmitter containing a human recording. They reuse the destination
and interaction pipeline with small layouts. Their purpose is to prove that
steering and charting enrich the survival/build loop before another large
chapter is added.

## Full-game completion requirements

The game is complete only when all of the following are true:

- A new profile can play the opening, Chapter One, two substantial middle
  chapters (Quiet Array and Glass Orchard), a final approach and ending, then
  continue in Keep Walking.
- Each chapter has a distinct explorable layout, encounter premise, several
  authored records, one mechanically useful recovery and an unmistakable
  completion beat. Main chapters re-offer until completed.
- Directional control progresses through the four stages above. The chart,
  physical world, encounters, saves and destination approaches agree on bearing
  and distance.
- Survival is recoverable: needs are readable, renewable food/water works,
  damage can be repaired, fuel has forecast and replenishment paths, theft is
  conserved, and no normal failure creates an unwinnable save.
- Building matters throughout the campaign. Storage, power, food, crafting,
  lighting, repair and defenses each solve recurring problems; automation
  reduces chores without deleting player choices. Relocation and demolition
  preserve ownership/resource invariants.
- Calm play has useful actions and atmosphere: tending production, organizing
  storage, researching, reading the archive, charting contacts, watching the
  machine and revisiting collected memories.
- Every combatant and raid objective has visible intent and counterplay. The
  fixed hostile pool and bounded effects keep long sessions stable.
- HUD and panels explain the current objective, threats, machine damage, power,
  needs, route commitment, costs, refusals and save safety without debug terms.
  Keyboard/mouse remapping, focus, pause and pointer-lock transitions remain
  reliable.
- Dialogue, journals and radio copy consistently establish S-07's protective
  choice, the remnants it serves and the Custodian threat. Story facts live in
  data; state machines do not embed prose.
- Art gives each chapter, enemy cue, machine station and reward a recognizable
  silhouette. Audio covers locomotion, ambience, UI, threats, weapons,
  machinery, radio and major story beats with independent volume controls and
  no missing-asset boot failure.
- Saves round-trip every stable campaign phase, control tier, chart contact,
  collected unique, unlock, build/container state and postgame flag. Old version
  1 saves load safely; active combat and half-completed transactions remain
  excluded by the existing safe-save boundary.
- A representative High-quality target holds 60 FPS on the reference RTX 3070
  at 1600×900 without recurring long frames, resource counts remain bounded over
  100 mixed cycles, and lower quality presets remain playable on integrated
  graphics. Final acceptance also includes keyboard/mouse playthroughs, visual
  captures, audio checks and a clean production build.

## Architecture direction and risks

Reuse the existing fixed simulation, `StoryDirector`, `Destination`,
`WorldManager`, event bus, BuildSystem, Progression, SaveManager and DOM panels.
Add small typed controllers beside them; do not move to another engine or create
an abstract quest framework.

Current constraints that must be addressed deliberately:

- `StoryDirector` and `src/data/story.ts` encode two expedition IDs and three
  unique IDs as closed unions. Extend these from typed data before adding chapter
  switches; do not scatter new ID conditionals through `Game`.
- `Destination` infers unique IDs from substrings and hardcodes Wreck/Foundry
  containment/model choices. Definitions need explicit reward IDs, bounds and a
  model factory seam before a third layout.
- `Game.ts` owns integration and save ordering. New controllers must return
  effects or readonly views so workers can implement them independently while
  root serializes Game wiring.
- `WorldManager`, `TerrainChunk`, `DuneField` and many effects assume forward
  motion along -Z through `WORLD_Z_PER_METRE`. Directional travel must apply one
  course transform to terrain, props, `DesertScenery`, salvage, tracks, ground
  samples and detached destinations while leaving the deck, attached ships and
  machine physics fixed. Rotating the Nomad would break existing contracts.
- The streamed world is currently a Z strip with a finite X band. The first
  steering tier needs a bounded lateral envelope and an explicit recenter or
  clamp rule before the player can see terrain edges or scenery jumps. It must
  not imply unbounded sideways travel.
- `machine.navigationTier` is serialized as zero but has no runtime authority.
  Treat old values defensively and persist a new validated navigation snapshot;
  never infer story rewards solely from a mutable integer.
- Expedition and Radio UI rebuild HTML from narrow views. The chart needs its own
  panel/view key and must share the existing menu/pointer-lock lifecycle rather
  than adding global listeners.
- Campaign format 2 lives inside save version 1. Add optional validated fields
  first; bump only the inner campaign format if older readers cannot represent a
  state. Test old saves at every currently legal phase.
- Authored destinations allocate physics and cached model resources. Repeated
  configure/dock/reset/load cycles must retain the existing body, collider,
  material and scene-count invariants.

## Next three deliverables

1. **Earned directional control.** Implement the saved, rate-limited course
   controller, physical helm interaction and consistent world/destination/threat
   projection across every detached world system. Preserve the Course Gyro's
   existing route-card authority; the Quiet Array course actuator grants the
   first 12-degree manual tier.
2. **Quiet Array chapter.** Generalize destination data just enough for one
   new observatory/route-control layout, add the S-07/ANNIKA narrative, recover
   the course actuator/archive shard and grant the first steering tier. Complete
   it with a clear radio milestone and resume survival.
3. **Route chart and discoveries.** Add the deterministic forward chart and the
   three small opportunity templates. The chart makes steering understandable
   and gives calm travel useful choices, salvage and human stories.

These are one iteration because they form a closed loop: Chapter One reveals the
next lead, Quiet Array grants control, the chart explains what control can reach, discoveries make it useful,
and Quiet Array provides a substantial destination and the next earned step.
They do not include Chapter Three, the finale, weather, new weapons or an engine
migration.


This document supersedes the provisional 26 August Phase 10, Phase 13 and Phase
14 plans where they assumed nonexistent navigation files, a different story arc
or procedural-art restrictions. Those files remain historical context, not
implementation authority.
