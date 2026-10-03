# Physical expedition equipment

The five major destinations now have physical service controls. Walk to the indicated instrument, interact, then disconnect and move to the next control. The instrument uses a local site panel; the wrist remains personal equipment and records. Completing service work opens access, and components are still collected individually at their existing stations.

| Playtest checkpoint | What to try |
| --- | --- |
| The Wake | Isolate the feed, arrest the visible rotor, and release the gyro cradle. |
| Relay Foundry | Route recovery power, release the local gantry lock, move its carriage, and latch the recovery bay. Collect the controller and servo separately. |
| The Quiet Array | Read both calibration records, adjust and latch each antenna at its own service wheel, then lock the phase. |
| Glass Orchard — either approach | Restore the missing isolator through its ground, bypass and energize controls. The other route-supplied isolator remains intact. |
| Meridian — either approach | Verify and seat the preserved archive, verify readback, and bring the transmitter feed online through its separate controls. Existing records still gate the solution. |

All service components are captive site equipment. These challenges consume no inventory items and require none of the optional crane, battery or quiet-drive equipment. Fixed floor and the return aisle remain available; no ground walking or mandatory jumping is involved. The Foundry gantry belongs to the site and does not require the optional Nomad crane.

The [later resource audit](later-resource-audit.md) accounts for both late routes, required rewards, optional purchases and recovery sources from current source. It distinguishes the absence of new mechanism material bills from live fuel burn and damage-repair costs; continuous-play resource timing remains unmeasured.

Movement lasts 1.4 simulation seconds. A player in a moving part's swept space prevents it from starting or pauses it safely. Step clear and it continues. The next operation is only committed after the machinery reaches its endpoint. Saving is refused while machinery moves, including after returning aboard; once it settles, the existing normal save conditions apply.

Older campaigns retain completed work. Existing partial safety steps resume at the corresponding physical control, calibration values are retained, and a completed shared instrument still exposes an unclaimed paired reward. Migration does not award that second reward. New snapshots store committed milestone IDs, not animation times or scene transforms. Loading establishes the saved final geometry without replaying completion events.

## Integration and source contract

- `godot/scripts/expedition_mechanisms.gd` owns the stable site/activity/control definitions and pure transition, migration and validation helpers. Physical milestones live inside the existing `polish.activities` record as optional `mechanism: {format:1, milestones:[...]}`. Legacy `step`, `values`, and `done` fields remain validated.
- `godot/scripts/expedition_activity.gd` extends the existing activity interface. It validates the live destination, proximity, clear reach, story requirements and operation order. Guidance uses a read-only description. Semantic events report real accepted/completed operations and rate-limited refusal reasons.
- `godot/scripts/expedition_mechanism_view.gd` owns all runtime actors under the current destination, local panels, collision guards, stable poses, animation and teardown. It reuses the existing authored story-instrument models with a small runtime machinery kit; there is no duplicate imported site asset or reward owner.
- `campaign.gd` retains the authority for journals, objectives, unique recovery and departure. Restoring a physical activity never directly grants a reward. `main.gd` retains menu/save authority; `session.gd` and `save_validation.gd` normalize and validate the saved activity records.

Current destination-local placement uses Wake root X19, Foundry X20 and Array/Orchard/Meridian X22 at Y16.03. The control positions are listed explicitly in `MMFExpeditionMechanisms.CONTROLS`; moving poses and collider extents are in the view. Existing story anchors, journals, required reward IDs, route-provided isolators, ground recovery and reserved gangway rules are retained. Earlier web-era layout notes using X17 do not describe these native locations.

Visual review led to aisle-facing instruments, ribbed surfaces on both sides of service shutters, full-travel guide rails, and removal of a gantry support that visually intersected its carriage path. No new heavyweight model import or background asset compilation is needed.

## Verification and practical limits

[Machine-readable results](results/physical-expeditions.json) separates these checks:

| Suite | Passing checks | Evidence |
| --- | ---: | --- |
| Pure mechanism state | 154 | Ordered/idempotent commands, valid and malformed snapshots, every legacy partial step, calibration tolerance, paired-reward proofs and route-provided isolators. |
| All-site physical traversal | 304 | Seven story checkpoint variants; actual movement input across supported paths to journals, local controls and recoveries, empty inventory, return to Nomad and normal departure. More than 550 m walked without ground recovery. |
| Motion/save lifecycle | 21 | Occupied sweep, mid-motion obstruction, pause/resume, aboard save refusal, stable endpoint restore, stale control rejection, restart during motion, same-pendant command continuity and bounded colliders across repeated loads. |
| Story/presentation regression | 76 | Existing campaign instrumentation, transmission, equipment and combat feedback behavior with local-control fixtures. |
| Checkpoint/menu regression | 290 | Every checkpoint, local station/build flow, separately saved playtests and unchanged normal-campaign saves. |
| Full campaign integration | 109 | Existing opening/boarding, all destination rewards and journals, normal departure, durable saves, final commitment, arrival and continuation; independently run by the integration reviewer. |

The 304-check traversal also passed with native Vulkan rendering at 1440×900. The Foundry prototype passed a further 39 checks at 1200×900 after final shared-geometry and guidance corrections. A final native art fixture passed 35 checks across all seven site variants after the panel-facing and guide-rail refinements. The 72 captures cover world controls, local panels, machinery endpoints and return paths. Final art stills use a separate posed fixture; they supplement the movement-input test rather than substituting for it.

The scripted routes establish reachability, collision safety and progression correctness. They do not establish that an unfamiliar player discovers each solution naturally or enjoys the duration. An uncoached full campaign session (E12/C05) remains pending, and no isolated performance claim is made from these correctness runs.

Representative native captures:

- [Foundry local service panel](previews/physical-expeditions/foundry-power-panel-4x3.png)
- [Foundry carriage clear of the recovery bay](previews/physical-expeditions/foundry-power-move-complete-4x3.png)
- [Wake cradle released](previews/physical-expeditions/wake-gyro-release-complete.png)
- [Array aligned and access restored](previews/physical-expeditions/array-array-lock-complete.png)
- [Orchard restored archive access](previews/physical-expeditions/orchard-caretaker-starboard-energize-complete.png)
- [Meridian captive archive carrier](previews/physical-expeditions/meridian-quiet-archive-seat-complete.png)
- [Final Array equipment and open shutter](previews/physical-expeditions/array-array-final-open.png)
- [Final Orchard access and full guide rails](previews/physical-expeditions/orchard-cold-vault-port-final-open.png)

The automated tests use isolated save directories and never replace the user's campaign. Reproduce with the bundled Godot executable, `--headless --path godot --script res://tests/<suite>.gd --fixed-fps 60`. Omit `--headless` for native traversal captures. `physical_expeditions.gd -- --foundry-only` limits the run to the prototype; `expedition_review.gd` performs the faster final art fixture.
