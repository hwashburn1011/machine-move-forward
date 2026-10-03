// Read the original game's pure TypeScript controllers without changing them.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
const root = path.resolve(import.meta.dirname, '../..');
const cache = new Map();
const packageRequire = createRequire(import.meta.url);
export function moduleData(file) {
  if (!path.extname(file)) file += '.ts';
  if (cache.has(file)) return cache.get(file);
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const module = { exports: {} };
  cache.set(file, module.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const require = name => name.startsWith('@/') ? moduleData(path.join(root, 'src', name.slice(2))) : name.startsWith('.') ? moduleData(path.resolve(path.dirname(file), name)) : packageRequire(name);
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return module.exports;
}
