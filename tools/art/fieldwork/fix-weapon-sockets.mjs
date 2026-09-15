/** Correct the original weapons' visual muzzle sockets to their authored barrel axis.
 * Vertex buffers, materials, dimensions and hitscan gameplay are unchanged.
 */
import { readFile, writeFile } from 'node:fs/promises';
for (const name of ['scrap-rifle', 'scrap-shotgun']) {
  const path = `public/models/authored/${name}.glb`;
  const bytes = await readFile(path);
  const oldLength = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + oldLength));
  const socket = doc.nodes.find(node => node.name === 'Muzzle');
  if (!socket?.translation) throw Error(`Missing muzzle in ${name}`);
  socket.translation[1] = .13;
  const raw = Buffer.from(JSON.stringify(doc));
  const json = Buffer.concat([raw, Buffer.alloc((4 - raw.length % 4) % 4, 32)]);
  const tail = bytes.subarray(20 + oldLength);
  const header = Buffer.from(bytes.subarray(0,20));
  header.writeUInt32LE(20 + json.length + tail.length,8);
  header.writeUInt32LE(json.length,12);
  await writeFile(path,Buffer.concat([header,json,tail]));
  console.log(`${name}: Muzzle at ${socket.translation.join(', ')}`);
}
