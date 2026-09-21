import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export const BALANCE_STAGES = Object.freeze([
  {
    id: 'opening-salvage',
    script: 'continuity-story.mjs',
    args: ['--fresh'],
    milestone: 'opening and first salvage cold Continue',
  },
  {
    id: 'first-build-loop',
    script: 'continuity-first-loop.mjs',
    milestone: 'refinery, workbench and manual defense ready',
  },
  {
    id: 'first-boarding',
    script: 'continuity-boarding.mjs',
    milestone: 'first boarding resolved and cold Continue',
  },
  {
    id: 'radio-raids',
    script: 'continuity-radio.mjs',
    milestone: 'radio raid ledger and Wreck offer',
  },
  {
    id: 'wreck-one',
    script: 'continuity-wreck.mjs',
    milestone: 'Wreck One departure and cold Continue',
  },
  {
    id: 'relay-foundry',
    script: 'continuity-midgame.mjs',
    milestone: 'Relay Foundry departure and cold Continue',
  },
  {
    id: 'quiet-array',
    script: 'continuity-quiet-array.mjs',
    milestone: 'Quiet Array departure and cold Continue',
  },
  {
    id: 'recovery-infrastructure',
    script: 'continuity-late-recovery.mjs',
    milestone: 'late-campaign infrastructure recovery',
    env: { MMF_RECOVERY_STAGE: 'infrastructure' },
  },
  {
    id: 'recovery-sustain',
    script: 'continuity-late-recovery.mjs',
    milestone: 'water, food and route-fuel recovery',
    env: { MMF_RECOVERY_STAGE: 'sustain' },
  },
  {
    id: 'glass-orchard',
    script: 'continuity-orchard.mjs',
    milestone: 'Glass Orchard departure and cold Continue',
    fullArt: true,
  },
  {
    id: 'meridian',
    script: 'continuity-meridian.mjs',
    milestone: 'Last Garden Meridian departure and cold Continue',
    fullArt: true,
  },
  {
    id: 'keep-walking',
    script: 'continuity-ending.mjs',
    milestone: 'Meridian arrival, credits, Keep Walking and cold Continue',
    fullArt: true,
  },
]);

export function stagesFor(profile, through = null) {
  if (profile !== 'story') throw new Error(`Unknown profile ${profile}`);
  const eligible = BALANCE_STAGES.filter(
    (stage) => !stage.profiles || stage.profiles.includes(profile),
  );
  if (through === null) return eligible;
  const index = eligible.findIndex((stage) => stage.id === through);
  if (index < 0) throw new Error(`Unknown --through stage for ${profile}: ${through}`);
  return eligible.slice(0, index + 1);
}

export function acceptedStageStatus(status) {
  return typeof status === 'string' && status.startsWith('passed');
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function readJsonLines(file) {
  try {
    const text = await fs.readFile(file, 'utf8');
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

export function parseLastJson(text) {
  if (typeof text !== 'string') return null;
  const end = text.lastIndexOf('}');
  if (end < 0) return null;
  for (
    let start = text.lastIndexOf('{', end);
    start >= 0;
    start = text.lastIndexOf('{', start - 1)
  ) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // Walk outward until the complete final JSON object parses.
    }
  }
  return null;
}

async function walkFiles(root, current = root, out = []) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) await walkFiles(root, absolute, out);
    else if (entry.isFile()) out.push({ absolute, relative: path.relative(root, absolute) });
  }
  return out;
}

function hashFile(hash, file) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
}

/** Content digest used before and after every child run to prove its source profile stayed read-only. */
export async function digestDirectory(root) {
  const files = await walkFiles(root);
  const hash = createHash('sha256');
  let bytes = 0;
  for (const file of files) {
    const stat = await fs.stat(file.absolute);
    bytes += stat.size;
    hash.update(file.relative.replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(String(stat.size));
    hash.update('\0');
    await hashFile(hash, file.absolute);
    hash.update('\0');
  }
  return { sha256: hash.digest('hex'), files: files.length, bytes };
}

function candidateSnapshot(summary, events) {
  const direct = [summary?.final, summary?.restored, summary?.checkpoint].find(
    (value) => value && typeof value === 'object',
  );
  if (direct) return direct;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    for (const key of ['restored', 'snapshot', 'after', 'checkpoint', 'final']) {
      if (event?.[key] && typeof event[key] === 'object') return event[key];
    }
  }
  return null;
}

