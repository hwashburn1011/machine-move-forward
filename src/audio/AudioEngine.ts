import {
  allSoundIds,
  droneGain,
  dronePitch,
  semitoneRatio,
  soundSpec,
  spatialise,
  type SoundId,
  type VoiceSpec,
} from './SoundBank';

/**
 * The only thing in the project that knows WebAudio exists.
 *
 * Everything about WHAT a sound is lives in `SoundBank`, which is pure. This
 * turns a recipe into nodes, and owns the three things a browser makes
 * awkward: the context cannot start without a gesture, noise has to be built
 * by hand, and a page that is not being looked at should be silent.
 *
 * **Every entry point is safe to call when there is no audio at all.** The
 * harnesses run headless, `?nosound=1` exists, and a browser may refuse a
 * context outright — none of those may be allowed to take gameplay down with
 * them. `ready` is false and every method returns having done nothing.
 */

/** White noise long enough that a burst never runs off its end. */
const NOISE_SECONDS = 2;

/** Voices playing at once before new ones are dropped. */
const MAX_VOICES = 24;

/**
 * Seconds the drone takes to follow a speed change.
 *
 * Long. The machine's speed changes when the player builds something heavy,
 * which is a gradual fact about the world rather than an event, and a drone
 * that tracked it tightly would warble every time a wall went up.
 */
const DRONE_GLIDE = 1.5;

export interface AudioOptions {
  /** Off entirely. The harnesses and `?nosound=1`. */
  enabled?: boolean;
  /** Master volume, 0..1. */
  volume?: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private droneOsc: OscillatorNode | null = null;
  private droneGainNode: GainNode | null = null;
  private live = 0;
  private muted = false;
  /** Not readonly: the settings panel moves it. See `setVolume`. */
  private volume: number;
  private readonly enabled: boolean;
  /** Counted for the browser harness: nothing else can observe a sound. */
  private played = 0;

  constructor(options: AudioOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.volume = options.volume ?? 0.8;
    if (!this.enabled) return;

    try {
      // Not `new AudioContext()` unguarded: Safari still ships the prefix, and
      // a browser with audio disabled throws rather than returning null.
      const Ctor =
        globalThis.AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;

      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.noise = this.buildNoise(this.ctx);
    } catch {
      // A page that cannot have audio still has a game.
      this.ctx = null;
      this.master = null;
    }
  }

  get ready(): boolean {
    return this.ctx !== null && !this.muted;
  }

  /** Sounds started since boot. The browser harness's only way to see one. */
  get soundsPlayed(): number {
    return this.played;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /**
   * Start the context, if a user gesture has just happened.
   *
   * Browsers create an `AudioContext` suspended and refuse to resume it
   * outside a gesture. Called from the click that takes pointer lock, which is
   * the gesture every player performs anyway before there is anything to hear.
   */
  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  /** Master volume, 0..1. What the settings panel's slider reads. */
  get masterVolume(): number {
    return this.volume;
  }

  /**
   * Set master volume.
   *
   * Ramped rather than assigned, for the same reason `toggleMute` ramps: a
   * step change on a gain node is an audible click. Mute wins while it is on —
   * dragging the slider under a muted game must not unmute it.
   */
  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master && this.ctx && !this.muted) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  /**
   * Play a sound, optionally placed relative to the listener.
   *
   * `dx`/`dz` are metres to the source along the listener's right and forward
   * — the same frame the HUD's damage arc works in. Omit them for anything the
   * player IS rather than hears: their own weapon, their own pain.
   */
  play(id: SoundId, dx?: number, dz?: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    // A frame that fires thirty impacts should drop the last few rather than
    // building thirty node graphs. Dropped, not queued: a late gunshot is
    // worse than a missing one.
    if (this.live >= MAX_VOICES) return;

    const spec = soundSpec(id);
    let gain = 1;
    let pan = 0;
    if (dx !== undefined && dz !== undefined) {
      const placed = spatialise(dx, dz);
      if (placed.gain <= 0) return;
      gain = placed.gain;
      pan = placed.pan;
    }

    for (const semitones of spec.layers ?? [0]) {
      this.voice(spec, semitones, gain, pan);
    }
    this.played += 1;
  }

  /**
   * The machine's own note, following its speed.
   *
   * Started lazily on the first update rather than in the constructor: an
   * oscillator started against a suspended context is a node running silently
   * for however long it takes the player to click.
   */
  updateDrone(speed: number, baseSpeed: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    if (this.ctx.state !== 'running') return;

    if (!this.droneOsc) this.startDrone();
    if (!this.droneOsc || !this.droneGainNode) return;

    const now = this.ctx.currentTime;
    this.droneOsc.frequency.setTargetAtTime(dronePitch(speed, baseSpeed), now, DRONE_GLIDE);
    this.droneGainNode.gain.setTargetAtTime(droneGain(speed, baseSpeed), now, DRONE_GLIDE);
  }

  dispose(): void {
    try {
      this.droneOsc?.stop();
      void this.ctx?.close();
    } catch {
      // Closing a context that is already closed is not worth a crash.
    }
    this.ctx = null;
    this.master = null;
    this.droneOsc = null;
  }

  // -------------------------------------------------------------------------

  private startDrone(): void {
    if (!this.ctx || !this.master) return;

    // Sawtooth through a low-pass, not a sine: a pure sine reads as a test
    // tone. What is wanted is the bottom of something big and mechanical, and
    // that is harmonics with the top taken off.
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = dronePitch(0, 1);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    filter.Q.value = 0.6;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    osc.connect(filter).connect(gain).connect(this.master);
    osc.start();

    this.droneOsc = osc;
    this.droneGainNode = gain;
  }

  /** One layer of one sound. */
  private voice(spec: VoiceSpec, semitones: number, gain: number, pan: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const ratio = semitoneRatio(semitones);
    const now = ctx.currentTime;
    const { peak, attack, decay } = spec.envelope;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak * gain, now + Math.max(attack, 0.001));
    env.gain.linearRampToValueAtTime(0, now + attack + decay);

    // `StereoPannerNode` rather than a panner: see `spatialise`.
    let tail: AudioNode = env;
    if (pan !== 0 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      env.connect(panner);
      tail = panner;
    }
    tail.connect(master);

    let node: AudioScheduledSourceNode;
    if (spec.source.kind === 'noise') {
      if (!this.noise) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      // A fresh offset per shot, so ten rifle rounds are ten different bursts
      // out of one buffer rather than the same 140ms ten times.
      const filter = ctx.createBiquadFilter();
      filter.type = spec.source.filter;
      filter.frequency.value = spec.source.hz * ratio;
      filter.Q.value = spec.source.q;
      src.connect(filter).connect(env);
      node = src;
      src.start(now, Math.random() * (NOISE_SECONDS - 0.5));
    } else {
      const osc = ctx.createOscillator();
      osc.type = spec.source.wave;
      osc.frequency.setValueAtTime(spec.source.hz * ratio, now);
      if (spec.source.toHz !== undefined) {
        // Exponential, because pitch is perceived logarithmically and a linear
        // sweep spends most of its time at the top.
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(1, spec.source.toHz * ratio),
          now + attack + decay,
        );
      }
      osc.connect(env);
      node = osc;
      osc.start(now);
    }

    this.live += 1;
    node.stop(now + attack + decay + 0.02);
    node.onended = () => {
      this.live -= 1;
      node.disconnect();
      env.disconnect();
    };
  }

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const frames = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}

/** Exported so a harness can assert the bank is reachable, not just present. */
export const SOUND_IDS = allSoundIds();
