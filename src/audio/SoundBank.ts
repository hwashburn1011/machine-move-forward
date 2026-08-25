/**
 * What every sound in the game is made of.
 *
 * PURE. A recipe is plain data — waveform, two envelopes, a filter — with no
 * `AudioContext` anywhere near it, so the whole bank is readable and testable
 * in node. `AudioEngine` is the only thing that knows WebAudio exists.
 *
 * **Synthesised, not sampled, and for the same reason everything else here is
 * generated in code** (`ASSETS.md`): a rifle shot is a filtered noise burst
 * with a fast decay whether it comes out of a WAV or out of an oscillator, and
 * the WAV brings a licence, a download, a loading state and a decode with it.
 * The rule in `ASSETS.md` is "procedural by default, assets where they earn
 * their place" — a sample earns its place when a synthesised version cannot be
 * made to read, and none of these are that yet. When one is, it goes here as a
 * new `source` kind rather than as a special case somewhere else.
 *
 * Nothing in this file is tuned by ear yet in any serious way. The numbers are
 * a first pass and the file is deliberately the one place a person would go to
 * argue about them, the way `data/gait.ts` is for the walk.
 */

/** What a voice is built out of. */
export type Source =
  /** Band-passed white noise. Impacts, footfalls, sand, gunfire. */
  | { kind: 'noise'; filter: 'lowpass' | 'highpass' | 'bandpass'; hz: number; q: number }
  /** A single oscillator, optionally swept. Tones, alarms, the engine. */
  | { kind: 'tone'; wave: OscillatorType; hz: number; toHz?: number };

/**
 * A linear-ramp envelope, in seconds from the moment the voice starts.
 *
 * Two points rather than full ADSR: every sound here is a hit or a short cue,
 * and an attack-then-decay is all any of them use. A sustained sound is the
 * engine drone, and that is not a voice — it runs continuously and is
 * modulated, not triggered.
 */
export interface Envelope {
  /** Peak gain, 0..1, relative to the bus this voice plays on. */
  peak: number;
  /** Seconds to reach the peak. Zero is a click; a few ms is a transient. */
  attack: number;
  /** Seconds from the peak back to silence. */
  decay: number;
}

export interface VoiceSpec {
  source: Source;
  envelope: Envelope;
  /**
   * Semitone offsets to layer the same recipe at, one voice each.
   *
   * Cheaper than writing three recipes, and it is how a single body gets
   * weight: a footfall is one thud, and a footfall plus the same thud an
   * octave down is a heavy one.
   */
  layers?: readonly number[];
}

/** Every sound the game can make. */
export type SoundId =
  | 'rifle'
  | 'shotgun'
  | 'dry-fire'
  | 'reload-start'
  | 'reload-done'
  | 'hit-metal'
  | 'hit-flesh'
  | 'enemy-hurt'
  | 'enemy-died'
  | 'player-hurt'
  | 'player-died'
  | 'footfall'
  | 'build-place'
  | 'build-remove'
  | 'pickup'
  | 'craft'
  | 'warning'
  | 'all-clear'
  | 'hook-throw'
  | 'hook-catch';

