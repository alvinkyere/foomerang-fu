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

  it('the powers the video has not shown picked up yet are marked so', () => {
    expect(POWER_BADGE.CAFFEINATED.fromVideo).toBe(false);
    expect(POWER_BADGE.TWIN_THROW.fromVideo).toBe(false);
  });

  it('it stays up ~1.9 s', () => {
    expect(PICKUP_LABEL_SECONDS).toBeCloseTo(1.9, 6);
  });
});
