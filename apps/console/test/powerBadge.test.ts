import { describe, expect, it } from 'vitest';
import { POWER_BADGE, PICKUP_LABEL_SECONDS } from '../src/render/powerBadge';

// What a player sees on picking up a power Book, as the reference video shows it (4:11 EXPLOSIVE BOOMERANG, 10:15 SHIELD): a bar
// in the power's colour with its name in white capitals, a disc above it in the same colour with the power's white icon, over
// the player for ~1.9 s. The colours are sampled from the video where it shows that power; the rest are flagged.

describe('the pickup badge', () => {
  it('Explosive: red, "EXPLOSIVE BOOMERANG", the burst icon (4:11)', () => {
    expect(POWER_BADGE.EXPLOSIVE_BOOMERANG).toMatchObject({
      name: 'EXPLOSIVE BOOMERANG',
      colour: '#cf2427',
      icon: 'burst',
      fromVideo: true,
    });
  });

  it('Shield: blue, "SHIELD", the shield icon (10:15)', () => {
    expect(POWER_BADGE.SHIELD).toMatchObject({
      name: 'SHIELD',
      colour: '#6397e9',
      icon: 'shield',
      fromVideo: true,
    });
  });

  it('Extra: grey, "EXTRA BOOMERANG", the boomerang icon (7:16.6)', () => {
    expect(POWER_BADGE.EXTRA_BOOMERANG).toMatchObject({
      name: 'EXTRA BOOMERANG',
      colour: '#9d9a9b',
      icon: 'extra',
      fromVideo: true,
    });
  });

  it('Multi: yellow, "MULTI BOOMERANG", the ring-of-arrows icon (4:04.6)', () => {
    expect(POWER_BADGE.MULTI_BOOMERANG).toMatchObject({
      name: 'MULTI BOOMERANG',
      colour: '#d4c227',
      icon: 'multi',
      fromVideo: true,
    });
  });

  it('Ice: light blue, "ICE BOOMERANG", the snowflake icon (5:57.1)', () => {
    expect(POWER_BADGE.ICE_BOOMERANG).toMatchObject({
      name: 'ICE BOOMERANG',
      colour: '#92d8fd',
      icon: 'snowflake',
      fromVideo: true,
    });
  });

  it('Fire: orange, "FIRE BOOMERANG", the flame icon (6:51)', () => {
    expect(POWER_BADGE.FIRE_BOOMERANG).toMatchObject({
      name: 'FIRE BOOMERANG',
      colour: '#e29854',
      icon: 'flame',
      fromVideo: true,
    });
  });

  it('Battle Royale: dark purple, "BATTLE ROYALE", the skull icon (4:37.7)', () => {
    expect(POWER_BADGE.BATTLE_ROYALE).toMatchObject({
      name: 'BATTLE ROYALE',
      colour: '#433065',
      icon: 'skull',
      fromVideo: true,
    });
  });

  it('Caffeinated: green, "CAFFEINATED", the fast-forward icon (3:48.1)', () => {
    expect(POWER_BADGE.CAFFEINATED).toMatchObject({
      name: 'CAFFEINATED',
      colour: '#5acb86',
      icon: 'fastForward',
      fromVideo: true,
    });
  });

  it('every power now has its badge from the video', () => {
    for (const badge of Object.values(POWER_BADGE)) expect(badge.fromVideo).toBe(true);
  });

  it('it stays up 2.07 s, take to gone (4:03.98–4:06.07)', () => {
    expect(PICKUP_LABEL_SECONDS).toBeCloseTo(2.07, 6);
  });
});
