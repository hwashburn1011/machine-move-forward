#!/usr/bin/env node
/**
 * Objective metrics for audio clips emitted by feel-acceptance.mjs.
 *
 * This helper never normalizes the source clips. The generated WAV files are
 * short, unnormalized PCM copies for a later human listening review.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const usage = `Usage:
  node tools/campaign/audio-mix-report.mjs <feel-run-directory> [--output <json-path>] [--review-dir <directory>]

Example:
  node tools/campaign/audio-mix-report.mjs test-results/feel-acceptance/run-2026-09-17T02-10-01-525Z

The report preserves source levels and writes unnormalized WAV review copies.`;

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    process.exit(0);
  }
  const runArg = args.find((arg) => !arg.startsWith('-'));
  if (!runArg) throw new Error(usage);
  const valueFor = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    runDir: path.resolve(runArg),
    output: valueFor('--output'),
    reviewDir: valueFor('--review-dir'),
  };
}

function command(name, args, { input = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(name, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => reject(error));
    child.on('close', (code, signal) => {
      const result = {
        code,
        signal,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString('utf8'),
      };
      if (code === 0) resolve(result);
      else reject(new Error(`${name} exited ${code ?? `by ${signal}`}: ${result.stderr.trim()}`));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function probe(source) {
  const result = await command('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=codec_name,channels,sample_rate,duration:format=duration',
    '-of',
    'json',
    source,
  ]);
  const parsed = JSON.parse(result.stdout.toString('utf8'));
  const stream = parsed.streams?.[0];
  if (!stream) throw new Error('No audio stream found');
  const duration = Number(stream.duration ?? parsed.format?.duration);
  return {
    codec: stream.codec_name ?? null,
    channels: Number(stream.channels),
    sampleRate: Number(stream.sample_rate),
    durationSeconds: Number.isFinite(duration) ? duration : null,
  };
}

async function decodePcm(source) {
  const result = await command('ffmpeg', [
    '-v',
    'error',
    '-i',
    source,
    '-vn',
    '-f',
    'f32le',
    '-acodec',
    'pcm_f32le',
    'pipe:1',
  ]);
  return result.stdout;
}

function dbfs(amplitude) {
  return amplitude > 0 ? 20 * Math.log10(amplitude) : -Infinity;
}

function metricsFromPcm(pcm, probeInfo) {
  const channels = probeInfo.channels;
  const sampleCount = Math.floor(pcm.length / 4);
  const frameCount = Math.floor(sampleCount / channels);
  let peak = 0;
  let sumSquares = 0;
  let clippedSamples = 0;
  let lastAudibleFrame = -1;
  const audibleThreshold = 10 ** (-60 / 20);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const value = pcm.readFloatLE(sampleIndex * 4);
    const absolute = Math.abs(value);
    if (absolute > peak) peak = absolute;
    sumSquares += value * value;
    if (absolute >= 0.999) clippedSamples += 1;
    if (absolute > audibleThreshold) lastAudibleFrame = Math.floor(sampleIndex / channels);
  }
  const durationSeconds = frameCount / probeInfo.sampleRate;
  const silentTailSeconds =
    lastAudibleFrame < 0
      ? durationSeconds
      : Math.max(0, durationSeconds - (lastAudibleFrame + 1) / probeInfo.sampleRate);
  return {
    durationSeconds,
    sampleCount,
    frameCount,
    digitalSilence: peak === 0,
    peakDbfs: dbfs(peak),
    rmsDbfs: dbfs(sampleCount ? Math.sqrt(sumSquares / sampleCount) : 0),
    clippedSampleCount: clippedSamples,
    clipThresholdDbfs: dbfs(0.999),
    silentTail: {
      thresholdDbfs: -60,
      seconds: silentTailSeconds,
      exceedsHalfSecond: silentTailSeconds > 0.5,
    },
  };
}

async function writeReviewCopy(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await command('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    source,
    '-map',
    '0:a:0',
    '-t',
    '10',
    '-c:a',
    'pcm_s16le',
    destination,
  ]);
}

const clipNames = [
  'audio-engine-deck.webm',
  'audio-indoor.webm',
  'audio-combat.webm',
  'audio-pause.webm',
];
const args = parseArgs(process.argv.slice(2));
const runDir = args.runDir;
const outputPath = path.resolve(args.output ?? path.join(runDir, 'audio-mix-report.json'));
const reviewDir = path.resolve(args.reviewDir ?? path.join(runDir, 'audio-review'));
const report = {
  status: 'starting',
  generatedAt: new Date().toISOString(),
  runDirectory: runDir,
  provenance: {
    sourceFiles: [],
    sourceLevelsPreserved: true,
    metricTools: { ffprobe: 'ffprobe', ffmpeg: 'ffmpeg' },
    reviewCopies: { directory: reviewDir, normalized: false, maxSecondsPerClip: 10 },
  },
  metrics: [],
  objectiveMetricsOnly: {
    humanListeningReview: {
      status: 'not performed',
      reason:
        'This automation cannot listen to audio input; WAV copies are provided for human review.',
    },
  },
  errors: [],
};

try {
  const stat = await fs.stat(runDir);
  if (!stat.isDirectory()) throw new Error(`Run path is not a directory: ${runDir}`);
  await fs.mkdir(reviewDir, { recursive: true });
  for (const clipName of clipNames) {
    const source = path.join(runDir, clipName);
    const metric = {
      clip: clipName,
      sourcePath: source,
      reviewPath: path.join(reviewDir, clipName.replace(/\.webm$/i, '.wav')),
    };
    report.provenance.sourceFiles.push(source);
    try {
      await fs.access(source);
      const info = await probe(source);
      const pcm = await decodePcm(source);
      Object.assign(metric, info, metricsFromPcm(pcm, info));
      await writeReviewCopy(source, metric.reviewPath);
      metric.reviewCopy = { path: metric.reviewPath, normalized: false };
    } catch (error) {
      metric.error = error instanceof Error ? error.message : String(error);
      report.errors.push({ clip: clipName, message: metric.error });
    }
    report.metrics.push(metric);
  }
  report.status = report.errors.length ? 'completed_with_clip_failures' : 'completed';
} catch (error) {
  report.status = 'failed';
  report.errors.push({ message: error instanceof Error ? error.message : String(error) });
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      status: report.status,
      output: outputPath,
      reviewDir,
      clips: report.metrics.length,
      errors: report.errors.length,
    },
    null,
    2,
  ),
);
if (report.status === 'failed') process.exitCode = 1;
