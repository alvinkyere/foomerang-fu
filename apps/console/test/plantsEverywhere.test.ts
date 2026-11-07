import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePlantGroups } from '../src/render/hexPlants';

// The hex plants move and burn the same on every map they grow on (owner, 2026-11-06): the meadow's, the gong islands', the plaza's and the
// bridge islands' (its bushes were painted cards)
// are all the game's own plants (render/hexPlants.ts), not still parts of a model (art/hex_meadow/plants_from_glb.py).

const maps = join(__dirname, '..', 'public', 'maps');
const manifest = (map: string) =>
  JSON.parse(readFileSync(join(maps, map, 'manifest.json'), 'utf8')) as {
    plants?: unknown;
    plantsReplace?: unknown;
  };
/** The node names in a map's model (its glTF JSON chunk). */
const nodeNames = (map: string): string[] => {
  const b = readFileSync(join(maps, map, 'plaza.glb'));
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as {
    nodes?: { name?: string }[];
  };
  return (json.nodes ?? []).map((n) => n.name ?? '');
};

describe('the hex plants on every map', () => {
  it.each([
    ['hex_meadow', 1, 900],
    ['gong_islands', 4, 70],
    ['market_plaza', 4, 50],
    ['bridge_islands', 3, 70],
  ])('%s draws its plants itself: %i field(s), over %i plates', (map, fields, plates) => {
    const groups = parsePlantGroups(manifest(map).plants);
    expect(groups).toHaveLength(fields);
    expect(groups.reduce((n, g) => n + g.pads.length, 0)).toBeGreaterThan(plates);
  });

  it('hides the model’s own still plants wherever the game draws them, and no map keeps still ones', () => {
    for (const map of readdirSync(maps)) {
      let names: string[];
      try {
        names = nodeNames(map);
      } catch {
        continue; // (a map with no model of ours)
      }
      const still = names.filter((n) => /^HEXPLANT_|^TREE_2[5-8]_tree_hex|^BUSHCARD_/.test(n));
      if (still.length === 0) continue;
      const replace = manifest(map).plantsReplace;
      expect(typeof replace, map).toBe('string');
      const pattern = new RegExp(replace as string);
      for (const n of still) expect(pattern.test(n), `${map}: ${n}`).toBe(true);
    }
  });
});
