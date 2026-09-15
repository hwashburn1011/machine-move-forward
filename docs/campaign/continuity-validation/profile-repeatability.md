# Crowded profile repeatability

These are diagnostic samples from the full authored build on an RTX 3070 at
1920×1080 Medium. They preserve the raw JSON from the two collection passes:

- [Initial repeatability pass](continuity-profile-repeatability.json): 60.00
  and 60.00 FPS, with 0/0 frames over 25 ms and 0/0 over 50 ms.
- [Clean repeatability pass](continuity-profile-clean-repeatability.json):
  60.00 and 59.50 FPS, with 0/4 frames over 25 ms and 0/0 over 50 ms.

The first pass had an initial physics collider count mismatch (43, then 45),
so it is retained as a collection with mismatched starting state. The clean pass began at 43
colliders for both samples. Both passes reached 47 colliders after the 180
frame warm-up, and both had 32 physics bodies. The authored player, tactics
model, and all eight animated enemy visuals were ready in every sample.

Initial clocks, machine pose, fuel, damage, movement modifiers, camera state,
roster, and positions match. Warm-up machine state and clocks also match; the
enemy trajectories and final states still differ after warm-up. The contribution
of physics contact ordering and AI paths has not been isolated. Tactics sensor
cleanup is stable at the warm-up
boundary: 47 colliders in every recorded sample.

This evidence describes collection repeatability only. It claims no production
performance improvement and contains no production runtime change or baseline
comparison.
