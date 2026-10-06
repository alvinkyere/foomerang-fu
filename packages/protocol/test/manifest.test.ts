import { describe, expect, it } from 'vitest';
import {
  CONTROLLER_ORIENTATIONS,
  CONTROL_TYPES,
  controllerManifestMessageSchema,
  controllerManifestSchema,
} from '../src/index';
import { parseClientMessage, parseServerMessage } from '../src/parse';

const manifest = {
  gameId: 'foomerang-fu',
  orientation: 'landscape',
  controls: [{ id: 'MOVE', type: 'joystick' }],
};

const parse = (value: unknown) => controllerManifestSchema.safeParse(value);

describe('controller manifest (what the controller should render — never hard-coded per game)', () => {
  it('knows exactly the control types the controller implements: joystick and button', () => {
    expect([...CONTROL_TYPES]).toEqual(['joystick', 'button']);
    expect([...CONTROLLER_ORIENTATIONS]).toEqual(['landscape', 'portrait', 'any']);
  });

  it('accepts the primitive prototype manifest: MOVE is a joystick', () => {
    expect(parse(manifest).success).toBe(true);
  });

  it.each(CONTROLLER_ORIENTATIONS)('accepts orientation preference %s', (orientation) => {
    expect(parse({ ...manifest, orientation }).success).toBe(true);
  });

  it('accepts several controls with distinct ids (room to grow without redesign)', () => {
    const many = {
      ...manifest,
      controls: [
        { id: 'MOVE', type: 'joystick' },
        { id: 'AIM', type: 'joystick' },
      ],
    };
    expect(parse(many).success).toBe(true);
  });

  it('accepts a button, which names the generic action it sends (Foomerang Fu: MOVE joystick + THROW button)', () => {
    const fu = {
      ...manifest,
      controls: [
        { id: 'MOVE', type: 'joystick' },
        { id: 'THROW', type: 'button', action: 'PRIMARY' },
      ],
    };
    expect(parse(fu).success).toBe(true);
  });

  it('accepts two buttons that send different actions', () => {
    const two = {
      ...manifest,
      controls: [
        { id: 'THROW', type: 'button', action: 'PRIMARY' },
        { id: 'DASH', type: 'button', action: 'SECONDARY' },
      ],
    };
    expect(parse(two).success).toBe(true);
  });

  it.each([
    ['a button with no action', { ...manifest, controls: [{ id: 'THROW', type: 'button' }] }],
    [
      'a button with an unknown action',
      { ...manifest, controls: [{ id: 'THROW', type: 'button', action: 'TERTIARY' }] },
    ],
    [
      'a button with a lowercase action',
      { ...manifest, controls: [{ id: 'THROW', type: 'button', action: 'primary' }] },
    ],
    [
      'two buttons sending the same action (the game could not tell them apart)',
      {
        ...manifest,
        controls: [
          { id: 'THROW', type: 'button', action: 'PRIMARY' },
          { id: 'DASH', type: 'button', action: 'PRIMARY' },
        ],
      },
    ],
    [
      'a joystick that claims an action',
      { ...manifest, controls: [{ id: 'MOVE', type: 'joystick', action: 'PRIMARY' }] },
    ],
    [
      'a button with an unknown field',
      {
        ...manifest,
        controls: [{ id: 'THROW', type: 'button', action: 'PRIMARY', color: 'red' }],
      },
    ],
    [
      'an unknown control type',
      { ...manifest, controls: [{ id: 'MOVE', type: 'steering-wheel' }] },
    ],
    ['no controls', { ...manifest, controls: [] }],
    [
      'too many controls',
      {
        ...manifest,
        controls: Array.from({ length: 17 }, (_, i) => ({ id: `C${i}`, type: 'joystick' })),
      },
    ],
    [
      'duplicate control ids',
      {
        ...manifest,
        controls: [
          { id: 'MOVE', type: 'joystick' },
          { id: 'MOVE', type: 'joystick' },
        ],
      },
    ],
    ['a lowercase control id', { ...manifest, controls: [{ id: 'move', type: 'joystick' }] }],
    ['an empty control id', { ...manifest, controls: [{ id: '', type: 'joystick' }] }],
    [
      'a control id starting with a digit',
      { ...manifest, controls: [{ id: '1MOVE', type: 'joystick' }] },
    ],
    [
      'an over-long control id',
      { ...manifest, controls: [{ id: 'A'.repeat(33), type: 'joystick' }] },
    ],
    ['an unknown orientation', { ...manifest, orientation: 'diagonal' }],
    ['a missing orientation', { gameId: manifest.gameId, controls: manifest.controls }],
    ['a bad game id', { ...manifest, gameId: 'Foomerang Fu' }],
    ['an unknown field on the manifest', { ...manifest, theme: 'dark' }],
    [
      'an unknown field on a control',
      { ...manifest, controls: [{ id: 'MOVE', type: 'joystick', size: 99 }] },
    ],
    ['controls that are not an array', { ...manifest, controls: { id: 'MOVE', type: 'joystick' } }],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(parse(value).success).toBe(false);
  });

  it('travels as a server → client CONTROLLER_MANIFEST message and only in that direction', () => {
    const message = { type: 'CONTROLLER_MANIFEST', payload: manifest };
    expect(controllerManifestMessageSchema.safeParse(message).success).toBe(true);
    expect(parseServerMessage(message).ok).toBe(true);
    expect(parseClientMessage(message).ok).toBe(false); // a client cannot tell the server what to render
  });
});
