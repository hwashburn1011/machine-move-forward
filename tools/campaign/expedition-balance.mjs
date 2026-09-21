/**
 * Standard campaign balance orchestration over the existing normal-input
 * continuity runners. The orchestrator never opens or edits campaign storage;
 * every child runner copies a closed committed source profile before launch.
 *
 * Plan only (default):
 *   node tools/campaign/expedition-balance.mjs --profile=all
 *
 * Execute serially against an already-running final bundle:
 *   node tools/campaign/expedition-balance.mjs --run --profile=story --site=http://127.0.0.1:5207/
 */
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  acceptedStageStatus,
  digestDirectory,
  loadStageEvidence,
  outputFromResult,
  parseLastJson,
  singleChildDirectory,
  stagesFor,
  writeBalanceReport,
} from './expedition-balance-lib.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..', '..');
const args = new Set(process.argv.slice(2));
const option = (name, fallback = null) => {
  const prefix = `${name}=`;
  const found = [...args].find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};
const execute = args.has('--run');
const requestedProfile = option('--profile', 'all');
if (!['story', 'all'].includes(requestedProfile)) throw new Error('--profile must be story or all');
const profiles = requestedProfile === 'all' ? ['story'] : [requestedProfile];
const through = option('--through');
const site = option('--site', process.env.MMF_SITE ?? 'http://127.0.0.1:5207/');
const fullArt = args.has('--full-art');
const timeoutMs = Number(process.env.MMF_BALANCE_STAGE_TIMEOUT_MS ?? 40 * 60_000);
if (!Number.isFinite(timeoutMs) || timeoutMs < 60_000)
  throw new Error('MMF_BALANCE_STAGE_TIMEOUT_MS must be at least 60000');
