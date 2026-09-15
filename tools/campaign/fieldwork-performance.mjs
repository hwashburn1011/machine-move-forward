/** Original authored L-12 and dock on the real machine; fixture facts are explicit. */
export async function configureFieldwork(page) {
  return page.evaluate(async () => {
    const g = globalThis.__game.game;
    if (!(await g.prepareCampaignArt(['fieldwork-kit'])))
      throw Error('Fieldwork asset preparation failed');
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
      completed: ['wreck-one', 'relay-foundry'],
      recoveredUniques: ['course-gyro'],
      active: null,
      journalArchive: [],
    });
    g.caretaker.recruit();
    const cells = g.machine.deckCells
      .filter((c) => c.y === 0)
      .sort((a, b) => (a.x * 2 - 4) ** 2 + (a.z * 2) ** 2 - ((b.x * 2 - 4) ** 2 + (b.z * 2) ** 2));
    let dock = null,
      generator = null;
    for (const cell of cells) {
      g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
      const piece = dock ? 'generator' : 'caretaker-dock';
      const placed = g.build.place({ piece, cell, rotation: 0 }, true);
      if (placed) {
        if (!dock) dock = placed;
        else {
          generator = placed;
          break;
        }
      }
    }
    if (!dock || !generator) throw Error('No supported fieldwork fixture');
    g.machine.power.addFuel(100);
    g.caretaker.setMode('companion');
    g.closePanels(false);
    g.state.paused = false;
    g.tickCaretaker(1 / 60);
    return {
      dock: dock.instanceId,
      generator: generator.instanceId,
      actor: !!g.caretakerActor,
      assetBytes: 5097532,
    };
  });
}

export async function soakFieldwork(page) {
  return page.evaluate(async () => {
    const g = globalThis.__game.game;
    g.stop();
    g.enemies.despawnAll();
    g.vehicleScene.clear();
    g.gunboatScene.clear();
    g.closePanels(false);
    g.state.paused = false;
    const metrics = () => ({
      ...g.renderer.three.info.memory,
      programs: g.renderer.three.info.programs.length,
      bodies: g.physics.world.bodies.len(),
      colliders: g.physics.world.colliders.len(),
      demand: g.machine.power.registeredDemand,
    });
    const cycle = async () => {
      g.clearCaretakerActor();
      g.tickCaretaker(1 / 60);
      g.physics.step();
      g.render(0);
      await new Promise(requestAnimationFrame);
      if (!g.caretakerActor) throw Error('L-12 failed to respawn in lifetime fixture');
    };
    for (let i = 0; i < 8; i++) await cycle();
    const before = metrics();
    for (let i = 0; i < 100; i++) await cycle();
    const after = metrics();
    if (!Object.keys(before).every((key) => before[key] === after[key]))
      throw Error('L-12 lifetime resources grew: ' + JSON.stringify({ before, after }));
    return { cycles: 100, before, after, bounded: true };
  });
}
