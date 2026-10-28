import type { Recipe, Voice } from './recipes';

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** A second of white noise, made once for each context. */
function noiseOf(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (b === undefined) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = b.getChannelData(0);
    let seed = 12345; // (a fixed seed: the same crackle every run)
    for (let i = 0; i < data.length; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = seed / 2147483648 - 1;
    }
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/** When a voice falls silent, seconds after its sound started. */
export const voiceEnd = (v: Voice): number => (v.at ?? 0) + (v.attack ?? 0.004) + v.decay;
export const recipeSeconds = (r: Recipe): number => Math.max(...r.voices.map(voiceEnd));

/**
 * Plays `recipe` into `out` from time `when`: each voice an oscillator (or looped noise) through its own filter and envelope.
 * `pitch` scales every frequency (a little variety); `gain` scales the whole sound. Returns when the last voice ends.
 */
export function playRecipe(
  ctx: BaseAudioContext,
  out: AudioNode,
  recipe: Recipe,
  when: number,
  gain = 1,
  pitch = 1,
  onEnd?: () => void,
): number {
  let last = when;
  recipe.voices.forEach((v, k) => {
    const start = when + (v.at ?? 0);
    const attack = v.attack ?? 0.004;
    const end = start + attack + v.decay;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(v.gain * gain, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    let tail: AudioNode = env;
    if (v.filter !== undefined) {
      const f = ctx.createBiquadFilter();
      f.type = v.filter.type;
      f.Q.value = v.filter.q ?? 0.7;
      f.frequency.setValueAtTime(v.filter.from * pitch, start);
      if (v.filter.to !== undefined)
        f.frequency.exponentialRampToValueAtTime(v.filter.to * pitch, end);
      env.connect(f);
      tail = f;
    }
    tail.connect(out);
    if (v.wave === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = noiseOf(ctx);
      src.loop = true;
      src.connect(env);
      src.start(start);
      src.stop(end + 0.03);
      if (k === recipe.voices.length - 1 && onEnd !== undefined) src.onended = onEnd;
    } else {
      const osc = ctx.createOscillator();
      osc.type = v.wave;
      osc.frequency.setValueAtTime(v.from * pitch, start);
      if (v.to !== undefined) osc.frequency.exponentialRampToValueAtTime(v.to * pitch, end);
      osc.connect(env);
      osc.start(start);
      osc.stop(end + 0.03);
      if (k === recipe.voices.length - 1 && onEnd !== undefined) osc.onended = onEnd;
    }
    last = Math.max(last, end);
  });
  return last;
}

export const SFX_GAIN = 0.8;
export const MUSIC_GAIN = 0.24;

/**
 * The mix: effects and music each on a bus into one limiter (loose: it only acts when many sounds pile up) and a master.
 * The game and the preview render (art/audio/preview.mjs) build it the same way.
 */
export function createBuses(ctx: BaseAudioContext): { sfx: GainNode; music: GainNode } {
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  limiter.connect(master);
  master.connect(ctx.destination);
  const sfx = ctx.createGain();
  sfx.gain.value = SFX_GAIN;
  sfx.connect(limiter);
  const music = ctx.createGain();
  music.gain.value = MUSIC_GAIN;
  music.connect(limiter);
  return { sfx, music };
}