const siteUrl = new URL(site);
for (const key of ['nospawn', 'nolock', 'nomenu', 'noload']) {
  if (siteUrl.searchParams.has(key))
    throw new Error(`Balance site rejects authority override: ${key}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runRoot = path.resolve(
  option(
    '--out',
    process.env.MMF_BALANCE_OUT ?? path.join('test-results', 'expedition-balance', stamp),
  ),
);
const stagePlans = Object.fromEntries(
  profiles.map((profile) => [profile, stagesFor(profile, through)]),
);

if (!execute) {
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: 'plan-only',
        site,
        output: runRoot,
        fullArt,
        profiles: Object.fromEntries(
          Object.entries(stagePlans).map(([profile, stages]) => [
            profile,
            stages.map(({ id, script, milestone, fullArt: requiredFullArt }) => ({
              id,
              script,
              milestone,
              fullArt: Boolean(requiredFullArt || fullArt),
            })),
          ]),
        ),
        note: 'Pass --run to launch browsers serially. This plan performs no browser or GPU work.',
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

await fs.mkdir(path.join(runRoot, 'logs'), { recursive: true });

const commit = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })
  .then(({ stdout }) => stdout.trim())
  .catch(() => null);
const manifest = {
  format: 1,
  generatedAt: new Date().toISOString(),
  completedAt: null,
  site,
  commit,
  fullArt,
  runRoot,
  constraints: {
    normalInput: true,
    sourceProfilesReadOnly: true,
    directStateWrites: false,
    inventoryGrants: false,
    teleports: false,
    humanPlaytest: false,
  },
  profiles: [],
};
const manifestPath = path.join(runRoot, 'manifest.json');
const persist = () => fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
await persist();

const MAX_CAPTURE_BYTES = 2_000_000;
const runChild = (script, scriptArgs, env, stdoutPath, stderrPath) =>
  new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(root, 'tools', 'campaign', script), ...scriptArgs],
      {
        cwd: root,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (stdoutBytes < MAX_CAPTURE_BYTES) stdout.push(chunk);
      stdoutBytes += chunk.length;
    });
    child.stderr.on('data', (chunk) => {
      if (stderrBytes < MAX_CAPTURE_BYTES) stderr.push(chunk);
      stderrBytes += chunk.length;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        code: null,
        signal: null,
        timedOut,
        error: error.stack ?? error.message,
        stdout: '',
        stderr: '',
      });
    });
    child.on('close', async (code, signal) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString('utf8');
      const err = Buffer.concat(stderr).toString('utf8');
      await Promise.all([fs.writeFile(stdoutPath, out), fs.writeFile(stderrPath, err)]);
      resolve({
        code,
        signal,
        timedOut,
        error: null,
        stdout: out,
        stderr: err,
        stdoutBytes,
        stderrBytes,
      });
    });
  });

for (const profile of profiles) {
  const profileResult = {
    profile,
    seed: `expedition-balance-${profile}-v1`,
    status: 'running',
    stages: [],
  };
  manifest.profiles.push(profileResult);
  await persist();
  let sourceProfile = null;

  for (const stage of stagePlans[profile]) {
    const sourceBefore = sourceProfile ? await digestDirectory(sourceProfile) : null;
    const initialBase = path.join(runRoot, profile, stage.id);
    if (stage.id === 'opening-salvage') await fs.mkdir(initialBase, { recursive: true });
    const logBase = path.join(runRoot, 'logs', `${profile}-${stage.id}`);
    const env = {
      MMF_SITE: site,
      MMF_CAMPAIGN_PROFILE: profile,
      MMF_CAMPAIGN_SEED: profileResult.seed,
      ...(sourceProfile ? { MMF_CONTINUITY_PROFILE: sourceProfile } : {}),
      ...(stage.id === 'opening-salvage' ? { MMF_CONTINUITY_OUT: initialBase } : {}),
      ...(fullArt || stage.fullArt ? { MMF_FULL_ART: '1' } : {}),
      ...(stage.env ?? {}),
    };
    const scriptArgs = [...(stage.args ?? [])];
    if (stage.id === 'opening-salvage' && fullArt) scriptArgs.push('--full-art');
    process.stdout.write(`[${profile}] ${stage.id}: ${stage.milestone}\n`);
    const child = await runChild(
      stage.script,
      scriptArgs,
      env,
      `${logBase}.stdout.log`,
      `${logBase}.stderr.log`,
    );
    const result = parseLastJson(child.stdout) ??
      parseLastJson(child.stderr) ?? {
        status: 'blocked',
        message: child.error ?? (child.timedOut ? 'stage timed out' : `stage exited ${child.code}`),
      };
    let output = outputFromResult(result);
    if (!output && stage.id === 'opening-salvage')
      output = await singleChildDirectory(initialBase).catch(() => initialBase);
    const evidence = output
      ? await loadStageEvidence(output, profile, stage, result)
      : {
          summary: result,
          events: [],
          sample: {
            profile,
            stage: stage.id,
            milestone: stage.milestone,
            output: null,
            status: result.status ?? 'blocked',
            blocker: result.message ?? 'runner did not report an output directory',
          },
        };
    const sourceAfter = sourceProfile ? await digestDirectory(sourceProfile) : null;
    const sourceUnchanged =
      !sourceBefore ||
      (sourceBefore.sha256 === sourceAfter.sha256 &&
        sourceBefore.files === sourceAfter.files &&
        sourceBefore.bytes === sourceAfter.bytes);
    const stageResult = {
      ...evidence.sample,
      runner: stage.script,
      exitCode: child.code,
      signal: child.signal,
      timedOut: child.timedOut,
      stdoutBytes: child.stdoutBytes ?? 0,
      stderrBytes: child.stderrBytes ?? 0,
      sourceProfile,
      sourceDigestBefore: sourceBefore,
      sourceDigestAfter: sourceAfter,
      sourceUnchanged,
      childProfile: output ? path.join(output, 'browser-profile') : null,
    };
    if (!sourceUnchanged) {
      stageResult.status = 'blocked-source-mutated';
      stageResult.blocker = 'Child runner changed its accepted source profile';
    } else if (child.timedOut) {
      stageResult.status = 'blocked-timeout';
      stageResult.blocker = `Runner exceeded ${timeoutMs} ms`;
    } else if (child.error) {
      stageResult.status = 'blocked-runner-error';
      stageResult.blocker = child.error;
    } else if (child.code !== 0 && acceptedStageStatus(stageResult.status)) {
      stageResult.status = 'blocked-runner-exit';
      stageResult.blocker = `Runner reported success but exited ${child.code}`;
    }
    profileResult.stages.push(stageResult);
    await persist();

    if (!acceptedStageStatus(stageResult.status)) {
      profileResult.status = 'blocked';
      profileResult.blocker = {
        stage: stage.id,
        reason: stageResult.blocker ?? `stage status ${stageResult.status}`,
      };
      await persist();
      break;
    }
    const childProfile = stageResult.childProfile;
    const childStat = childProfile ? await fs.stat(childProfile).catch(() => null) : null;
    if (
      !childStat?.isDirectory() ||
      (sourceProfile && path.resolve(childProfile) === path.resolve(sourceProfile))
    ) {
      stageResult.status = 'blocked-profile-lineage';
      stageResult.blocker = 'Runner did not produce a distinct child browser profile';
      profileResult.status = 'blocked';
      profileResult.blocker = { stage: stage.id, reason: stageResult.blocker };
      await persist();
      break;
    }
    stageResult.childDigest = await digestDirectory(childProfile);
    sourceProfile = childProfile;
    profileResult.status = stage.id === stagePlans[profile].at(-1).id ? 'passed' : 'running';
    profileResult.finalProfile = sourceProfile;
    await persist();
  }
}

manifest.completedAt = new Date().toISOString();
manifest.status = manifest.profiles.every((entry) => entry.status === 'passed')
  ? 'passed'
  : 'blocked';
await persist();
await writeBalanceReport(path.join(runRoot, 'report.md'), manifest);
process.stdout.write(`${JSON.stringify({ status: manifest.status, output: runRoot }, null, 2)}\n`);
if (manifest.status !== 'passed') process.exitCode = 1;
