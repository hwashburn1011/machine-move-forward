# Later expedition progression and robot survival

User scope: implement radar route choices and discoverable machine equipment at appropriate later story milestones; remove food and water gameplay entirely. Do not implement the proposed L-12 logistics expansion.

## Progression contract

- Opening, scanner recovery, The Wake, and Relay Foundry retain their current order. No new radar choices or equipment are granted at campaign start.
- Completing the Quiet Array with the course actuator unlocks the three-contact route radar. The receiver must have power; selecting a signal shows bearing, reachability, estimated fuel, likely contents, and credible patrol information.
- After the Array and the optional rooftop workshop recovery, an optional recovery gantry offers the salvage crane. Recover it physically, return aboard, then place the paid installation. A heavy crate at the site demonstrates its use; later travel offers more heavy cargo.
- After Glass Orchard, an optional substation offers a battery bank. It charges from spare generator output and temporarily backs up navigation/receiver equipment when normal supply fails.
- After Glass Orchard and a previous equipment recovery plus another 600 m of travel, a later optional relay service site offers quiet-running hardware. It trades travel speed and generator output for slower scout detection. It does not cancel existing pursuit.
- Discoveries remain optional and repeatable until recovered. Recovery and installation are separate, saved steps; completed hardware is never awarded twice. Existing campaigns become eligible only for milestones they already earned.

## Removal and migration

- Remove hunger/thirst meters, drains, sprint/healing penalties, consumption actions, food recipes, production, and food/water rewards.
- Retain fuel, player/structure damage, repair kits, and ordinary repairs. Human history and the Orchard seed archive remain story evidence, not player nourishment mechanics.
- Convert legacy water to fuel and rations/greens to scrap, including stored inventory, pending cargo, and unclaimed rewards. Preserve amounts and avoid overflow loss.
- Retire food/water construction from new builds. Existing installations remain salvageable; seed preservation is decorative. L-12 stays a companion without gardening duties.

## Delivery checklist

- [x] Robot-only survival loop, presentation, rewards, and save migration.
- [x] Persisted three-contact radar, story/power gates, selection, expiry, route execution, and real patrol encounters.
- [x] Authored equipment and recovery site, interactions, installation gates, crane/battery/quiet functionality.
- [x] Focused gameplay and migration tests; update obsolete food/water expectations while preserving unrelated regressions.
- [x] Native rendered review, readable terminal, physical equipment and safe expedition paths.
- [x] Results and player-facing progression handoff.

Delivery: [progression guide, evidence and validation scope](../../godot-port/later-expeditions.md).
The focused suite passes 84 checks headlessly and with native Vulkan rendering.
Full manual campaign pacing and balance review are outside these fixture checks.
