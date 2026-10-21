import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GROUND_MARK, GroundMarks } from '../src/render/three/groundMarks';

// What fire and ice boomerangs (and burning players) leave on the ground, timed from the reference video: fire gone ≈ 1.6 s
// after it is laid (9:57.7–9:59.3), ice still there 3.3 s on (6:02.5–6:05.8).

describe('ground marks', () => {
  it('lifetimes are the measured ones', () => {
    expect(GROUND_MARK.fire.lifeMs).toBe(1600);
    expect(GROUND_MARK.ice.lifeMs).toBe(3300);
  });

  it('a source drops at most one blob per interval; each fades away at the end of its life', () => {
    const marks = new GroundMarks(new THREE.Scene());
    marks.drop('a', 'fire', 0, 0, 1, 0);
    marks.drop('a', 'fire', 1, 0, 1, GROUND_MARK.everyMs - 1); // too soon
    marks.drop('a', 'fire', 2, 0, 1, GROUND_MARK.everyMs);
    marks.drop('b', 'ice', 0, 5, 1, 1);
    expect(marks.count).toBe(3);
    marks.update(GROUND_MARK.fire.lifeMs + GROUND_MARK.everyMs + 1);
    expect(marks.count).toBe(1); // both fire blobs gone; the ice lasts longer
    marks.update(GROUND_MARK.ice.lifeMs + 2);
    expect(marks.count).toBe(0);
  });
});
