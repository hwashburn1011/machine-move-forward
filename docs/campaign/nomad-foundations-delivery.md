# Nomad foundations — implementation and verification

Updated: 21 September 2026. Local branch: `codex/expedition-operations-desert`.

This is the original foundation checkpoint. The [combined Nomad release](nomad-release-2026-09-21.md)
includes this work, the subsequent v3 deck expansion and cinematic refinements.
The public trailer remains the previously released cut. Existing
expedition/operations/desert work was retained.

## What the player gets

### Build first, then scan

After the rooftop opening, the first eligible recovered cargo grants the receiver.
The guide proceeds through refinery construction, 12 refined components, a
workbench, and a replacement scanner module (4 scrap + 4 components). A healthy
built workbench is required, and an existing carried, stored or installed module
prevents another from being crafted.

Install the module at the receiver's physical service socket. Start the scan there
or from the wrist terminal. The scanner requires 180 active powered seconds aboard,
independent of travel speed. Menus, loss of power and unsafe encounters suspend
progress. Recurring attacks and the compulsory tutorial skiff wait during this
opening phase; already committed legacy encounters are allowed to resolve.

At 100%, three safe simulation seconds lead into the existing 17-second ship
battle and Revenant reveal. A menu or active activity delays that handoff. Natural
completion and hold-to-skip consume the same durable contact, unlock recurring
raids, and give the guided defense its preparation grace. This iteration does not
add another story chapter.

### Readable cargo and manual fuel

Original Blender cargo has corner protection, tow eye, latches, CARGO / REEL RECOVER
markings and amber strips. Recoverable crates ride above the actual dunes, outside
the expanded machine perimeter. A bounded projected prompt identifies nearby
visible cargo and shows the configured reel key.

The new fuel can has pressed ribs, a handle/cap and worn ochre enamel. The generator
has a labelled fill point, separate reservoir, fuel gauge and power indicator.
Refuelling consumes only carried fuel and only the amount accepted by tank capacity.
A brief canister gesture yields immediately to combat. Helm controls, manual fuel,
scanner installation, field pickups and repair holds remain physical interactions.

### More space aboard

The v2 Nomad has a 14 × 18 m core, 16 × 20 m supported walking perimeter and 3.6 m
between decks. Structural surfaces expand while equipment keeps its proportions.
The Blender source has 24-tread stairs, supported stringers and sloping handrails;
navigation, collision, build cells, service points, destination gates and animation
anchors use the same profile. The four-leg hierarchy remains intact.

Eight prop assets were authored/refined: cargo, fuel can, generator, scanner,
wrist device, workbench, refinery and storage. Every other onboard family was
reviewed in Blender; identifiable existing galley, defense, collector, helm,
robotics and furnishing assets were retained. See the
[art inventory, renders and rebuild tools](../art/nomad-foundations/README.md).

The scanner's collider appears with its recovered hardware and reserves its build
footprint. Perimeter strips provide actual floor support. Stair movement assists
only valid slopes; wall, steep-slope and ceiling checks prevent the assist from
becoming a climbing exploit.

Radioactive sand remains off limits. Falling recovers the player to a recently
validated supported machine/site/rooftop anchor before terrain contact. It does not
require ground pickups or remove health to disguise a bad route.

### Wrist terminal and HUD

Press **Tab** aboard to raise the device and open six pages: Inventory, Character,
Workshop, Machine, Signal and Build. The terminal owns a simulation pause; keyboard
focus stays inside the menu, and closing it releases only that owned pause.
Away from the Nomad the existing field inventory remains available.

- Inventory: carried items and owned storage, individual transfers, Take All,
  Deposit Matching and Sort, with capacity/overflow feedback.
- Character: real vitals, weapon, ammunition and installed attachment.
- Workshop: installed-station recipes, explicit output destination and earned
  fieldwork attachment research/equip actions.
- Machine: deck/equipment status, output collection, garden care, maintenance pins,
  fuel/power detail and earned caretaker configuration.
- Signal: the current objective, current radio channel, scan controls and records
  actually recovered. There is no invented inbox/read-history state.
- Build: searchable pieces with costs and availability, followed by live placement.

