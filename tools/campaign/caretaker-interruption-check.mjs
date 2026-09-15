/**
 * Reusable stopped-game checks for the caretaker's interruption contract.
 * The caller supplies the real dock/crate/garden fixture from caretaker-game-check.
 * Every mutation below is a temporary QA interruption and is cleaned before the
 * next case; this helper does not claim normal player timing or progression.
 */
export async function checkCaretakerInterruptions(page, fixture) {
  if (!fixture?.dock || !fixture?.crate || !fixture?.garden)
    throw new Error('caretaker interruption fixture is incomplete');
  return page.evaluate(async (ids) => {
    const g = globalThis.__game.game;
    const results = [];
    const clean = () => {
      g.state.playerDead = false;
      g.state.paused = false;
      g.buildMode = false;
      g.closePanels(false);
      g.machine.power.restore({ fuel: 20 });
      g.caretaker.reset();
      g.caretaker.recruit();
      g.caretaker.setMode('steward');
      g.caretakerPlanAt = 0;
      g.build
        .crateContainer(ids.crate)
        .restore([{ itemId: 'water', count: 1 }, ...new Array(11).fill(null)]);
    };
    const run = (name, interrupt) => {
      clean();
      g.fixedUpdate(1 / 60);
      const started = g.caretaker.snapshot();
      const before = g.build.crateContainer(ids.crate).serialise();
      interrupt();
      g.fixedUpdate(1 / 60);
      const after = g.build.crateContainer(ids.crate).serialise();
      const state = g.caretaker.snapshot();
      results.push({
        name,
        ok: !!started.job && !state.job && JSON.stringify(before) === JSON.stringify(after),
        detail: { started, state, before, after },
      });
      clean();
    };
    run('panel-open', () => g.openCaretaker(ids.dock));
    run('build-mode', () => {
      g.buildMode = true;
    });
    run('player-dead', () => {
      g.state.playerDead = true;
    });
    run('dock-power-loss', () => g.machine.power.restore({ fuel: 0 }));
    clean();
    const savedDock = g.build.serialise().find((piece) => piece.instanceId === ids.dock);
    if (!savedDock) throw new Error('caretaker dock disappeared before demolition check');
    const bodiesBefore = g.physics.bodyCount;
    const collidersBefore = g.physics.colliderCount;
    g.build.demolish(ids.dock);
    g.fixedUpdate(1 / 60);
    const bodiesAfterRemove = g.physics.bodyCount;
    const collidersAfterRemove = g.physics.colliderCount;
    const recreated = g.build.place(
      { piece: savedDock.definitionId, cell: savedDock.cell, rotation: savedDock.rotation },
      true,
    );
    g.fixedUpdate(1 / 60);
    const actors = g.caretakerActor ? 1 : 0;
    results.push({
      name: 'dock-demolition-recreate',
      ok:
        bodiesAfterRemove < bodiesBefore &&
        collidersAfterRemove < collidersBefore &&
        !!recreated &&
        actors === 1 &&
        g.caretaker.snapshot().recruited,
      detail: {
        bodiesBefore,
        bodiesAfterRemove,
        collidersBefore,
        collidersAfterRemove,
        recreated: recreated?.instanceId ?? null,
        actors,
      },
    });
    clean();
    if (recreated) {
      const oldActor = g.caretakerActor;
      let moved = null;
      for (const cell of g.machine.deckCells.filter((cell) => cell.y !== savedDock.cell.y)) {
        g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
        const placement = { piece: 'caretaker-dock', cell, rotation: 0 };
        if (!g.build.canRelocate(recreated.instanceId, placement).ok) continue;
        // The candidate must also have a physically clear service position.
        const endpoint = g.caretakerNavigation.cellWorld(cell);
        if (!g.caretakerNavigation.approach(endpoint)) continue;
        moved = g.build.relocate(recreated.instanceId, placement);
        if (moved.ok) break;
      }
      const bodies = g.physics.bodyCount;
      g.fixedUpdate(1 / 60);
      results.push({
        name: 'moving dock to another deck redeploys one caretaker',
        ok:
          !!moved?.ok &&
          !!g.caretakerActor &&
          g.caretakerActor !== oldActor &&
          oldActor.root.parent === null &&
          g.physics.bodyCount === bodies &&
          g.caretaker.snapshot().recruited,
        detail: {
          moved: moved?.ok,
          actor: !!g.caretakerActor,
          deck: g.caretakerDockLevel,
          bodiesBefore: bodies,
          bodiesAfter: g.physics.bodyCount,
        },
      });
    }
    return results;
  }, fixture);
}
