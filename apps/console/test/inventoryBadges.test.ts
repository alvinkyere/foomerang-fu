// @vitest-environment jsdom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { InventoryBadges } from '../src/render/three/inventoryBadges';

// The powers a player owns stay over their head all match, as in every HQ video (a row of round badges, oldest first).

const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

const setup = () => {
  const container = document.createElement('div');
  const canvas = document.createElement('canvas');
  container.append(canvas);
  document.body.append(container);
  return { container, badges: new InventoryBadges(container, canvas) };
};
const here = () => new THREE.Vector3(0, 1, 0);

describe('the powers a player owns', () => {
  it('shows a badge per power, oldest first, and keeps them over the player', () => {
    const { container, badges } = setup();
    badges.frame(
      camera,
      [{ id: 'a', powers: ['SHIELD', 'EXPLOSIVE_BOOMERANG'], dead: false }],
      here,
    );
    const row = container.querySelector('[data-inventory="a"]');
    expect([...(row?.children ?? [])].map((c) => (c as HTMLElement).dataset['power'])).toEqual([
      'SHIELD',
      'EXPLOSIVE_BOOMERANG',
    ]);
  });

  it('follows what the player owns: a new power joins the row, a lost one leaves it', () => {
    const { container, badges } = setup();
    badges.frame(camera, [{ id: 'a', powers: ['SHIELD'], dead: false }], here);
    badges.frame(camera, [{ id: 'a', powers: ['SHIELD', 'CAFFEINATED'], dead: false }], here);
    expect(container.querySelectorAll('[data-power]')).toHaveLength(2);
    badges.frame(camera, [{ id: 'a', powers: ['CAFFEINATED'], dead: false }], here);
    expect(
      [...container.querySelectorAll('[data-power]')].map(
        (c) => (c as HTMLElement).dataset['power'],
      ),
    ).toEqual(['CAFFEINATED']);
  });

  it('shows nothing for a player with no powers, a dead player, or one that is not drawn', () => {
    const { container, badges } = setup();
    badges.frame(
      camera,
      [
        { id: 'a', powers: [], dead: false },
        { id: 'b', powers: ['SHIELD'], dead: true },
        { id: 'c', powers: ['SHIELD'], dead: false },
      ],
      (id) => (id === 'c' ? undefined : here()),
    );
    expect(container.querySelectorAll('[data-inventory]')).toHaveLength(0);
  });

  it('is gone when destroyed', () => {
    const { container, badges } = setup();
    badges.frame(camera, [{ id: 'a', powers: ['SHIELD'], dead: false }], here);
    badges.destroy();
    expect(container.querySelectorAll('[data-inventory]')).toHaveLength(0);
  });
});