function itemTotals(slots) {
  const totals = {};
  const add = (id, count) => {
    if (typeof id !== 'string' || !Number.isFinite(count)) return;
    totals[id] = (totals[id] ?? 0) + count;
  };
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object') return;
    if (typeof value.itemId === 'string' && Number.isFinite(value.count)) {
      add(value.itemId, value.count);
      return;
    }
    if (Array.isArray(value.slots)) visit(value.slots);
  };
  visit(slots);
  return totals;
}

function resourceTotals(resources) {
  if (Array.isArray(resources)) return Object.fromEntries(resources);
  if (resources && typeof resources === 'object')
    return Object.fromEntries(
      Object.entries(resources).filter(([, value]) => Number.isFinite(value)),
    );
  return {};
}

function structuresOf(snapshot) {
  const structures = snapshot?.structures ?? snapshot?.pieces ?? [];
  if (!Array.isArray(structures)) return [];
  return structures.map((piece) => ({
    id: piece.instanceId ?? piece.id ?? null,
    definitionId: piece.definitionId ?? piece.piece ?? null,
    cell: piece.cell ?? null,
    health: Number.isFinite(piece.health) ? piece.health : undefined,
  }));
}

function containerTotalsOf(snapshot) {
  const structures = snapshot?.structures ?? snapshot?.pieces ?? [];
  if (!Array.isArray(structures)) return {};
  return itemTotals(structures.map((piece) => piece?.state ?? piece?.data?.state ?? null));
}

function eventCount(events, pattern) {
  return events.filter((event) => pattern.test(String(event?.type ?? ''))).length;
}

export function classifyBlocker(message) {
  if (!message) return null;
  const text = String(message);
  if (/browser|page|pointer|waypoint|selector|timeout|timed out|closed|navigation/i.test(text))
    return 'automation-or-driver';
  if (/died|health|attack|enemy|boarding|raid/i.test(text)) return 'combat-or-survival';
  if (
    /not enough|unaffordable|insufficient|did not recover enough|missing (scrap|components|fuel|water|food|rations|ammo)/i.test(
      text,
    )
  )
    return 'candidate-resource-stall';
  if (/save|continue|restore|checkpoint|profile|seed/i.test(text)) return 'save-or-lineage';
  return 'unclassified';
}

