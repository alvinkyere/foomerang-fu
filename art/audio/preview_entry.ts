import {
  CUE_SOUNDS,
  EVENT_SOUNDS,
  EXTRA_SOUNDS,
  type Recipe,
} from '../../apps/console/src/audio/recipes';
import { createBuses, playRecipe, recipeSeconds } from '../../apps/console/src/audio/synth';

const SR = 44100;

async function render(
  seconds: number,
  build: (ctx: OfflineAudioContext, buses: { sfx: GainNode; music: GainNode }) => void,
): Promise<number[]> {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * SR), SR);
  build(ctx, createBuses(ctx)); // (the game's own mix: synth.ts)
  const data = (await ctx.startRendering()).getChannelData(0);
  return Array.from(data);
}

/** Every sound, as samples at 44.1 kHz (the engine's bus gains applied). */
export async function renderAll(): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {};
  const one = async (name: string, r: Recipe) => {
    out[name] = await render(recipeSeconds(r) + 0.1, (ctx, { sfx }) => {
      playRecipe(ctx, sfx, r, 0.01, r.level ?? 1);
    });
  };
  for (const [k, r] of Object.entries(EVENT_SOUNDS)) await one(`event:${k}`, r);
  for (const [k, r] of Object.entries(EXTRA_SOUNDS)) await one(`extra:${k}`, r);
  for (const [k, r] of Object.entries(CUE_SOUNDS)) await one(`cue:${k}`, r);
  return out;
}
