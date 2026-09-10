import {
  allSoundIds,
  ambienceGain,
  calmPadEnvelope,
  DEFAULT_AMBIENCE_VOLUME,
  droneGain,
  dronePitch,
  PAD_ATTACK_S,
  PAD_DETUNE_CENTS,
  PAD_FILTER_HZ,
  PAD_GAIN,
  PAD_RELEASE_S,
  PAD_ROOT_HZ,
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
  ambienceVolume?: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private droneOsc: OscillatorNode | null = null;
  private droneGainNode: GainNode | null = null;
  private padGainNode: GainNode | null = null;
  private readonly padOscs: OscillatorNode[] = [];
  /** The gain the pad is currently being ramped toward. See `padAudible`. */
  private padTarget = 0;
  private padStartedAt: number | null = null;
  private active = true;
  private hidden = false;
  private combatDuck = 1;
  private ambienceVolume: number;
  private readonly onVisibility = (): void => {
    this.hidden = document.hidden;
    this.syncOutput();
  };
  /**
   * The interior duck, 0..1. Read by `updateDrone` every frame.
   *
   * A field rather than an argument because the room the player is standing in
   * is a fact about the world and the machine's speed is a fact about the
   * machine — two callers would otherwise have to agree about both.
   */
  private duck = 1;
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
    this.ambienceVolume = options.ambienceVolume ?? DEFAULT_AMBIENCE_VOLUME;
    if (!this.enabled) return;

    try {
      // Not `new AudioContext()` unguarded: Safari still ships the prefix, and
      // a browser with audio disabled throws rather than returning null.
      const Ctor =
        globalThis.AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;

      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.ambience = this.ctx.createGain();
      this.ambience.gain.value = this.ambienceVolume;
      this.ambience.connect(this.master);
      this.noise = this.buildNoise(this.ctx);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this.onVisibility);
        this.onVisibility();
      }
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
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.8;
    this.syncOutput();
  }

  setAmbienceVolume(value: number): void {
    this.ambienceVolume = Number.isFinite(value)
      ? Math.max(0, Math.min(1, value))
      : DEFAULT_AMBIENCE_VOLUME;
    if (this.ambience && this.ctx) {
      this.ambience.gain.setTargetAtTime(this.ambienceVolume, this.ctx.currentTime, 0.15);
    }
  }

  /** Pause/title screens and background tabs fade the entire mix to silence. */
  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.syncOutput();
  }

  setCombatActive(active: boolean): void {
    this.combatDuck = active ? 0.45 : 1;
  }

  private syncOutput(): void {
    if (!this.master || !this.ctx) return;
    const audible = !this.muted && this.active && !this.hidden;
    this.master.gain.setTargetAtTime(audible ? this.volume : 0, this.ctx.currentTime, 0.08);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.syncOutput();
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
    if (!this.ctx || !this.master || this.muted || !this.active || this.hidden) return;
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
      this.voice(
        spec,
        semitones,
        gain * (id === 'footfall' ? this.duck * this.combatDuck : 1),
        pan,
        id === 'footfall' ? this.ambience : this.master,
      );
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
    this.droneGainNode.gain.setTargetAtTime(
      droneGain(speed, baseSpeed) * this.duck * this.combatDuck,
      now,
      DRONE_GLIDE,
    );
  }

  /**
   * Say whether the player is standing inside an enclosed room.
   *
   * Level-triggered and safe to call every frame: the value it sets is read by
   * `updateDrone`, which ramps rather than assigns, so walking through a
   * doorway is a fade of a second or so rather than a step. Which is what it
   * should be — a doorway is a threshold, not a switch.
   */
  setInterior(inside: boolean): void {
    this.duck = ambienceGain(inside);
  }

  /** What the interior duck currently is. Read by the browser harness. */
  get interiorDuck(): number {
    return this.duck;
  }

  /**
   * The calm pad, on or off.
   *
   * Level-triggered like `updateDrone` and started just as lazily: two
   * oscillators begun against a suspended context would run silently for as
   * long as it took the player to click. Fading rather than stopping, because
   * an oscillator that has been stopped cannot be started again and the pad
   * comes and goes for the whole of a session.
   */
  updatePad(playing: boolean): void {
    if (!this.ctx || !this.master || this.muted) return;
    if (this.ctx.state !== 'running') return;

    if (this.padOscs.length === 0) this.startPad();
    if (!this.padGainNode) return;

    const now = this.ctx.currentTime;
    if (playing && this.padStartedAt === null) this.padStartedAt = now;
    if (!playing) this.padStartedAt = null;
    this.padTarget = playing ? PAD_GAIN * calmPadEnvelope(now - (this.padStartedAt ?? now)) : 0;
    // `setTargetAtTime` approaches its target exponentially, so the time
    // constant is roughly a third of the audible fade.
    this.padGainNode.gain.setTargetAtTime(
      this.padTarget,
      now,
      (playing ? PAD_ATTACK_S : PAD_RELEASE_S) / 3,
    );
  }

  /**
   * Is the pad's graph built and being held audible?
   *
   * The TARGET rather than `gain.value`, deliberately. The fade is six seconds
   * long, so the parameter's current value a millisecond after the ramp starts
   * is still zero — a harness reading it would conclude the pad never started
   * when what it had actually measured was the fade working.
   */
  get padAudible(): boolean {
    return this.padGainNode !== null && this.padTarget > 0;
  }

  dispose(): void {
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.onVisibility);
    try {
      this.droneOsc?.stop();
      for (const osc of this.padOscs) osc.stop();
      void this.ctx?.close();
    } catch {
      // Closing a context that is already closed is not worth a crash.
    }
    this.ctx = null;
    this.master = null;
    this.ambience = null;
    this.droneOsc = null;
    this.droneGainNode = null;
    this.padOscs.length = 0;
    this.padGainNode = null;
  }

  // -------------------------------------------------------------------------

  private startDrone(): void {
    if (!this.ctx || !this.ambience) return;

    // Triangle has far less harmonic buzz than the previous sawtooth.
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = dronePitch(0, 1);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 100;
    filter.Q.value = 0.6;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    osc.connect(filter).connect(gain).connect(this.ambience);
    osc.start();

    this.droneOsc = osc;
    this.droneGainNode = gain;
  }

  /** Quiet sine voices, shaped into phrases by updatePad. */
  private startPad(): void {
    if (!this.ctx || !this.ambience) return;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = PAD_FILTER_HZ;
    filter.Q.value = 0.5;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    filter.connect(gain).connect(this.ambience);

    for (const cents of [-PAD_DETUNE_CENTS, PAD_DETUNE_CENTS]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = PAD_ROOT_HZ;
      osc.detune.value = cents;
      osc.connect(filter);
      osc.start();
      this.padOscs.push(osc);
    }

    this.padGainNode = gain;
  }

  /** One layer of one sound. */
  private voice(
    spec: VoiceSpec,
    semitones: number,
    gain: number,
    pan: number,
    output: GainNode | null,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !output) return;

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
    tail.connect(output);

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
