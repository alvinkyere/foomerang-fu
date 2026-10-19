import type { PackCharacter } from './maps';

/**
 * Each character's ONE colour (owner, 2026-10-19): its boomerang, its throw's trail and its aim line are this colour — a mostly
 * yellow banana throws a yellow boomerang with a yellow trail. Measured from each character's atlas (k-means into five colours
 * over its opaque pixels, outline excluded): the largest cluster, except the donut, mostly tan dough (49%) but pink by identity
 * (its icing, 23%; the reference video's pink-trail donut).
 */
export const CHARACTER_COLOURS: Readonly<Record<PackCharacter, string>> = Object.freeze({
  avocado: '#029f18', // green skin, 56%
  bacon: '#a0422f', // red-brown, 53%
  banana: '#dede32', // yellow peel, 32% (the largest)
  bread: '#a89b5e', // crust, 50%
  carrot: '#e1773b', // orange, 71%
  coffee: '#e4ddc5', // white mug, 73%
  donut: '#df4c86', // pink icing (see above)
  icecream: '#7af7b9', // mint, 60%
  milk: '#1085e0', // blue carton, 58%
  watermelon: '#e13529', // red flesh, 47%
});