/** Normalize deliberately inconsistent historical continuity summaries into one evidence row. */
export function normalizeBalanceSample({ profile, stage, output, summary, events }) {
  const snapshot = candidateSnapshot(summary, events) ?? {};
  const story = snapshot.story ?? null;
  const routeChart = snapshot.routeChart ?? snapshot.chart ?? null;
  const observedDeaths = Array.isArray(summary?.observedDeaths) ? summary.observedDeaths.length : 0;
  const deathEvents = eventCount(events, /player:?died|player-death/i);
  const needs = snapshot.needs ?? null;
  const weaponAmmo = snapshot.weapons ?? snapshot.weaponLedger ?? [];
  const saveEvent = [...events]
    .reverse()
    .find((event) => /save-committed|cold-continue|save-and-quit/i.test(String(event?.type ?? '')));
  const blocker = summary?.message ?? summary?.blocker ?? null;
  return {
    profile,
    stage: stage.id,
    milestone: stage.milestone,
    output,
    status: summary?.status ?? 'unknown',
    blocker,
    blockerClass: classifyBlocker(blocker),
    seed: snapshot.seed ?? summary?.seed ?? null,
    simTimeS: snapshot.simTime ?? snapshot.simTimeS ?? null,
    distanceM: snapshot.distanceM ?? snapshot.distanceTraveled ?? null,
    health: snapshot.health ?? snapshot.playerHealth ?? null,
    needs,
    tankFuel: snapshot.power?.fuel ?? snapshot.threats?.tankFuel ?? snapshot.tankFuel ?? null,
    inventoryTotals: itemTotals(snapshot.inventory),
    containerTotals: containerTotalsOf(snapshot),
    resourceTotals: resourceTotals(snapshot.resources),
    structures: structuresOf(snapshot),
    subsystems: snapshot.damage ?? snapshot.subsystems ?? [],
    power: snapshot.power ?? null,
    weaponAmmo,
    story,
    routeChart,
    deaths: Math.max(observedDeaths, deathEvents),
    retries: eventCount(events, /retry/i),
    encounters: {
      boarding: eventCount(events, /boarding/i),
      raids: eventCount(events, /raid/i),
      threats: eventCount(events, /threat|attack/i),
    },
    optionalContacts: {
      visited: routeChart?.visited ?? [],
      missed: routeChart?.missed ?? [],
    },
    save: saveEvent
      ? {
          event: saveEvent.type,
          slot: saveEvent.slot ?? saveEvent.committedSlot ?? null,
        }
      : null,
    errors: Array.isArray(summary?.errors) ? summary.errors : [],
  };
}

export async function loadStageEvidence(output, profile, stage, fallbackResult = null) {
  const summary = (await readJson(path.join(output, 'summary.json'))) ??
    fallbackResult ?? { status: 'unknown' };
  const events = await readJsonLines(path.join(output, 'events.jsonl'));
  return {
    summary,
    events,
    sample: normalizeBalanceSample({ profile, stage, output, summary, events }),
  };
}

export function outputFromResult(result) {
  if (typeof result?.output === 'string') return path.resolve(result.output);
  if (typeof result?.evidence === 'string') return path.dirname(path.resolve(result.evidence));
  return null;
}

export async function singleChildDirectory(parent) {
  const entries = await fs.readdir(parent, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length !== 1)
    throw new Error(`Expected one fresh output below ${parent}, found ${directories.length}`);
  return path.join(parent, directories[0].name);
}

export async function writeBalanceReport(file, manifest) {
  const rows = manifest.profiles
    .flatMap((entry) => entry.stages)
    .map(
      (stage) =>
        `| ${stage.profile} | ${stage.stage} | ${stage.status} | ${stage.distanceM ?? '—'} | ${stage.simTimeS ?? '—'} | ${stage.health ?? '—'} | ${stage.tankFuel ?? '—'} | ${stage.blocker ? String(stage.blocker).split('\n')[0] : ''} |`,
    )
    .join('\n');
  const text = `# Expedition balance automation\n\nGenerated: ${manifest.generatedAt}\n\nThis is automated normal-input continuity evidence. It is not a human playtest and does not establish fun, perceived fairness, visual readability or audio quality. A blocked stage is retained as evidence and is not described as a completed campaign.\n\nSite: \`${manifest.site}\`  \nCommit: \`${manifest.commit ?? 'unknown'}\`\n\n| Profile | Stage | Status | Distance m | Sim s | HP | Tank fuel | Blocker |\n| --- | --- | --- | ---: | ---: | ---: | ---: | --- |\n${rows || '| — | — | no stages run | — | — | — | — | |'}\n\n## Invariants\n\n- Every stage copied a closed committed browser profile to a unique child directory.\n- Source profile content digests are recorded before and after each child run; any change blocks the lineage.\n- The harness uses title/profile selection, normal keyboard/mouse UI, Pause, Save & Quit and cold Continue paths from the existing continuity runners.\n- It does not edit IndexedDB/local storage, write Game state, inject inventory, teleport, suppress encounters, or bypass costs.\n- Balance values remain unchanged by this tool. Any tuning requires a separate same-seed candidate report under the plan's change gate.\n`;
  await fs.writeFile(file, text);
}