Remote actions use actual healthy owned equipment, unlocks, power and material
costs. Atomic transactions draw from carried inventory and eligible onboard crates.
Collectors do not silently become an unrestricted crafting purse. Output destination
is separate from the storage-transfer selection. Queued and active encounters block
fieldwork configuration; menu transitions do not refill magazines.

The HUD defaults to a compact machine strip and exposes fault detail as needed.
Settings add 100–140% terminal text and reduced motion. The overlay uses readable
DOM controls with amber/cyan industrial styling; the wrist mesh is presentation.

## Persistence

Scanner setup, elapsed scan time and contact state are optional validated save
fields. Old partial signals reconcile without charging the module retroactively;
mature campaigns do not replay the opening reveal.

The layout codec accepts legacy, v1 and v2 profiles and rejects unknown layouts.
The one-time v1 migration preserves instance IDs, contents, condition, rotations,
production/jobs and tank fuel. Unsupported conflicts are retained as recovery
pieces rather than discarded. Subsequent v2 loads do not migrate again. Player
poses are transformed by support/deck, then checked against valid collision and
radioactive-ground exclusion.

## Evidence

| Check | Result and boundary |
| --- | --- |
| Production build | TypeScript and Vite pass. Existing large-bundle warning remains. |
| Lint | ESLint passes. |
| Full unit suite | 199 files / 1,744 tests pass with two workers, including the final Signal projections and restored-scanner guidance. |
| GLB validation | Ten delivered runtime GLBs: zero Khronos errors and zero warnings; finite transforms, embedded resources and four required Nomad hip roots. |
| Main browser route | Real Tab navigation, pause ownership, all six pages, lower→middle and middle→upper stairs, descent, and pre-ground recovery pass with no console/page errors. |
| Scanner browser route | Real refinery/module crafting and install/start actions; controlled fixed-step 180-second timing, power/pause suspension, safe contact, actual save/load, natural completion and skip pass with no errors. |
| Terminal browser route | Real keyboard/menu actions, 140% text and reduced motion, no horizontal overflow, correct fieldwork costs, queued/active/power refusal, crafting to owned storage, and no free ammunition pass with no errors. |
| Cold Continue | A fresh isolated browser saved, closed, reopened and used the real Continue button. Nondefault seed, in-progress scanner, v2 layout, fuel, stable storage ID with exact contents and a supported aboard pose survived. No browser errors. |

Browser harnesses construct bounded fixtures through test setup; they are not an
unassisted playthrough of the entire campaign. The scanner clock check advances
actual fixed updates rather than waiting three wall-clock minutes. The main browser
capture used low quality at 1440 × 900; its representative frame submitted 679 draws
and about 1.87 million triangles. These figures are diagnostics, not a 60 FPS claim.

A simultaneous verification attempt produced graphics initialization and worker-spawn
failures. Sequential runs initialized rendering correctly and passed; resource
contention is suspected. No remaining application error was reproduced in those runs.

Reproducible tools and ignored reports:

- `tools/campaign/nomad-foundations-qa.mjs` →
  `test-results/nomad-foundations/report.json`.
- `tools/campaign/nomad-scanner-qa.mjs` →
  `test-results/nomad-scanner-qa-final/report.json`.
- `tools/campaign/nomad-terminal-qa.mjs` →
  `test-results/nomad-terminal-qa-final/report.json`.
- `tools/campaign/nomad-continue-qa.mjs` →
  `test-results/nomad-continue-qa-final5/report.json`.
- `tools/art/nomad_foundations/validate.mjs` →
  `assets/nomad-foundations/gltf-validation.json`.

Representative durable captures:
[expanded machine](../art/nomad-foundations/in-game-exterior.png),
[stairs](../art/nomad-foundations/in-game-stairs.png),
[terminal at 140%](../art/nomad-foundations/in-game-terminal-140.png).

## Release boundary

Local implementation and automated checks are delivered. Long unassisted Story and
Survival playthroughs, human pacing/accessibility feedback, a sustained midrange-PC
60 FPS capture and public deployment are separate release acceptance. The next
exploration/progression batch remains after these foundations: raised exploration,
further operations progression and visible machine specialization.
