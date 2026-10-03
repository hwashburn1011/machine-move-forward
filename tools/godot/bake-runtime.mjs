/** Preserve authored/procedural machine and building transforms from the reference game. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const out = 'godot/assets/runtime';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.MMF_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu'] });
try {
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto(`http://127.0.0.1:${process.env.MMF_PORT ?? 5207}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high`);
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  const contracts = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    g.stop(); g.opening.restore({ phase: 'done' });
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
    const pieces = await import('/src/data/build-pieces.ts');
    const geometry = await import('/src/building/BuildPieceGeometry.ts');
    const opening = await import('/src/game/OpeningCinematicTimeline.ts');
    globalThis.__nativeExport = async name => {
      let root;
      if (name === 'scatter') {
        const spawner = g.world.props[0][0];
        root = new THREE.Group();
        for (const key of ['rocks','slabs','debris','scrap','scrub','nearField']) {
          const source = spawner[key];
          const mesh = new THREE.Mesh(source.geometry, source.material); mesh.name = key; root.add(mesh);
        }
        for (const {kind, mesh: source} of spawner.wrecks) {
          const mesh = new THREE.Mesh(source.geometry, source.material); mesh.name = 'wreck-'+kind; root.add(mesh);
        }
      } else if (name.startsWith('battle-')) {
        const { SignalBattleScene } = await import('/src/story/SignalBattleScene.ts');
        const battle = new SignalBattleScene(g.renderer.scene, g.materials, () => 0, () => {});
        root = battle.ship(name === 'battle-robot' ? 'robot' : 'human', new THREE.Vector3()).root.clone(true);
        const unsupported = [];
        root.traverse(node => { if (node.isSprite) unsupported.push(node); });
        unsupported.forEach(node => node.removeFromParent());
      } else if (name === 'rooftop') {
        const { RooftopSet } = await import('/src/world/RooftopSet.ts');
        const roof = new RooftopSet(g.renderer.scene, g.physics, g.materials); roof.build();
        root = roof.group.clone(true);
      } else if (name === 'machine') {
        root = g.machine.group.clone(true);
        root.getObjectByName('built-structures')?.removeFromParent();
        root.position.set(0, 0, 0); root.quaternion.identity();
      } else {
        root = g.build.createMesh({ instanceId: 'native-export', definitionId: name,
          cell: { x: 0, y: 0, z: 0 }, edge: { x: 0, y: 0, z: 0, axis: 'x' }, rotation: 0, health: 999 });
        root.removeFromParent(); root.position.set(0,0,0); root.quaternion.identity();
      }
      const converted = new Map();
      root.traverse(node => {
        if (!node.isMesh) return;
        const convert = source => {
          if (converted.has(source)) return converted.get(source);
          const material = source.clone(); converted.set(source, material);
          for (const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap']) {
            const texture = material[key], image = texture?.image;
            if (!image?.data) continue;
            const canvas = document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
            const bytes = new Uint8ClampedArray(image.width*image.height*4);
            const channels = image.data.length/(image.width*image.height);
            for(let p=0;p<image.width*image.height;p++) for(let c=0;c<4;c++)
              bytes[p*4+c] = c<channels ? image.data[p*channels+c] : 255;
            canvas.getContext('2d').putImageData(new ImageData(bytes,image.width,image.height),0,0);
            const next = new THREE.Texture(canvas);
            for(const field of ['wrapS','wrapT','magFilter','minFilter','flipY','colorSpace','rotation']) next[field]=texture[field];
            next.repeat.copy(texture.repeat); next.offset.copy(texture.offset); next.center.copy(texture.center);
            material[key]=next;
          }
          return material;
        };
        node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
      });
      root.updateMatrixWorld(true);
      const exporter = new GLTFExporter();
      const bytes = await exporter.parseAsync(root, { binary: true, onlyVisible: true });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
      const a = document.createElement('a'); a.href=url; a.download=name+'.glb'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    };
    const colliders = [];
    const builtHandles = new Set([...g.build.instances.values()].flatMap(entry => entry.colliders.map(c=>c.handle)));
    for (const body of g.machine.bodies) for (let i=0; i<body.numColliders(); i++) {
      const c = body.collider(i), s = c.shape;
      if (!c.isEnabled() || builtHandles.has(c.handle)) continue;
      colliders.push({ type:s.type, position:c.translation(), rotation:c.rotation(),
        half:s.halfExtents, vertices:s.vertices ? Array.from(s.vertices) : undefined,
        indices:s.indices ? Array.from(s.indices) : undefined, radius:s.radius, halfHeight:s.halfHeight });
    }
    const pieceColliders = {};
    for (const piece of Object.keys(pieces.BUILD_PIECES)) pieceColliders[piece] = geometry.pieceColliders(piece);
    return { colliders, pieceColliders, pieces:Object.keys(pieces.BUILD_PIECES), openingTiming:opening.OPENING_CINEMATIC_TIMING };
  });
  await fs.writeFile('godot/data/runtime.json', JSON.stringify(contracts));
  for (const name of (process.env.MMF_EXPORT_ONLY ? process.env.MMF_EXPORT_ONLY.split(',') : ['machine', 'scatter', 'rooftop', 'battle-human', 'battle-robot', ...contracts.pieces])) {
    if (!process.argv.includes('--force') && name !== 'machine' && await fs.stat(`${out}/${name}.glb`).catch(() => null)) continue;
    const ready = page.waitForEvent('download', { timeout: 180000 });
    ready.catch(() => {});
    await page.evaluate(name => globalThis.__nativeExport(name), name);
    const download = await ready;
    await download.saveAs(`${out}/${name}.glb`);
    console.log(name);
  }
} finally { await browser.close(); }
