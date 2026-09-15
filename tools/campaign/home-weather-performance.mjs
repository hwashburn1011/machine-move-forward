/** Optional full-art fixture used by performance-smoothness.mjs --home-weather. */
export async function configureHomeWeather(page) {
  return page.evaluate(() => {
    const g = globalThis.__game.game;
    g.firstRun.restore({
      completed: [
        'salvage',
        'build-refinery',
        'refine-components',
        'build-workbench',
        'build-defense',
        'survive-boarding',
        'repair',
      ],
      counters: {},
    });
    g.tutorialReadyAt = null;
    g.story.restore({
      format: 2,
      completed: ['wreck-one', 'relay-foundry', 'quiet-array'],
      recoveredUniques: ['course-gyro'],
      active: null,
      journalArchive: [],
    });
    g.course.setTier(2);
    g.build.clear();
    const ids = [];
    for (const cell of g.machine.deckCells.filter((c) => c.y === 0)) {
      if (!g.build.place({ piece: 'floor', cell, rotation: 0 }, true)) continue;
      const piece = ['chair', 'table', 'rug', 'shelf'][ids.length % 4];
      const placed = g.build.place({ piece, cell, rotation: 0 }, true);
      if (placed) ids.push(placed.instanceId);
      if (ids.length === 8) break;
    }
    if (ids.length !== 8) throw Error('Expected eight supported home furnishings');
    const shelfId = ids.find((id) => g.build.instance(id).definitionId === 'shelf');
    g.build.setKeepsake(shelfId, 'course-gyro', ['course-gyro']);
    g.dustFront.restore(
      { format: 1, phase: 'front', elapsedS: 10, nextAtM: 600, sequence: 0 },
      g.world.distanceTraveled,
    );
    globalThis.__homePerfShelf = shelfId;
    return {
      pieces: ids.map((id) => g.build.instance(id).definitionId),
      weatherEligible: g.weatherEligible,
      skyBakes: g.sky.bakes,
      trianglesPerKit: 31800,
      weather: g.dustFront.snapshot(),
    };
  });
}

export async function soakHomeFurniture(page) {
  return page.evaluate(async () => {
    const g = globalThis.__game.game;
    g.stop();
    g.enemies.despawnAll();
    g.vehicleScene.clear();
    g.pendingBoardingFinish = null;
    g.player.teleport({ x: 5.6, y: 15.8, z: 1.5 });
    const original = g.build.instance(globalThis.__homePerfShelf);
    if (!original) throw Error('Missing soak shelf');
    const known = ['course-gyro'];
    const metrics = () => ({
      ...g.renderer.three.info.memory,
      programs: g.renderer.three.info.programs.length,
      bodies: g.physics.world.bodies.len(),
      colliders: g.physics.world.colliders.len(),
      structures: g.build.serialise().length,
    });
    // Placement is free in this isolated fixture; this tests mesh/physics/state lifetime,
    // not resource conservation (covered by paid build tests).
    let id = original.instanceId;
    const cycle = async (i) => {
      g.build.demolish(id);
      const placed = g.build.place({ piece: 'shelf', cell: original.cell, rotation: i % 4 }, true);
      if (!placed) throw Error(`Shelf placement failed at ${i}`);
      id = placed.instanceId;
      if (!g.build.setKeepsake(id, 'course-gyro', known)) throw Error(`Assignment failed at ${i}`);
      const moved = g.build.relocate(
        id,
        { piece: 'shelf', cell: original.cell, rotation: (i + 1) % 4 },
        {},
      );
      if (!moved.ok) throw Error(`Shelf rotation failed at ${i}: ${JSON.stringify(moved)}`);
      if (g.build.serialise().find((p) => p.instanceId === id)?.state?.factId !== 'course-gyro')
        throw Error(`Record lost at ${i}`);
      g.render(0);
      await new Promise(requestAnimationFrame);
    };
    for (let i = 0; i < 8; i++) await cycle(i);
    const before = metrics();
    for (let i = 0; i < 100; i++) await cycle(i);
    const after = metrics();
    const bounded = Object.keys(before).every((key) => before[key] === after[key]);
    if (!bounded) throw Error(`Unbounded shelf resources: ${JSON.stringify({ before, after })}`);
    return { cycles: 100, before, after, bounded };
  });
}
