import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GROUND_MARK, GroundMarks } from '../src/render/three/groundMarks';

// What fire and ice boomerangs (and burning players) leave on the ground, timed from the reference video: fire gone 1.7 s after
// it is laid (10:00.16–10:03.0), ice a solid band for 3 s, gone by 4.3 s (groundMarkMotion.ts).

describe('ground marks', () => {
  it('lifetimes are the measured ones', () => {
    expect(GROUND_MARK.fire.lifeMs).toBe(1700);
    expect(GROUND_MARK.ice.lifeMs).toBe(4300);
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
    const spacing = 0.3 * 0.35; // ice: 0.3 W patches, 0.35 apart
    expect(marks.count).toBeGreaterThanOrEqual(1 + Math.floor(3 / spacing));
  });
});
