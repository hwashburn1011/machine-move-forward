# Aisle-facing receiver and live scanner feedback

Starting revision: `77c4798`. The previous iteration made verified progress on the helm. Scope: the existing salvaged receiver and its existing earned attachments. Preserve the first-salvage discovery, replacement-module cost, three-minute scan, three-second stabilization, original battle scene, power rules, E interaction, collision and native saves.

## Findings and completed tasks

1. Capture the actual native receiver from the main aisle, rear and side. The screen faces the outer railing; the aisle sees a plain back. The power lead ends loose, the post ends 7.5 mm below the tray, and the controls have little mechanical detail.
2. Build a new original Blender receiver with a grounded bolted pedestal, connected supports, formed case and seals, service panels, captive fasteners, machined selectors, protected handles, detailed cartridge/socket, screened ventilation, connected power and antenna fittings. Face its controls toward the aisle without moving its site or expanding the solid walking footprint.
3. Inspect source and native views. Close small display/maintenance plate seams and constrain curved handles to the actual envelope. Preserve smooth curves using explicit bounded Bezier tangents; generic automatic handles initially overshot the intended control points.
4. Mount a native depth-tested readout inside the physical display. Show missing module, scan readiness, exact coherence, power loss, threat/away pauses, stabilization and acquired contact using existing game state. Cache text updates and refresh at four Hz of simulation time; power/phase changes refresh immediately. No render-to-texture viewport, light source or new interaction.
5. Keep the earned archive and seed instruments at their original positions/scale and turn their faces toward the same aisle. Remove 668 collapsed or microscopic source faces and preserve the remaining fine geometry with lossless vertex import. Retain the original shared story kit for all other instruments. Correct the editable Blender review's quaternion/Euler mode so its pose agrees with the native game.
6. Validate grounded contacts, real imported vertex bounds, surrounding geometry, earned attachment clearance, physical walking/rays, actual E input, all scan phases, power interruptions, save/load and the real 100% signal transition. Rebuild the compiled source manifest and run existing gameplay regressions. Compare native rendering with the original captured revision.

## Assets and behavior

[Editable sources and rebuild commands](../../assets/native-receiver/README.md). The receiver contains 208 editable parts, exported to 15 batches / 45,524 triangles. It uses two original 512-pixel PBR sets. The original archive and seed kit adds 15,636 triangles; the combined native assembly has no collapsed triangles in the focused check. Both GLBs validate with zero errors and warnings.

Main site remains `(1, 16.03, -9.8)`. Width/depth stay inside the existing 0.9 m × 0.56 m solid envelope. The case remains under 1.44 m; only the thin antenna rises to 1.868 m, matching the original antenna's nonblocking presentation. Earned equipment retains the existing 1.85 m collision height. Source checks verify contact between the base, column, tray, case, panels and fittings and find no intersections with surrounding machine geometry or between the antenna and earned equipment above their mounting interface.

The progress bar fills from its fixed left edge using real elapsed scan time. A power loss turns off its luminous fill and power lamp; the readout uses a shaded, dim supply message. State is derived, not saved separately. Menus pause the display with the game. No automatic repair, extra resource requirement, changed scan duration or story content is introduced.

## Verification and measured cost

Focused scanner checks exercise the actual first salvage, replacement installation, E key, powered scanning, attack interruption, leaving/returning aboard, save/load, physical collision and original cinematic event. Tests use isolated native save directories and avoid personal settings writes. Broader suite results and compiled-scene equivalence are retained under `results/receiver-*.json`.

Final result: **662 assertions passed across 11 suites**: receiver 34, compiled machine 20, helm 36, integration 108, parity audit 132, controls/interactions 66, play parity 58, camera clearance 55, desert/weather 28, story presentation 59 and crossfire handoff 66. Final import, bake, regression and rendered-review logs contain no script errors or resource-leak warnings. The crossfire fixture now waits for mixer-owned streams using the existing audio-drain helper instead of a fixed shutdown delay; its gameplay assertions remain intact.

The shared archive part is exported with its original identity root transform, independently of the assembled Blender review pose. A focused check protects its existing use at destination consoles. The final editable assembly was also appended and inspected through Blender MCP with previous user scenes preserved.

GPU methodology: RTX 3070, 1920×1080, high Forward+/Vulkan, 4× MSAA, VSync off, four fixed cameras. Two-second warmup and four-second sample per view; simulation is frozen, screenshots follow timings, runs are sequential without another renderer workload. The fourth view includes the existing earned instruments and a half-complete scan. Before data was captured on `77c4798` before replacing the original receiver; after data uses the final native assembly.

| View | Before median GPU | After median GPU | Before median frame | After median frame | Draw calls before → after |
|---|---:|---:|---:|---:|---:|
| Main aisle | 3.098 ms | 3.211 ms | 3.628 ms | 3.671 ms | 478 → 485 |
| Rear | 2.847 ms | 2.919 ms | 3.344 ms | 3.394 ms | 566 → 570 |
| Side | 3.007 ms | 3.112 ms | 3.525 ms | 3.583 ms | 1085 → 1091 |
| Earned equipment fitted | 3.147 ms | 3.261 ms | 3.621 ms | 3.707 ms | 573 → 582 |

The added detail costs **0.072–0.114 ms median GPU** in these fixed views. Small differences remain subject to host variation. Final native views are retained as `previews/receiver-front.png`, `receiver-rear.png` and `receiver-fitted.png`.

The earlier [desert refinement](desert-life-review.md) is still present: sparse grounded Blender scenery, subtle wind and drifting sand. Its 28 current regression checks confirm that storms retain their visibility effect without extra water consumption or shelter instructions.

Run the final visual fixture with:

```powershell
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/receiver_review.gd -- --label=after
```

These captures measure presentation cost, not a full gameplay FPS change or long-session pacing. A complete human campaign playthrough and older startup/intermittent frame stalls remain separate open work. The broad enhancement goal remains active.
