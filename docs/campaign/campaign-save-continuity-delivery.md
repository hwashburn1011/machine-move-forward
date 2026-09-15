# Campaign save continuity delivery

The campaign seed is now an owned save value. Loading a campaign adopts that
seed across world terrain, props and scenery, threat scheduling, enemy spawning,
salvage, loot, and dynamic radio and route generation. Starting New Game with a
requested seed creates the same ownership path instead of leaving an older
default seed in one subsystem. Tutorial skiff and grapple guidance remains
available through the normal encounter flow.

The full local suite passed 1,471 tests. The subsequent focused run passed 34
tests, including two new asset checks and a new saved-RNG-draw regression.
Malformed seed/distance and failed-art checks verify that rejected loads leave
the current campaign untouched. TypeScript, ESLint and production build passed.
The causal bug this slice addresses is concrete: opening a non-default seeded save through a
default URL reconstructed terrain and random streams from the wrong seed,
making the resumed campaign diverge. These changes make the seed explicit at
each owner boundary; they make no performance claim.

Radio Slice 2 now has a clean canonical `mmf-dev-seed` run. Its compact evidence
is in the continuity-validation directory alongside the preserved raw logs.

Wreck One Slice 3 now passes in the same canonical lineage: the trace was
accepted physically, the destination docked, the gangway was crossed, one
Course Gyro was recovered, and the player returned aboard to depart. The child
cold restore preserved health, inventory/resources, story, structures, damage,
seed and the single gyro; live clocks were allowed to advance. Evidence and
the model-ID correction from `relay-wreck` to `expedition-wreck` are recorded
in [the Wreck validation record](continuity-validation/wreck-summary.md). Broader Foundry,
ending and Survival continuity runs remain future coverage.

The full-art cross-seed smoke also passed 19 checks, including loading a
non-default save from a different URL seed and New Game requested-seed
ownership; see [the raw checks](continuity-validation/seed-restore-full-art.json).
This is seed and asset continuity evidence, not a performance benchmark or a
claim of universal camera quality. The retained [radio-area view](continuity-validation/seed-restore-deck.png)
is cramped; it does not establish comfortable camera clearance around every
authored obstacle. Full-art physical expedition traversal remains separate
from the normal-input continuity runs, which use procedural visuals.
