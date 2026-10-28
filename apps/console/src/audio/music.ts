import { hz, type Recipe } from './recipes';

/**
 * The music bed, our own: a bouncy bass-and-drums groove at the videos' pulse. The HQ videos' music has a steady 0.5 s beat
 * (120 bpm), is heavy in the bass, and sounds the same on every map (its spectrum matches between the plaza, the pond and the
 * gong islands: 0.83-0.97), so one loop plays on all of them. Eight bars of eight eighths, C - Am - F - G twice, the lead
 * coming in for the second four. Pure data: the engine schedules it.
 */
export const BPM = 120;
export const EIGHTH = 60 / BPM / 2;
export const BARS = 8;
export const LOOP_EIGHTHS = BARS * 8;

export type Part = 'kick' | 'snare' | 'hat' | 'bass' | 'pluck' | 'lead';
export interface Hit {
  readonly part: Part;
  readonly midi?: number;
}

const CHORDS = [
  { bass: 36, base: 60, third: 4 }, // C
  { bass: 33, base: 57, third: 3 }, // Am
  { bass: 41, base: 65, third: 4 }, // F
  { bass: 43, base: 67, third: 4 }, // G
] as const;
const ARPEGGIO = [0, 1, 2, 3, 2, 1, 2, 3];
const BASS_STEPS: Readonly<Record<number, number>> = { 0: 0, 3: 12, 4: 0, 7: 7 };
/** The lead of bars 5-8 (one row a bar, a note an eighth; 0 rests). */
const LEAD = [
  [76, 0, 79, 0, 76, 74, 72, 0],
  [72, 0, 76, 0, 81, 0, 79, 76],
  [77, 0, 76, 0, 72, 0, 69, 0],
  [79, 0, 74, 0, 71, 0, 74, 79],
] as const;

/** What sounds on eighth `e` of the loop (counted from the start, wrapping). */
export function hitsAt(e: number): Hit[] {
  const n = ((e % LOOP_EIGHTHS) + LOOP_EIGHTHS) % LOOP_EIGHTHS;
  const bar = Math.floor(n / 8);
  const i = n % 8;
  const chord = CHORDS[bar % 4] as (typeof CHORDS)[number];
  const hits: Hit[] = [];
  if (i === 0 || i === 4) hits.push({ part: 'kick' });
  if (i === 2 || i === 6) hits.push({ part: 'snare' });
  if (i % 2 === 1) hits.push({ part: 'hat' });
  const step = BASS_STEPS[i];
  if (step !== undefined) hits.push({ part: 'bass', midi: chord.bass + step });
  const tones = [0, chord.third, 7, 12];
  hits.push({
    part: 'pluck',
    midi: chord.base + (tones[ARPEGGIO[i] as number] as number),
  });
  if (bar >= 4) {
    const note = (LEAD[bar - 4] as readonly number[])[i] as number;
    if (note > 0) hits.push({ part: 'lead', midi: note });
  }
  return hits;
}

/** A hit as a recipe (the engine's music bus plays it). */
export function hitRecipe(h: Hit): Recipe {
  const f = h.midi === undefined ? 0 : hz(h.midi);
  switch (h.part) {
    case 'kick':
      return { voices: [{ wave: 'sine', from: 140, to: 42, decay: 0.2, gain: 0.95 }] };
    case 'snare':
      return {
        voices: [
          {
            wave: 'noise',
            from: 1800,
            decay: 0.13,
            gain: 0.5,
            filter: { type: 'bandpass', from: 1800, q: 0.9 },
          },
          { wave: 'triangle', from: 230, to: 150, decay: 0.09, gain: 0.3 },
        ],
      };
    case 'hat':
      return {
        voices: [
          {
            wave: 'noise',
            from: 7000,
            decay: 0.045,
            gain: 0.22,
            filter: { type: 'highpass', from: 7000 },
          },
        ],
      };
    case 'bass':
      return {
        voices: [
          {
            wave: 'triangle',
            from: f,
            decay: 0.24,
            gain: 0.7,
            filter: { type: 'lowpass', from: 700 },
          },
        ],
      };
    case 'pluck':
      return { voices: [{ wave: 'triangle', from: f, decay: 0.17, gain: 0.16 }] };
    case 'lead':
      return {
        voices: [
          {
            wave: 'square',
            from: f,
            decay: 0.22,
            gain: 0.1,
            filter: { type: 'lowpass', from: 3200 },
          },
        ],
      };
  }
}
