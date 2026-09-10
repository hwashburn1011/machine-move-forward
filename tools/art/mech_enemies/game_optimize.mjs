import path from 'node:path';
process.env.MMF_GLTF_INPUT = path.resolve('assets/mech-enemies/gameplay');
process.env.MMF_GLTF_OUTPUT = path.resolve('public/models/authored');
process.argv = process.argv.slice(0, 2).concat(['bastion', 'revenant', 'warden', 'sovereign']);
process.env.MMF_GLTF_REPORT = path.resolve('assets/mech-enemies/gameplay/optimize-manifest.json');
await import('./optimize.mjs');
