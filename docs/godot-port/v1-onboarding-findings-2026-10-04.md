# First-hour onboarding audit — 4 October 2026

Evidence type: source inspection and isolated paid-transaction fixtures. This is **not** a human playtest, an elapsed survival test or the continuous earned campaign. The full campaign journal records those separately.

## What works

The opening economy has a useful margin already. Starting stock is 260 scrap. First recovered cargo guarantees at least 34 scrap and four reserve fuel, even if the component roll is empty. A conservative opening shopping list is:

| Purchase | Scrap | Components |
| --- | ---: | ---: |
| Three support floors | 24 | 0 |
| Refinery | 80 | 0 |
| Six refining batches, producing 12 components | 48 | 0 |
| Workbench | 30 | 4 |
| Scanner replacement | 4 | 4 |
| Manual deck gun | 42 | 4 |
| Total | 228 | 12 produced and spent |

This leaves at least **66 scrap**, without collecting a second crate. Existing deck space can reduce the floor expense. The test uses actual production inventory, building payment, crafting, scanner installation and power calculations; it does not duplicate those formulas as a fake progression simulation.

Across 512 deterministic seeds, all opening purchases succeeded and both the gun and scanner had power. 118 first crates had no components. The measured minimum was 34 scrap, zero components, four fuel, and 66 remaining scrap after purchases; `first-hour-19` reached that minimum reserve. No loot increase is justified by this evidence.

Existing quiet presentation also provides a sound foundation: objective text derives from owned items rather than a historical refining quota, manual pins survive validated saves, routine notes stay in the wrist log, and world objective markers are optional. Source inspection confirms the tutorial encounter waits for the scanner conversation to finish, a built gun to have been crewed, and a 15-second delay. It does not immediately punish a player reading menus. Actual novice understanding and a leisurely elapsed fuel budget still require the separate campaign and human tests.

## Issue fixed

**ONB-01 — unaffordable early instructions, medium severity.** After spending scrap on optional construction, the objective could still tell the player to build the refinery/workbench or craft components/module without sufficient scrap. Components were checked; scrap was not. This can make a failed transaction feel like a broken tutorial.

The guide now names the exact missing scrap and directs the player to passing cargo with the remappable hook control. It keeps the intended purchase or recipe as the automatic materials checklist. For refining, it also explains that recovered components count. Guidance returns to building or crafting immediately when stock is sufficient. An already owned module goes straight to installation, even with no scrap. First refinery and workbench directions now name the remappable construction key and clear deck placement.

No resources, prices, encounter scheduling, rewards, save fields, sounds or pop-up behavior changed. The instructions are read-only and remain on the existing surfaces.

## Verification

- `godot/tests/first_hour_economy.gd`: **9,355 checks passed**, 512 seed fixtures, no failures. Includes exact shortfall, insufficient refining inputs, recovered-component bypass, affordability recovery, read-only behavior and owned-module regressions.
- Existing `godot/tests/objective_guidance.gd`: **98 checks passed**, no failures. Includes save validation, marker preference, station ownership and all existing checkpoints.
- Both used native source fingerprint `65cdc745c208a40c83622784a9194bbb7d1f43b5e02e261802fde24f960a4358` before other parallel work was integrated. Re-run affected checks after the final source freeze.
- Raw results: `test-results/v1-onboarding/economy.json` and `test-results/beta-next/objective-guidance.json`.

Commands from repository root:

```powershell
& ./test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tests/first_hour_economy.gd
& ./test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tests/objective_guidance.gd
```

Remaining observation gates: intercept low-yield cargo during real movement; inspect wrist readability during ordinary play; see whether a fresh player recognizes the build/refine/install sequence; measure leisurely fuel use and first combat losses. The fixtures establish affordability and transaction correctness, not those outcomes.

## Final integration recheck

Both focused suites were rerun headlessly against the final integrated source fingerprint `38aedaeaf106a20a39137140a4f5c4fbda724e9536317573522429de12d7198c`. The economy suite again passed **9,355 checks across 512 seeds**, with the same 66-scrap minimum reserve; objective guidance again passed **98 checks**. Both exited successfully with no failures. The guidance test retains its isolated `user://native-objective-guidance-tests/` save directory; the economy fixture uses in-memory sessions and creates no campaign save.

New logs and JSON reports are preserved under `test-results/v1-onboarding/final-freeze/`. Earlier JSON evidence was copied there before rerunning as `economy-before-final-freeze.json` and `objective-guidance-before-final-freeze.json`, retaining the earlier source fingerprint. No runtime or test source was changed for this recheck. The concurrent rendered campaign is separate evidence and is not counted among these fixture results.
