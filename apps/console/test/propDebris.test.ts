import { describe, expect, it } from 'vitest';
import { debrisAt, debrisFor } from '../src/render/propDebris';

// A broken crate or pot bursts into pieces (the reference video, 02:21: the pots' shards scatter and stay on the ground).
// The motion is pure presentation, seeded per prop so a replay looks the same; sizes are in units of the prop's own size.

describe('prop debris', () => {
  const away = { x: 1, z: 0 };

  it('a crate breaks into planks and chips, a pot into shards', () => {
    expect(debrisFor('CRATE', away, 'CRATE_16_crates_0').length).toBeGreaterThanOrEqual(6);
    expect(debrisFor('POT', away, 'POT_22_pots_0').length).toBeGreaterThanOrEqual(6);
  });

  it('the same prop always breaks the same way; different props differ', () => {
    expect(debrisFor('POT', away, 'POT_22_pots_0')).toEqual(
      debrisFor('POT', away, 'POT_22_pots_0'),
    );
    expect(debrisFor('POT', away, 'POT_22_pots_1')).not.toEqual(
      debrisFor('POT', away, 'POT_22_pots_0'),
    );
  });

  it('pieces fly outward, mostly away from whoever broke it, never below the floor, and come to rest on it', () => {
    const pieces = debrisFor('CRATE', away, 'CRATE_16_crates_0');
    let ahead = 0;
    for (const p of pieces) {
      for (let t = 0; t <= 3; t += 0.02)
        expect(debrisAt(p, t).position.y).toBeGreaterThanOrEqual(0);
      const end = debrisAt(p, 3);
      expect(end.resting).toBe(true);
      expect(end.position.y).toBeCloseTo(p.size.y / 2, 6); // lying on the ground
      const spread = Math.hypot(end.position.x, end.position.z);
      expect(spread).toBeGreaterThan(0.3);
      expect(spread).toBeLessThan(4); // within a few prop sizes, like the video's shards
      if (end.position.x > 0) ahead += 1;
      expect(debrisAt(p, 5)).toEqual(end); // at rest it stays put
    }
    expect(ahead / pieces.length).toBeGreaterThan(0.6);
  });

  it('they pop up first: the burst rises before it falls', () => {
    for (const p of debrisFor('POT', away, 'POT_20_pots_1')) {
      expect(debrisAt(p, 0.1).position.y).toBeGreaterThan(debrisAt(p, 0).position.y);
    }
  });

  it('with nobody to fly away from, the burst is even all round', () => {
    const pieces = debrisFor('POT', undefined, 'POT_21_pot_0');
    const c = pieces.reduce(
      (s, p) => ({ x: s.x + debrisAt(p, 3).position.x, z: s.z + debrisAt(p, 3).position.z }),
      { x: 0, z: 0 },
    );
    expect(Math.hypot(c.x, c.z) / pieces.length).toBeLessThan(0.5);
  });
});
