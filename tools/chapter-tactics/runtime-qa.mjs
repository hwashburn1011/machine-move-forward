import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.MMF_QA_OUT ?? 'test-results/chapter-tactics';
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
await mkdir(out, { recursive: true });
let frameSample = null;
const checks = [],
  errors = [];
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(
    `${site}?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=chapter-tactics`,
  );
  await page.waitForFunction(() => globalThis.__game?.game?.player.visual.isAnimated, null, {
    timeout: 180000,
  });
  checks.push(
    ...(await page.evaluate(async () => {
      const g = globalThis.__game.game,
        V = g.player.worldPosition.constructor;
      const results = [],
        check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
      g.loop.stop();
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
      g.refreshFirstRunObjective();
      g.enemies.despawnAll();
      g.tacticsVisual.clear();
      g.closePanels(false);
      g.state.paused = false;
      g.state.playerDead = false;
      g.player.teleport({ x: 6, y: 15.96, z: 4 });
      g.machine.power.registerConsumer({
        id: g.radioPowerConsumerId,
        draw: 1,
        priority: 'station',
      });
      g.tickPower(0.01);
      g.progression.earlyRadioDrop.restore({
        status: 'found',
        armedAtSimTime: 0,
        foundAtSimTime: 1,
        foundAtDistance: 1,
        eligibleChestsOpened: 1,
      });
      const raidSave = {
        format: 2,
        completed: [],
        recoveredUniques: [],
        active: {
          expeditionId: 'wreck-one',
          routeId: null,
          phase: 'raids',
          arrivalDistance: null,
          journalsRead: [],
          scriptedEncounter: 'resolved',
        },
      };
      g.story.restore(raidSave);
      g.radioRaids.restore({ wave: 0, remaining: 0 });
      check('No offer before a raid victory', !g.story.snapshot(0).radioTraceOffer);
      g.radioRaids.started();
      g.finishBoarding('defended');
      check(
        'Game raid resolution earns optional trace',
        g.story.snapshot(0).radioTraceOffer && g.radioRaids.toSave().wave === 1,
      );
      g.openRadio();
      g.closePanels(false);
      check(
        'Closing radio keeps endless raid loop',
        g.story.currentPhase === 'raids' && g.story.permitsRadioRaids,
      );
      g.machine.power.unregisterConsumer(g.radioPowerConsumerId);
      g.beginWreckTrace();
      check('Unpowered trace refuses departure', g.story.currentPhase === 'raids');
      g.machine.power.registerConsumer({
        id: g.radioPowerConsumerId,
        draw: 1,
        priority: 'station',
      });
      g.tickPower(0.01);
      const blocker = g.enemies.spawn('warden', new V(6, 15.96, 2));
      g.beginWreckTrace();
      check('Active enemy blocks trace', g.story.currentPhase === 'raids');
      blocker.despawn();
      g.openRadio();
      check(
        'Trace button enabled when safe',
        !document.querySelector('[data-radio-trace-button]').disabled,
        g.radioTraceView(),
      );
      document.querySelector('[data-radio-trace-button]').click();
      check(
        'Actual radio button starts Wreck approach',
        g.story.currentPhase === 'approach' && g.destination.active,
        g.radioTraceView(),
      );

      const dock = () => {
        const arrival = g.story.toSave().active.arrivalDistance;
        g.world.reset(arrival);
        g.machine.movement.speed = 0;
        // Shorten travel only. These are the live update/effect/collider paths.
        for (let i = 0; i < 3; i++) {
          g.updateStory();
          g.destination.fixedUpdate(g.world.distanceTraveled);
        }
        return g.story.currentPhase === 'docked' && g.destination.docked;
      };
      const collect = () => {
        const targets = g.destination.interactables.filter((x) => x.kind === 'unique');
        return targets.map((target) => {
          g.player.teleport({ x: target.position.x, y: target.position.y, z: target.position.z });
          return { id: target.id, ok: g.collectStoryUnique(target.id) };
        });
      };
      const depart = () => {
        g.player.teleport({ x: 6, y: 15.96, z: 4 });
        g.requestExpeditionDeparture();
        const arrival = g.story.toSave().active?.arrivalDistance;
        if (arrival !== null && arrival !== undefined) g.world.reset(arrival + 13);
        g.machine.movement.speed = 1;
        g.updateStory();
      };
      if (g.story.currentPhase === 'approach') {
        check(
          'Wreck moors and deploys physical gangway',
          dock(),
          g.story.snapshot(g.world.distanceTraveled),
        );
        const gyro = collect();
        check(
          'Actual destination pickup grants Course Gyro',
          gyro.some((x) => x.ok),
          gyro,
        );
        depart();
        g.tickPower(0.01);
        check('Wreck departure exposes route choice', g.story.currentPhase === 'route-selection');
        g.machine.power.unregisterConsumer(g.helmPowerConsumerId);
        g.selectStoryRoute('foundry-direct');
        check(
          'Unpowered helm refuses route commitment',
          g.story.currentPhase === 'route-selection',
        );
        g.machine.power.registerConsumer({
          id: g.helmPowerConsumerId,
          draw: 1,
          priority: 'station',
        });
        g.tickPower(0.01);
        const routeSave = g.buildSave();
        await g.saves.save('chapter-route-qa', routeSave);
        for (const route of ['foundry-direct', 'foundry-detour']) {
          if (route === 'foundry-detour') {
            await g.loadFrom('chapter-route-qa');
            g.tickPower(0.01);
            g.loop.stop();
          }
          g.closePanels(false);
          g.state.paused = false;
          g.selectStoryRoute(route);
          check(
            `${route} commits via powered helm`,
            g.story.currentPhase === 'approach' && g.story.snapshot(0).routeId === route,
            g.routeRefusal,
          );
          if (g.story.currentPhase !== 'approach') continue;
          const arrival = g.story.toSave().active.arrivalDistance;
          g.world.reset(arrival - 400);
          g.updateStory();
          if (route === 'foundry-direct') {
            check(
              'Direct route starts its existing gunboat encounter',
              g.gunboatScene.active || g.scriptedGunboatPending,
            );
            g.gunboatScene.manager?.damageHull?.(10000);
            g.finishGunboat('hull');
            g.gunboatScene.clear();
            g.story.resolveScriptedEncounter();
            g.scriptedGunboatPending = false;
          } else
            check(
              'Detour avoids scripted gunboat',
              !g.gunboatScene.active && !g.scriptedGunboatPending,
            );
          check(`${route} Foundry docking`, dock(), g.story.snapshot(g.world.distanceTraveled));
          const loot = collect();
          check(
            `${route} both unique rewards collected`,
            loot.length === 2 && loot.every((x) => x.ok),
            loot,
          );
          check(
            `${route} automation blueprints unlocked`,
            g.progression.has('automatic-salvage-collector') &&
              g.progression.has('automatic-defense-turret'),
          );
          depart();
          check(
            `${route} durable chapter completion resumes raids`,
            g.story.snapshot(0).chapterComplete &&
              g.story.permitsRadioRaids &&
              !g.destination.active,
          );
          const completed = g.buildSave();
          await g.saves.save(`chapter-${route}-qa`, completed);
          await g.loadFrom(`chapter-${route}-qa`);
          g.loop.stop();
          check(
            `${route} completion survives actual save/load`,
            g.story.currentPhase === 'complete' &&
              g.story.permitsRadioRaids &&
              g.progression.has('automatic-defense-turret'),
          );
          g.closePanels(false);
          g.radioRaids.restore({ wave: 3, remaining: 0 });
          g.updateRadioRaids(1);
          check(`${route} survival schedules another real boarding ship`, g.vehicleScene.active);
          g.raidMissions.cancelTransient();
          g.vehicleScene.clear();
        }
        const legacy = {
          ...routeSave,
          world: { ...routeSave.world, story: raidSave, radioRaids: { wave: 2, remaining: 60 } },
        };
        await g.saves.save('chapter-legacy-qa', legacy);
        await g.loadFrom('chapter-legacy-qa');
        g.loop.stop();
        check(
          'Legacy completed raids backfill trace via loadFrom',
          g.story.snapshot(0).radioTraceOffer,
        );
      }
      return results;
    })),
  );
  await page.screenshot({ path: `${out}/chapter-runtime.png` });
  checks.push(
    ...(await page.evaluate(async () => {
      const g = globalThis.__game.game,
        V = g.player.worldPosition.constructor;
      const results = [],
        check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
      g.loop.stop();
      g.closePanels(false);
      g.enemies.despawnAll();
      g.raidMissions.cancelTransient();
      g.tacticsVisual.clear();
      g.vehicleScene.clear();
      g.state.playerDead = false;
      g.state.paused = false;
      g.freeCamera = null;
      g.player.teleport({ x: 6, y: 15.96, z: 4 });
      g.build.place({ piece: 'floor', cell: { x: 3, y: 0, z: 0 }, rotation: 0 }, true);
      const piece = g.build.place(
        { piece: 'crate', cell: { x: 3, y: 0, z: 0 }, rotation: 0 },
        true,
      );
      check('Place actual supply crate', piece !== null);
      if (!piece) return results;
      const source = g.build.crateContainer(piece.instanceId);
      source.add('scrap', 20);
      let wave = 2;
      while (g.raidMissions.start(g.state.seed, wave) !== 'theft') wave++;
      g.raidMissions.cancelTransient();
      g.vehicleScene.spawn('starboard', false, ['warden', 'bastion']);
      g.vehicleManager.state.phase = 'boarding';
      const carrier = g.enemies.spawn('warden', new V(6, 15.96, 4));
      g.player.teleport({ x: -6, y: 15.96, z: 4 });
      g.physics.step();
      g.raidMissions.start(g.state.seed, wave);
      g.raidMissions.onBoarder(carrier);
      check(
        'Theft selects live stable crate',
        g.raidMissions.ledger.snapshot?.targetId === piece.instanceId,
        g.raidMissions.ledger.snapshot,
      );
      const move = (at) => {
        carrier.position.copy(at);
        carrier.previousPosition.copy(at);
        carrier.handle.body.setTranslation(at, true);
        g.physics.step();
      };
      const approach = g.raidMissions.storageApproach(piece.instanceId, carrier)?.clone();
      check('Supply target has a reachable deck approach', !!approach, approach?.toArray());
      if (!approach) return results;
      const pathTrace = [];
      for (let i = 0; i < 900 && g.raidMissions.ledger.snapshot?.state === 'intent'; i++) {
        g.raidMissions.update(1 / 60);
        g.enemies.fixedUpdate(
          1 / 60,
          g.player.worldPosition,
          g.player.stats,
          g.build.navGraph,
          null,
          g.build,
          g.machine.damage,
        );
        g.physics.step();
        if (i % 60 === 0) pathTrace.push(carrier.worldPosition.toArray());
      }
      check(
        'Carrier walks to storage using live navigation and collision',
        g.raidMissions.ledger.snapshot?.state === 'carrying',
        pathTrace,
      );
      check(
        'Actual pickup takes exactly six scrap',
        source.count('scrap') === 14 && g.raidMissions.ledger.snapshot?.cargo?.count === 6,
        g.raidMissions.ledger.snapshot,
      );
      if (g.raidMissions.ledger.snapshot?.state !== 'carrying') return results;
      g.vehicleManager.damageHook(10000);
      g.raidMissions.update(0.1);
      check(
        'Hook cut blocks escape but retains recoverable cargo',
        g.raidMissions.ledger.snapshot?.cargo?.count === 6 &&
          carrier.tacticalSnapshot.missionTarget === null,
      );
      source.clear();
      source.add('components', 100000);
      g.inventory.clear();
      g.inventory.add('components', 100000);
      carrier.takeDamage(10000);
      check(
        'Full inventory and source preserve exact recovered ledger',
        g.raidMissions.ledger.recoveredLedger.reduce((n, c) => n + c.count, 0) === 6,
        g.raidMissions.ledger.toSave(),
      );
      g.raidMissions.onKilled(carrier.id);
      check(
        'Duplicate kill cannot duplicate recovery',
        g.raidMissions.ledger.recoveredLedger.reduce((n, c) => n + c.count, 0) === 6,
      );
      const saved = g.buildSave();
      await g.saves.save('chapter-cargo-qa', saved);
      await g.loadFrom('chapter-cargo-qa');
      g.loop.stop();
      check(
        'Overflow survives actual save and load',
        g.raidMissions.ledger.recoveredLedger.reduce((n, c) => n + c.count, 0) === 6,
      );
      g.inventory.clear();
      g.raidMissions.collectRecovered();
      check(
        'Recovery can be collected exactly once',
        g.inventory.count('scrap') === 6 && g.raidMissions.ledger.recoveredLedger.length === 0,
      );
      g.raidMissions.collectRecovered();
      check('Repeated collection does not duplicate', g.inventory.count('scrap') === 6);
      g.raidMissions.cancelTransient();
      g.enemies.despawnAll();
      g.vehicleScene.clear();
      const escapeSource = g.build.crateContainer(piece.instanceId);
      escapeSource.clear();
      escapeSource.add('scrap', 12);
      g.player.teleport({ x: -6, y: 15.96, z: 4 });
      g.vehicleScene.spawn('starboard', false, ['warden', 'bastion']);
      g.vehicleManager.state.phase = 'boarding';
      const escaping = g.enemies.spawn('warden', new V(6, 15.96, 4));
      g.raidMissions.start(g.state.seed, wave);
      g.raidMissions.onBoarder(escaping);
      for (let i = 0; i < 1200 && g.raidMissions.ledger.snapshot?.state !== 'escaped'; i++) {
        g.raidMissions.update(1 / 60);
        g.enemies.fixedUpdate(
          1 / 60,
          g.player.worldPosition,
          g.player.stats,
          g.build.navGraph,
          null,
          g.build,
          g.machine.damage,
        );
        g.physics.step();
      }
      check(
        'Unopposed carrier walks back and escapes via held grapple',
        g.raidMissions.ledger.snapshot?.state === 'escaped' && !escaping.isActive,
        g.raidMissions.ledger.snapshot,
      );
      check(
        'Successful theft loses only its bounded stack',
        escapeSource.count('scrap') === 6 && g.raidMissions.ledger.recoveredLedger.length === 0,
      );
      g.raidMissions.cancelTransient();
      g.enemies.despawnAll();
      g.vehicleScene.clear();
      g.vehicleScene.spawn('starboard', false, ['warden', 'bastion']);
      g.vehicleManager.state.phase = 'boarding';
      const rerouted = g.enemies.spawn('warden', new V(6, 15.96, 4));
      g.raidMissions.start(g.state.seed, wave);
      g.raidMissions.onBoarder(rerouted);
      g.build.place({ piece: 'floor', cell: { x: 3, y: 0, z: -2 }, rotation: 0 }, true);
      const relocation = g.build.relocate(piece.instanceId, {
        piece: 'crate',
        cell: { x: 3, y: 0, z: -2 },
        rotation: 0,
      });
      g.raidMissions.update(0.01);
      check(
        'Relocated storage keeps its identity and retargets the carrier',
        relocation.ok &&
          g.raidMissions.ledger.snapshot?.targetId === piece.instanceId &&
          rerouted.tacticalSnapshot.missionTarget?.z < 0 &&
          g.build.crateContainer(piece.instanceId).count('scrap') === 6,
        { relocation, target: rerouted.tacticalSnapshot.missionTarget },
      );
      g.build.demolish(piece.instanceId);
      const afterDemolition = g.inventory.count('scrap');
      g.raidMissions.update(0.01);
      check(
        'Destroyed storage cancels intent without taking or duplicating supplies',
        g.raidMissions.ledger.snapshot === null &&
          g.inventory.count('scrap') === afterDemolition &&
          g.raidMissions.ledger.recoveredLedger.length === 0,
      );
      g.raidMissions.cancelTransient();
      g.enemies.despawnAll();
      g.vehicleScene.clear();
      const bodyCount = g.physics.bodyCount,
        colliderCount = g.physics.colliderCount;
      const sceneCount = () => {
        let n = 0;
        g.renderer.scene.traverse(() => n++);
        return n;
      };
      const stocks = () =>
        ['scrap', 'components', 'fuel'].map(
          (id) =>
            g.inventory.count(id) + g.build.crates().reduce((n, c) => n + c.container.count(id), 0),
        );
      const beforeScene = sceneCount(),
        beforeStocks = stocks(),
        beforeContainers = g.build.crates().length;
      for (let i = 0; i < 100; i++) {
        const sov = g.enemies.spawn(i % 2 === 0 ? 'sovereign' : 'revenant', new V(6, 15.96, 2));
        const bas = g.enemies.spawn(i % 2 === 0 ? 'bastion' : 'warden', new V(6, 15.96, -2));
        bas.tactics.beginBastionVent();
        g.raidMissions.start(g.state.seed, i + 1);
        g.raidMissions.onBoarder(sov);
        g.enemies.update(1, 0);
        g.tacticsVisual.fixedUpdate();
        g.tacticsVisual.render();
        g.physics.step();
        const slots = [...g.tacticsVisual.slots.values()];
        if (i === 0) {
          const drone = slots.find((x) => x.enemy === sov).droneHit;
          const at = new V().copy(drone.translation()),
            origin = at.clone().add(new V(2, 0, 0));
          const hit = g.physics.raycast(origin, new V(-1, 0, 0), 2.4);
          check(
            'Authored drone is hit by real physics ray',
            hit?.userData?.id === `${sov.id}:drone`,
            hit?.userData?.id,
          );
          hit?.userData?.takeDamage?.(100);
          check('Shooting drone removes support for that life', !sov.tacticalSnapshot.droneAlive);
          const vent = slots.find((x) => x.enemy === bas).ventHit;
          const ventData = g.physics.getUserData(vent),
            before = bas.currentHealth;
          ventData.takeDamage(10);
          check(
            'Live vent collider preserves armor and routes double damage',
            ventData.armor === bas.def.armor && before - bas.currentHealth === 20,
          );
        }
        g.raidMissions.cancelTransient();
        g.enemies.despawnAll();
        g.tacticsVisual.fixedUpdate();
      }
      check(
        '100 mixed tactical/objective cycles retain physics resources',
        g.physics.bodyCount === bodyCount && g.physics.colliderCount === colliderCount,
        {
          before: [bodyCount, colliderCount],
          after: [g.physics.bodyCount, g.physics.colliderCount],
        },
      );
      check(
        '100 cycles preserve scene objects, containers and all eligible stock',
        sceneCount() === beforeScene &&
          g.build.crates().length === beforeContainers &&
          JSON.stringify(stocks()) === JSON.stringify(beforeStocks),
        {
          sceneBefore: beforeScene,
          sceneAfter: sceneCount(),
          containers: beforeContainers,
          stockBefore: beforeStocks,
          stockAfter: stocks(),
        },
      );
      return results;
    })),
  );
  checks.push(
    ...(await page.evaluate(() => {
      const g = globalThis.__game.game,
        V = g.player.worldPosition.constructor;
      const results = [],
        check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
      g.enemies.despawnAll();
      g.tacticsVisual.clear();
      g.raidMissions.cancelTransient();
      g.player.teleport({ x: -6, y: 15.96, z: -4 });
      g.player.stats.invulnerable = false;
      g.player.stats.health = 100;
      g.machine.damage.reset();
      const sabotageBefore = g.machine.damage.toSave();
      let wave = 2;
      while (g.raidMissions.start(g.state.seed, wave) !== 'sabotage') wave++;
      const saboteur = g.enemies.spawn('warden', new V(6, 15.96, 4));
      g.raidMissions.onBoarder(saboteur);
      const route = [];
      for (let i = 0; i < 1800 && g.machine.damage.health('engine') === 320; i++) {
        g.raidMissions.update(1 / 60);
        g.enemies.fixedUpdate(
          1 / 60,
          g.player.worldPosition,
          g.player.stats,
          g.build.navGraph,
          null,
          g.build,
          g.machine.damage,
        );
        g.physics.step();
        if (i % 120 === 0) route.push(saboteur.worldPosition.toArray());
      }
      check(
        'Live sabotage walks to the engine service point and damages only its target',
        g.machine.damage.health('engine') < 320 &&
          g.machine.damage
            .toSave()
            .filter((x) => x.id !== 'engine')
            .every((x) => x.health === sabotageBefore.find((y) => y.id === x.id).health) &&
          g.player.stats.health === 100,
        {
          route,
          damage: g.machine.damage.toSave(),
          playerHealth: g.player.stats.health,
          target: saboteur.tacticalSnapshot.missionTarget,
        },
      );
      g.raidMissions.cancelTransient();
      g.enemies.despawnAll();
      g.machine.damage.reset();
      const tick = () => {
        g.enemies.fixedUpdate(1 / 60, g.player.worldPosition, g.player.stats, g.build.navGraph);
        g.physics.step();
      };
      g.player.teleport({ x: 6, y: 15.96, z: 1 });
      g.player.stats.health = 100;
      const lunging = g.enemies.spawn('revenant', new V(6, 15.96, -4));
      for (let i = 0; i < 8; i++) tick();
      const direction = lunging.tacticalSnapshot.lungeDirection.clone();
      const before = lunging.worldPosition.clone();
      g.player.teleport({ x: 9, y: 15.96, z: 1 });
      for (let i = 0; i < 68; i++) tick();
      check(
        'Live Revenant commits its lane and a lateral dodge avoids damage',
        lunging.worldPosition.z - before.z > 2 &&
          Math.abs(lunging.worldPosition.x - before.x) < 0.5 &&
          g.player.stats.health === 100 &&
          lunging.tacticalSnapshot.phase === 'recovery',
        {
          before: before.toArray(),
          after: lunging.worldPosition.toArray(),
          direction: direction.toArray(),
          health: g.player.stats.health,
          phase: lunging.tacticalSnapshot.phase,
        },
      );
      g.enemies.despawnAll();
      // Isolated cover layout uses actual actor/controller/LOS and an explicit
      // three-node route, so the flank assertion cannot pass on path selection alone.
      const floor = g.physics.addFixedBox(new V(8, 0.09, 8), new V(40, 20.65, 3));
      const wall = g.physics.addFixedBox(new V(2, 2, 0.2), new V(40, 21.7, 1.5), 0, {
        kind: 'structure',
        id: 'qa-flank-cover',
        armor: 0,
        takeDamage() {},
      });
      g.player.teleport({ x: 40, y: 21.7, z: 8 });
      g.player.stats.health = 100;
      const warden = g.enemies.spawn('warden', new V(40, 21.7, 0));
      const level = warden.gridCell.y;
      const start = { x: 20, y: level, z: 0 },
        side = { x: 22, y: level, z: 0 },
        flank = { x: 22, y: level, z: 2 };
      const key = (c) => `${c.x},${c.y},${c.z}`;
      const nav = {
        links: new Map([
          [key(start), [side]],
          [key(side), [start, flank]],
          [key(flank), [side]],
        ]),
      };
      const wardenStart = warden.worldPosition.clone();
      const flankTick = () => {
        g.enemies.fixedUpdate(1 / 60, g.player.worldPosition, g.player.stats, nav);
        g.physics.step();
      };
      for (let i = 0; i < 110; i++) flankTick();
      check(
        'Live Warden moves around cover during its committed flank without firing',
        !!g.enemies.flankTarget(warden.id) &&
          warden.worldPosition.x - wardenStart.x > 0.5 &&
          g.player.stats.health === 100,
        {
          from: wardenStart.toArray(),
          to: warden.worldPosition.toArray(),
          target: g.enemies.flankTarget(warden.id),
          health: g.player.stats.health,
        },
      );
      g.physics.removeCollider(wall);
      g.physics.step();
      for (let i = 0; i < 240; i++) flankTick();
      check(
        'Warden releases its flank and resumes fire once cover is gone',
        !g.enemies.flankTarget(warden.id) && g.player.stats.health < 100,
        { target: g.enemies.flankTarget(warden.id), health: g.player.stats.health },
      );
      g.enemies.despawnAll();
      g.physics.removeCollider(floor);
      return results;
    })),
  );
  // Inspect the new authored targets on the actual machine at useful camera distance.
  for (const [kind, name] of [
    ['sovereign', 'support-drone'],
    ['bastion', 'cooling-vent'],
    ['revenant', 'lunge-warning'],
  ]) {
    await page.evaluate(
      ({ kind }) => {
        const g = globalThis.__game.game,
          V = g.player.worldPosition.constructor;
        g.loop.stop();
        g.enemies.despawnAll();
        g.tacticsVisual.clear();
        const e = g.enemies.spawn(kind, new V(6, 15.96, -2));
        if (kind === 'bastion') e.tactics.beginBastionVent();
        if (kind === 'revenant') e.tactics.update(0, { lungeDirection: new V(0, 0, 1) });
        g.enemies.update(1, 0.001);
        g.tacticsVisual.fixedUpdate();
        g.tacticsVisual.render();
        g.player.object3D.visible = false;
        g.freeCamera = g.renderer.camera;
        g.freeCamera.position.set(9.8, 17.2, 1.2);
        g.freeCamera.lookAt(6, 16.25, -2);
        g.render(1);
      },
      { kind },
    );
    await page.screenshot({ path: `${out}/${name}.png` });
  }
  frameSample = await page.evaluate(async () => {
    const g = globalThis.__game.game,
      V = g.player.worldPosition.constructor;
    g.loop.stop();
    g.closePanels(false);
    g.freeCamera = null;
    g.state.paused = false;
    g.state.playerDead = false;
    g.player.stats.invulnerable = true;
    g.enemies.despawnAll();
    g.tacticsVisual.clear();
    g.raidMissions.cancelTransient();
    g.player.teleport({ x: 6, y: 15.96, z: 4 });
    for (const [kind, z] of [
      ['revenant', -5],
      ['warden', -2],
      ['bastion', 1],
      ['sovereign', 3],
    ])
      g.enemies.spawn(kind, new V(4, 15.96, z));
    const frames = [],
      cpu = [];
    const start = performance.now();
    let last = start;
    await new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - last;
        last = now;
        g.input.lookDelta.x = Math.sin((now - start) / 600) * 45;
        const before = performance.now();
        g.loop.advance(Math.min(0.1, dt / 1000));
        const work = performance.now() - before;
        if (now - start > 2000) {
          frames.push(dt);
          cpu.push(work);
        }
        if (now - start >= 12000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const stats = (values) => {
      const a = [...values].sort((a, b) => a - b);
      return {
        mean: a.reduce((x, y) => x + y, 0) / a.length,
        p95: a[Math.floor(a.length * 0.95)],
        p99: a[Math.floor(a.length * 0.99)],
      };
    };
    return {
      gpu: 'RTX 3070',
      viewport: '1600x900',
      quality: 'high',
      scenario: 'Four active mechs, actual camera orbit and machine motion; 2s warmup + 10s sample',
      frames: frames.length,
      fps: 1000 / stats(frames).mean,
      frameMs: stats(frames),
      workMs: stats(cpu),
      activeEnemies: g.enemies.activeCount,
      bodies: g.physics.bodyCount,
      colliders: g.physics.colliderCount,
    };
  });
} catch (e) {
  errors.push(String(e));
  await page.screenshot({ path: `${out}/runtime-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}
await writeFile(`${out}/runtime-qa.json`, JSON.stringify({ checks, frameSample, errors }, null, 2));
console.log(JSON.stringify({ checks, frameSample, errors }, null, 2));
if (errors.length || checks.some((x) => !x.ok)) process.exitCode = 1;
