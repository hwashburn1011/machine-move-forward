/** Production navigation and Rapier movement on the actual Nomad supports.
 * This isolated fixture advances the machine once per actor/physics tick.
 * Steering, route, controller, gravity and collision methods stay untouched.
 */
export async function caretakerStairPhysics() {
  const { Vector3 } = await import('/node_modules/.vite/deps/three.js');
  const { loadModel } = await import('/src/art/ModelLoader.ts');
  const { CaretakerNavigation } = await import('/src/companion/CaretakerNavigation.ts');
  const { CaretakerActor } = await import('/src/companion/CaretakerActor.ts');
  const g = globalThis.__game.game;
  g.stop();
  g.build.clear();
  g.enemies.despawnAll();
  g.machine.setPose({ heave: 0, pitch: 0, roll: 0 });
  g.machine.fixedUpdate(1 / 60);
  g.machine.group.updateMatrixWorld(true);
  const collision = await loadModel('/models/authored/iron-nomad-collision.glb');
  if (!collision) throw new Error('Authored collision did not load');
  collision.scene.updateMatrixWorld(true);
  const authoredBody = g.physics.createDrivenBody();
  let authoredMeshes = 0;
  collision.scene.traverse((node) => {
    if (!node.isMesh) return;
    const geo = node.geometry.clone().applyMatrix4(node.matrixWorld);
    const p = geo.getAttribute('position');
    g.physics.addTrimeshTo(
      authoredBody,
      new Float32Array(p.array),
      geo.index
        ? new Uint32Array(geo.index.array)
        : Uint32Array.from({ length: p.count }, (_, i) => i),
      { kind: 'machine', name: node.name },
    );
    authoredMeshes++;
    geo.dispose();
  });
  g.physics.step();
  let actor;
  const clearance = new Vector3();
  const nav = new CaretakerNavigation(g.machine, g.build, (feet) => {
    clearance.copy(feet).y += 0.7;
    return !g.physics.overlapsSphere(clearance, 0.32, actor?.collider, true);
  });
  actor = new CaretakerActor({
    physics: g.physics,
    machine: g.machine,
    routeFor: (a, b) => nav.routeFor(a, b),
    routeVersion: () => 0,
  });
  const v = (level, z) => new Vector3(-2, 14.85 + 3 * level, z);
  const world = (local) => g.machine.group.localToWorld(local.clone());
  let distance = 0;
  const step = (target, moving) => {
    distance += moving ? 7.4 / 60 : 0;
    g.machine.setPose(moving ? g.machine.poseAt(distance) : { heave: 0, pitch: 0, roll: 0 });
    g.machine.fixedUpdate(1 / 60);
    g.machine.group.updateMatrixWorld(true);
    authoredBody.setTranslation(g.machine.group.position, true);
    authoredBody.setRotation(g.machine.group.quaternion, true);
    actor.fixedUpdate(1 / 60, target ? world(target) : null);
    g.physics.step();
  };
  const run = (goal, moving, cadence, maxTicks = 1800) => {
    let accumulator = 0,
      ticks = 0,
      frames = 0;
    let travel = 0,
      maxDelta = 0;
    const trace = [];
    while (ticks < maxTicks && !actor.reached(world(goal))) {
      accumulator += 1 / cadence;
      frames++;
      while (accumulator >= 1 / 60 && ticks < maxTicks) {
        const before = actor.position.clone();
        step(goal, moving);
        const delta = before.distanceTo(actor.position);
        maxDelta = Math.max(maxDelta, delta);
        travel += delta;
        accumulator -= 1 / 60;
        if (ticks++ % 120 === 0)
          trace.push({
            tick: ticks,
            feet: g.machine.group.worldToLocal(actor.position.clone()).toArray(),
            status: actor.status,
          });
        if (actor.reached(world(goal))) break;
      }
    }
    return {
      reached: actor.reached(world(goal)),
      ticks,
      frames,
      travel,
      maxDelta,
      finalFeet: g.machine.group.worldToLocal(actor.position.clone()).toArray(),
      trace,
    };
  };
  const trials = [];
  for (const cadence of [30, 60, 144])
    for (const moving of [false, true])
      for (const lower of [-2, -1])
        for (const up of [true, false]) {
          step(null, moving);
          const start = v(lower + (up ? 0 : 1), up ? -3.4 : 3.4);
          const goal = v(lower + (up ? 1 : 0), up ? 3.4 : -3.4);
          actor.spawn(world(start));
          const proposed = nav.routeFor(world(start), world(goal));
          const link = g.machine.fixedLinks.find(
            (pair) => pair.some((c) => c.y === lower) && pair.some((c) => c.y === lower + 1),
          );
          const fromCell = link.find((c) => c.y === lower + (up ? 0 : 1));
          const toCell = link.find((c) => c.y === lower + (up ? 1 : 0));
          const portal = nav.portalFor(fromCell, toCell);
          const blocked = portal?.samples
            .filter((p) => !nav.isClear(p))
            .map((p) => g.machine.group.worldToLocal(p.clone()).toArray());
          const result = run(goal, moving, cadence);
          trials.push({
            cadence,
            moving,
            lower,
            up,
            blocked,
            proposed: proposed?.map((p) => p.toArray()),
            ...result,
          });
          if (!result.reached) break;
        }
  const before = { bodies: g.physics.bodyCount, colliders: g.physics.colliderCount };
  actor.spawn(world(v(-2, -3.4)));
  const crossings = [];
  if (trials.every((t) => t.reached)) {
    const destinations = [v(-1, 3.4), v(0, 3.4), v(-1, -3.4), v(-2, -3.4)];
    for (let n = 0; n < 100; n++) {
      const result = run(destinations[n % 4], true, 60);
      crossings.push({ index: n, ...result, trace: undefined });
      if (!result.reached) break;
    }
  }
  const after = {
    bodies: g.physics.bodyCount,
    colliders: g.physics.colliderCount,
    routeCache: nav.pathCache.size,
  };
  actor.dispose();
  const disposed = { bodies: g.physics.bodyCount, colliders: g.physics.colliderCount };
  return {
    authoredMeshes,
    trials,
    crossings,
    before,
    after,
    disposed,
    navigation: { links: [...nav.filteredGraph.links], points: [...nav.clearLocalPoints] },
  };
}