const SOUNDS: Record<SoundId, VoiceSpec> = {
  // --- Weapons -------------------------------------------------------------
  // A crack and a body. The crack is the high-passed transient; the body is
  // the octave-down layer, which is most of what makes it sound like a rifle
  // rather than a click.
  rifle: {
    source: { kind: 'noise', filter: 'bandpass', hz: 1800, q: 0.9 },
    envelope: { peak: 0.5, attack: 0.001, decay: 0.14 },
    layers: [0, -12],
  },
  // Lower, wider, longer. A shotgun is the same event with more air moved.
  shotgun: {
    source: { kind: 'noise', filter: 'bandpass', hz: 900, q: 0.7 },
    envelope: { peak: 0.62, attack: 0.001, decay: 0.26 },
    layers: [0, -12, -19],
  },
  // The one sound that must never be satisfying.
  'dry-fire': {
    source: { kind: 'noise', filter: 'highpass', hz: 3200, q: 1 },
    envelope: { peak: 0.16, attack: 0.001, decay: 0.03 },
  },
  'reload-start': {
    source: { kind: 'noise', filter: 'bandpass', hz: 420, q: 2.2 },
    envelope: { peak: 0.24, attack: 0.004, decay: 0.1 },
  },
  // Deliberately a tone, and the only mechanical sound that is: it is the
  // moment the player is allowed to shoot again, and a tone is the only thing
  // in this bank that can be heard through gunfire.
  'reload-done': {
    source: { kind: 'tone', wave: 'triangle', hz: 520, toHz: 780 },
    envelope: { peak: 0.16, attack: 0.004, decay: 0.11 },
  },

  // --- Impacts -------------------------------------------------------------
  // The pair that tells the player whether they hit the deck or the target,
  // which is the single most useful thing audio does in a shooter.
  'hit-metal': {
    source: { kind: 'noise', filter: 'bandpass', hz: 3400, q: 3.5 },
    envelope: { peak: 0.3, attack: 0.001, decay: 0.09 },
    layers: [0, 7],
  },
  'hit-flesh': {
    source: { kind: 'noise', filter: 'lowpass', hz: 700, q: 0.7 },
    envelope: { peak: 0.34, attack: 0.001, decay: 0.07 },
  },
  'enemy-hurt': {
    source: { kind: 'tone', wave: 'sawtooth', hz: 220, toHz: 150 },
    envelope: { peak: 0.14, attack: 0.002, decay: 0.12 },
  },
  'enemy-died': {
    source: { kind: 'tone', wave: 'sawtooth', hz: 190, toHz: 55 },
    envelope: { peak: 0.3, attack: 0.004, decay: 0.5 },
    layers: [0, -12],
  },

  // --- The player ----------------------------------------------------------
  // Low and close, so it is distinguishable from anything happening to
  // something else. Being hit is the one event that must never be ambiguous.
  'player-hurt': {
    source: { kind: 'noise', filter: 'lowpass', hz: 320, q: 0.9 },
    envelope: { peak: 0.5, attack: 0.002, decay: 0.3 },
    layers: [0, -12],
  },
  'player-died': {
    source: { kind: 'tone', wave: 'sine', hz: 130, toHz: 38 },
    envelope: { peak: 0.5, attack: 0.01, decay: 1.6 },
    layers: [0, -12],
  },

  // --- The machine ---------------------------------------------------------
  // The whole point of the exercise. A walker's footfall is a mass arriving:
  // almost all low end, a very fast attack, and a decay short enough that four
  // a second do not turn into a drone.
  footfall: {
    source: { kind: 'noise', filter: 'lowpass', hz: 130, q: 1.1 },
    envelope: { peak: 0.55, attack: 0.004, decay: 0.34 },
    layers: [0, -12],
  },

  // --- Building and inventory ----------------------------------------------
  'build-place': {
    source: { kind: 'noise', filter: 'bandpass', hz: 260, q: 2.6 },
    envelope: { peak: 0.3, attack: 0.002, decay: 0.16 },
    layers: [0, -7],
  },
  'build-remove': {
    source: { kind: 'noise', filter: 'bandpass', hz: 520, q: 1.6 },
    envelope: { peak: 0.24, attack: 0.002, decay: 0.22 },
  },
  pickup: {
    source: { kind: 'tone', wave: 'triangle', hz: 660, toHz: 990 },
    envelope: { peak: 0.13, attack: 0.003, decay: 0.09 },
  },
  craft: {
    source: { kind: 'tone', wave: 'square', hz: 300, toHz: 600 },
    envelope: { peak: 0.1, attack: 0.004, decay: 0.18 },
    layers: [0, 12],
  },

  // --- The threat director -------------------------------------------------
  // Falling, and slow. It has to be audible over the engine and read as bad
  // news from across the deck without a HUD glance -- which is precisely the
  // job the banner cannot do while the player is looking at the sand.
  warning: {
    source: { kind: 'tone', wave: 'sawtooth', hz: 160, toHz: 96 },
    envelope: { peak: 0.3, attack: 0.05, decay: 1.5 },
    layers: [0, -12],
  },
  // Rising, and the exact inverse, so the pair reads as a statement and its
  // answer rather than as two unrelated noises.
  'all-clear': {
    source: { kind: 'tone', wave: 'triangle', hz: 300, toHz: 450 },
    envelope: { peak: 0.14, attack: 0.02, decay: 0.6 },
  },

  // --- The reel ------------------------------------------------------------
  'hook-throw': {
    source: { kind: 'noise', filter: 'highpass', hz: 1400, q: 0.8 },
    envelope: { peak: 0.2, attack: 0.004, decay: 0.3 },
  },
  'hook-catch': {
    source: { kind: 'noise', filter: 'bandpass', hz: 1100, q: 4 },
    envelope: { peak: 0.3, attack: 0.001, decay: 0.14 },
    layers: [0, -12],
  },
};

