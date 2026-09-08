/** Copy the published trailer alongside Vite's game output. */
import { cp, mkdir, access } from 'node:fs/promises';
const source = new URL('../docs/media/', import.meta.url);
const target = new URL('../dist/trailer/media/', import.meta.url);
await access(new URL('machine-move-forward-trailer.mp4', source));
await mkdir(target, { recursive: true });
for (const name of ['machine-move-forward-trailer.mp4', 'trailer-poster.jpg'])
  await cp(new URL(name, source), new URL(name, target));
