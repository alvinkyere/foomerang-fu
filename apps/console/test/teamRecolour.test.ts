import { describe, expect, it } from 'vitest';
import { bodyWeight, recolourPixels, teamPixel } from '../src/characters/teamRecolour';

// Team Up recolours the players the HQ's way (ff physics hq 2.mp4 9:48+): the body goes to the team's hue, the rest stays.

const hue = ([r, g, b]: readonly number[]): number => {
  const max = Math.max(r as number, g as number, b as number);
  const min = Math.min(r as number, g as number, b as number);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g! - b!) / d) % 6 : max === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4;
  return (h * 60 + 360) % 360;
};

describe('team recolour', () => {
  it('the toast’s crumb and crust go blue on the blue team, keeping pale and deep', () => {
    const crumb = teamPixel('bread', 1, 250, 245, 190); // pale yellow
    const crust = teamPixel('bread', 1, 190, 140, 60); // deep orange-brown
    expect(Math.abs(hue(crumb) - 222)).toBeLessThan(6);
    expect(Math.abs(hue(crust) - 222)).toBeLessThan(6);
    expect(Math.min(...crumb)).toBeGreaterThan(Math.min(...crust)); // the crumb is still the paler of the two
  });

  it('the popsicle’s mint goes red on the red team; its yellow stick stays', () => {
    const body = teamPixel('icecream', 0, 110, 230, 190);
    expect(hue(body)).toBeLessThan(12);
    expect(teamPixel('icecream', 0, 250, 200, 60)).toEqual([250, 200, 60]);
  });

  it('a face (near black) and white eye-shines are never the body', () => {
    for (const kind of ['bread', 'icecream', 'carrot', 'bacon'] as const) {
      expect(bodyWeight(kind, 20, 20, 24)).toBe(0);
      expect(teamPixel(kind, 1, 20, 20, 24)).toEqual([20, 20, 24]);
    }
    expect(bodyWeight('bread', 255, 255, 255)).toBe(0);
  });

  it('a carrot’s green leaves stay; its orange goes to the team', () => {
    expect(teamPixel('carrot', 1, 40, 190, 60)).toEqual([40, 190, 60]);
    expect(Math.abs(hue(teamPixel('carrot', 1, 235, 120, 40)) - 222)).toBeLessThan(6);
  });

  it('a white mug takes the team’s colour (the coffee has no hue to shift)', () => {
    const mug = teamPixel('coffee', 1, 240, 236, 228);
    expect(Math.abs(hue(mug) - 222)).toBeLessThan(8);
    expect(teamPixel('coffee', 1, 70, 40, 30)).toEqual([70, 40, 30]); // the coffee itself is dark and stays
  });

  it('recolours a buffer in place and never touches alpha or the empty', () => {
    const data = new Uint8ClampedArray([250, 245, 190, 255, 250, 245, 190, 0]);
    recolourPixels('bread', 1, data);
    expect(data[3]).toBe(255);
    expect(data[0]).not.toBe(250);
    expect([...data.slice(4)]).toEqual([250, 245, 190, 0]); // transparent: left alone
  });
});
