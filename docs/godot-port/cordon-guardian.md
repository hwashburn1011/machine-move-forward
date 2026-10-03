# Gatekeeper G-01 — Meridian cordon encounter

Native Godot beta slice, 1 October 2026.

The shorter **Meridian cordon gap** now contains Gatekeeper G-01 in place of its existing gunboat. This is one authored guardian encounter, not an additional random wave. Its recovered service message connects the ship to the Custodian Order's substituted civilian bearing. The helm labels the risk before commitment. The longer quiet-line route retains its existing skiff encounter, and the optional watch-relay mission still prevents only the separate final receiving-link interception.

Use **Playtest checkpoint 32 / Meridian — Gatekeeper guardian** to start 20 metres before the encounter threshold. This fixture supplies ordinary personal weapons, a deck gun, repairs and two decoys; those supplies are explicit test preparation, not evidence that a natural campaign has enough resources.

## Playable rhythm

The existing authored gunboat keeps its 420 hull health and original physical subsystem targets. After approaching, it tracks for three seconds, commits three visible ground marks, and gives at least 1.65 seconds to move clear. Successive salvos alternate their arrangement. Marks freeze when fired; they do not follow a successful dodge.

After the impacts, a six-second cooling window makes the actual gun lenses cyan. Fire-control armor drops from ten to zero and weapon-subsystem damage increases to 1.75 times the unarmored hit. Destroying the engine extends subsequent cooling windows to nine seconds. The existing hull and engine remain hittable throughout. This encounter uses timing and target choice rather than inflated health.

Three outcomes allow progress:

- Destroy the hull using ordinary weapons or deck guns. The existing bounded gunboat salvage is awarded once.
- Disable its fire-control unit. Pending shots cancel and the ship withdraws; escaping ships drop no cargo.
- Deploy a normal signal decoy. Tracking and pending shots cancel; the real ship and pursuit lifecycle must finish before the crossing clears.

Death clears pending marks and gives a fresh lock window after recovery. It does not award a victory or despawn the guardian. Disabled and retreating ships remain live encounter state until they leave, preventing saves of a half-finished guardian. Loading or restarting a checkpoint clears transient phase and target references.

Resolution uses the existing saved route receipt. It cannot repeat the encounter after a normal save/reload. The threat director receives a 650-metre recovery interval, and the live session gets at least 75 seconds without new ambient encounter starts. Existing protected destination behavior still applies. L–12 acknowledges the seeds and names if actually recovered; otherwise navigation acknowledges the clear crossing. These lines join the existing personal log when delivered.

## Verification and remaining work

`godot/tests/cordon_guardian.gd` exercises real campaign triggering, physical subsystem hits and damage, fixed warning positions, cooling vulnerability, disabling/decoy/hull outcomes, death recovery, large time steps, lifecycle save gates, durable resolved saves, one-time rewards, reset cleanup and the alternative route. It writes isolated results under `test-results/cordon-guardian-headless.json` or `cordon-guardian-native.json` and native captures beside them.

Run with the repository's Godot 4.7.2 console executable:

```powershell
& 'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe' --headless --path godot --fixed-fps 60 --script tests/cordon_guardian.gd
```

Remove `--headless` for the controlled rendered review. This is not a natural campaign playthrough. A human still needs to judge first-read threat comprehension, practical weakpoint visibility on different displays, difficulty with their real machine layout and equipment, recovery pacing, and uninterrupted Orchard → Meridian continuity. This slice reuses the existing authored carrier; a dedicated guardian hull or animated armor assembly remains future art work rather than a claimed new asset set.

The [1 October verification report](results/cordon-guardian-2026-10-01.json) records 42 guardian checks plus 715 related narrative, pacing, scout, combat-contract and checkpoint checks. The guardian suite also passes with native Vulkan rendering. Each regression has its own source stamp because the other beta work proceeded in parallel; this report does not imply one frozen whole-project release candidate. Native captures are `test-results/gatekeeper-salvo.png` and `test-results/gatekeeper-cooling.png`.
