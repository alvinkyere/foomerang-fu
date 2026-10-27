import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GROUND_MARK, GroundMarks } from '../src/render/three/groundMarks';

// What fire and ice boomerangs (and burning players) leave on the ground, timed from the HQ videos (2026-10-27,
// groundMarkMotion.ts): fire gone 2.2 s after it is laid, ice a solid band for 4 s, gone by 7 s.

describe('ground marks', () => {
  it('lifetimes are the measured ones', () => {
    expect(GROUND_MARK.fire.lifeMs).toBe(2200);
    expect(GROUND_MARK.ice.lifeMs).toBe(7000);
  });

  it('a still source drops at most one blob per interval; each fades away at the end of its life', () => {
    const marks = new GroundMarks(new THREE.Scene());
    marks.drop('a', 'fire', 0, 0, 1, 0);
    marks.drop('a', 'fire', 0, 0, 1, GROUND_MARK.fire.everyMs - 1); // too soon, not moved
    marks.drop('a', 'fire', 0, 0, 1, GROUND_MARK.fire.everyMs);
    marks.drop('b', 'ice', 0, 5, 1, 1);
    expect(marks.count).toBe(3);
    marks.update(GROUND_MARK.fire.lifeMs + GROUND_MARK.fire.everyMs + 1);
    expect(marks.count).toBe(1); // both fire blobs gone; the ice lasts longer
    marks.update(GROUND_MARK.ice.lifeMs + 2);
    expect(marks.count).toBe(0);
  });

  it('a fast boomerang leaves a solid band: patches along its whole path, never further apart than a third of their size', () => {
    const marks = new GroundMarks(new THREE.Scene());
    marks.drop('a', 'ice', 0, 0, 1, 0);
    marks.drop('a', 'ice', 3, 0, 1, 16); // one frame at a charged throw's speed: 3 widths
    const spacing = 0.6 * 0.3; // ice: 0.6 W patches, 0.3 of one apart
    expect(marks.count).toBeGreaterThanOrEqual(1 + Math.floor(3 / spacing));
  });

  it('a running player kicks up a puff of dust (three circles) every 0.17 s; a player standing still kicks up none', () => {
    const marks = new GroundMarks(new THREE.Scene());
    for (let ms = 0; ms <= 340; ms += 17) marks.kick('a', ms * 0.01, 0, 1, ms);
    expect(marks.count).toBe(2 * 3); // at 17 ms (the first frame it is seen moving) and 187 ms
    const still = new GroundMarks(new THREE.Scene());
    for (let ms = 0; ms <= 340; ms += 17) still.kick('a', 0, 0, 1, ms);
    expect(still.count).toBe(0);
    marks.update(340 + GROUND_MARK.dust.lifeMs + 1);
    expect(marks.count).toBe(0);
  });
});