export function soundSpec(id: SoundId): VoiceSpec {
  return SOUNDS[id];
}

export function allSoundIds(): SoundId[] {
  return Object.keys(SOUNDS) as SoundId[];
}

/** Semitones to a frequency ratio. */
export function semitoneRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

// ---------------------------------------------------------------------------
// The engine drone
// ---------------------------------------------------------------------------

/**
 * Idle and full-speed pitch of the machine's own note, in Hz.
 *
 * Low enough to sit under everything else rather than compete with it. The
 * machine is the thing the player is standing on, and a bed you stop noticing
 * is exactly what a bed is for -- what gets noticed is when it CHANGES, which
 * is the whole reason it is tied to speed.
 */
export const DRONE_IDLE_HZ = 41;
export const DRONE_FULL_HZ = 58;

/** Gain of the drone at rest and at full speed. A stopped machine is quiet. */
export const DRONE_IDLE_GAIN = 0.02;
export const DRONE_FULL_GAIN = 0.09;

/**
 * The drone's pitch and volume at a given speed.
 *
 * Clamped rather than extrapolated: a machine slowed to a crawl by weight must
 * not drop below audibility, and one somehow driven past its base speed must
 * not scream.
 */
export function dronePitch(speed: number, baseSpeed: number): number {
  return DRONE_IDLE_HZ + (DRONE_FULL_HZ - DRONE_IDLE_HZ) * clamp01(speed / baseSpeed);
}

export function droneGain(speed: number, baseSpeed: number): number {
  return DRONE_IDLE_GAIN + (DRONE_FULL_GAIN - DRONE_IDLE_GAIN) * clamp01(speed / baseSpeed);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * How loud a sound is at a distance, and where it sits left to right.
 *
 * Deliberately not WebAudio's `PannerNode`. A panner wants a listener
 * orientation kept in step with the camera every frame, and this game has one
 * listener standing on a deck ten metres wide — the whole audible world is
 * inside a space smaller than the falloff would care about. A gain and a pan
 * computed from the same numbers the HUD's damage arc already uses is the
 * honest amount of machinery for that.
 *
 * @param dx  metres to the sound, along the listener's right
 * @param dz  metres to the sound, along the listener's forward
 */
export function spatialise(dx: number, dz: number, reach = 24): { gain: number; pan: number } {
  const distance = Math.hypot(dx, dz);
  // Linear rather than inverse-square: over a 16m deck, inverse-square makes
  // anything past a few metres inaudible, and everything on this machine is
  // close enough that the player is entitled to hear all of it.
  const gain = Math.max(0, 1 - distance / reach);
  const pan = distance < 0.01 ? 0 : Math.max(-1, Math.min(1, dx / Math.max(distance, 1)));
  return { gain, pan };
}
