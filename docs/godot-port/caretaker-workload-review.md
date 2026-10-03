# Construction load and L-12 refinement

Continues the [enhancement goal](enhancement-goal.md) from `127df8c`. The rendered construction audit retained the real models, materials, collision, moving world and 60 Hz simulation. A furnished 188-piece machine and a 367-piece extension retained useful GPU headroom. Enabling the recovered L-12 companion exposed periodic CPU stalls while it searched for work.

## Measured problem and change

The original selector checked reachability for every live structure, including floors and decorations, and collected all possible jobs before returning one. On the 369-piece fixture it made 369 route checks per idle search. Four searches during an eight-second sample took a median 32.741 ms and up to 38.661 ms each; the worst rendered frame in that sample was 46.185 ms.

The replacement filters serviceable producers first, retains lexical piece-ID order and storage insertion order, and returns the first eligible job in the existing priority. It resolves storage references once and shares reachability results only within that search. It does not retain route decisions across updates, so inventory, damage, movement and construction changes remain visible.

The first controlled rerun, before the subsequent motion fixes, made zero idle route checks. Median search time was 0.179 ms, maximum 0.180 ms; the worst frame in the matching sample was 7.097 ms. Cached sensor and arm references also eliminate repeated hierarchy searches. The active-job route checks and inventory commit rules remain in place.

Measurements use an RTX 3070, 1920×1080, Forward+/Vulkan, high quality, 4x MSAA and disabled VSync. Each scenario warms for three seconds, then rotates the playing camera for eight seconds. Full source geometry, materials and draw distances are retained. Periodically refreshed engine process/physics monitors are included in the raw reports but are not per-tick timings; companion update/search durations and frame intervals are measured directly. These samples establish the specific search improvement, not a universal frame-rate guarantee.

Final rerun, including the behavioral/visual fixes below:

| Scenario | Pieces | Median frame | Frame p95 | Maximum frame |
| --- | ---: | ---: | ---: | ---: |
| Starter | 2 | 3.655 ms | 4.729 ms | 48.755 ms |
| Furnished | 188 | 3.641 ms | 5.386 ms | 6.551 ms |
| Extended | 367 | 3.557 ms | 5.741 ms | 7.006 ms |
| L-12 idle | 369 | 3.604 ms | 5.970 ms | 7.079 ms |
| L-12 working | 369 | 3.529 ms | 6.240 ms | 13.489 ms |

Final idle search duration is 0.186 ms median / 0.202 ms maximum with zero route checks. Median GPU time remains 3.09–3.21 ms across these scenarios. Working updates still check current routes and now check body clearance too; their median is 0.453 ms versus 0.418 ms originally. The intended win is removing the periodic full-deck search stall, not claiming every individual operation is cheaper. The final parked companion also occupies a different position because idle drift is corrected.

## Live behavior and model presentation

Actual traversal testing found several separate defects:

- An automated companion with no job retained a destination at the world origin. It now parks at its present position during idle waits.
- The first nominal service position could sit in a neighboring cabinet's navigation margin. The companion now checks its body volume and the baked walking surface before selecting a side. Newly placed obstacles are respected even before navigation rebakes; fully enclosed stations supply no target.
- The model's binocular face is authored toward local −Z, but the native movement code pointed its rear along the path. It now faces its travel direction and turns toward equipment while servicing it.
- The service pose compared against a nonexistent `service` state. The actual `service-source` and `service-target` states now engage the sensor and manipulator pivots.
- The six authored wheel pivots were static. They now rotate from actual grounded displacement and stop when parked or blocked. Only the pivot roots are animated, avoiding double rotation of their material meshes.
- Authored track cleats sat above the model origin. Their actual lower bound now aligns with the physics feet, including the floor safety margin, so the visible tracks meet the deck.

These adjustments reuse the existing Blender-authored fieldwork model and its pivots. No mesh simplification, replacement textures, new chapters, altered job priorities, faster movement or shortened service timers were introduced. Inventory is still committed once, after both visits; interruptions do not strand stock on the robot.

## Verification and remaining work

The new suite compares the exact selected job against the previous selector across 512 seeded layouts with different storage contents, priorities, structure order, damage and blocked routes. It also tests an idle 500-piece deck, changed availability and missing/full storage. The live fixture uses the actual machine collision, navigation bake, station models, companion physics and stock containers. It includes adjacent equipment, complete obstruction, cancellation, parking, wheel motion, facing and deck contact.

The new suite passes all 29 checks in the native renderer, including 512 selector comparisons (72,998 legacy route checks versus 1,356 refined checks). Integration (108), the broader parity/navigation audit (132) and campaign polish (58) also pass: 327 assertions across these suites. Final rendered companion tests and asset import finish without warnings or errors. The inspected [producer service pose](previews/caretaker-service-source.png) and [storage service pose](previews/caretaker-service-target.png) preserve full in-game materials and lighting; their cameras are positioned for inspection. Complete logs remain in `test-results/godot-native/`.

Evidence: [original workload](results/construction-before.json), [search-only optimization](results/construction-search-only-after.json), [final workload](results/construction-after.json), [selector/live service tests](results/caretaker-workload.json).

An intermittent 33–49 ms spike also appeared in the starter scenario on some runs, before L-12 was active; it did not recur in every run and is not claimed fixed by this work. Further review should trace that startup/travel event, inspect broader character and track animation, and continue normal-speed campaign pacing and environmental/model refinement. The overall goal remains active.
