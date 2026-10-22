import type { PowerKind } from '@foomerang/foomerang-fu';

/**
 * The badge a player gets on taking a power Book, as the reference video shows it (art/physics_reference/README.md, "The power
 * Book"): a bar in the power's colour with its name in white capitals and, above it, a disc of the same colour with the power's
 * white icon, held over the player for ~1.9 s (4:11.0–4:12.9). Colours are sampled from the video where it shows that power
 * being taken (`fromVideo`); the others keep their old colours until the video is studied for them.
 */
export interface PowerBadge {
  readonly name: string;
  readonly colour: string;
  /** The white icon on its disc, as the video shows it; undefined until the video is studied for that power (a plain disc). */
  readonly icon:
    | 'burst'
    | 'shield'
    | 'extra'
    | 'multi'
    | 'snowflake'
    | 'flame'
    | 'skull'
    | 'fastForward'
    | 'sparkles'
    | undefined;
  readonly fromVideo: boolean;
}

export const POWER_BADGE: Readonly<Record<PowerKind, PowerBadge>> = Object.freeze({
  EXPLOSIVE_BOOMERANG: {
    name: 'EXPLOSIVE BOOMERANG',
    colour: '#cf2427',
    icon: 'burst',
    fromVideo: true,
  },
  SHIELD: { name: 'SHIELD', colour: '#6397e9', icon: 'shield', fromVideo: true },
  // 3:48.1: a green bar; the icon two arrowheads (fast forward)
  CAFFEINATED: { name: 'CAFFEINATED', colour: '#5acb86', icon: 'fastForward', fromVideo: true },
  // 7:16.6: a grey bar; the icon an L-shaped boomerang with a small plus
  EXTRA_BOOMERANG: {
    name: 'EXTRA BOOMERANG',
    colour: '#9d9a9b',
    icon: 'extra',
    fromVideo: true,
  },
  // 4:04.6: a yellow bar; the icon three curved arrows chasing round a ring
  MULTI_BOOMERANG: {
    name: 'MULTI BOOMERANG',
    colour: '#d4c227',
    icon: 'multi',
    fromVideo: true,
  },
  // 5:57.1: a light-blue bar; the icon a snowflake
  ICE_BOOMERANG: {
    name: 'ICE BOOMERANG',
    colour: '#92d8fd',
    icon: 'snowflake',
    fromVideo: true,
  },
  // 6:51: an orange bar; the icon a flame
  FIRE_BOOMERANG: {
    name: 'FIRE BOOMERANG',
    colour: '#e29854',
    icon: 'flame',
    fromVideo: true,
  },
  // 4:37.7: a dark purple bar; the icon a skull
  BATTLE_ROYALE: {
    name: 'BATTLE ROYALE',
    colour: '#433065',
    icon: 'skull',
    fromVideo: true,
  },
  // ff physics hq 2.mp4 11:30.75 (and the first video, 9:15.3): a pink-red bar; the icon two four-pointed sparkles
  TELEPORT_BOOMERANG: {
    name: 'TELEPORT BOOMERANG',
    colour: '#d01e75',
    icon: 'sparkles',
    fromVideo: true,
  },
});

/** How long the badge stays over the player: from the take to gone (re-read every frame at 4:03.98–4:06.07; pickupMotion.ts). */
export const PICKUP_LABEL_SECONDS = 2.07;

/** The power's icon, white, as an SVG path in a 24 × 24 box. */
export const BADGE_ICON: Readonly<Record<NonNullable<PowerBadge['icon']>, string>> = Object.freeze({
  // a round burst with eight short spikes (the video's explosive icon)
  burst:
    'M12 3l1.6 3.1 3.3-1.2-.6 3.5 3.5.6-1.9 2.9 2.4 2.6-3.4 1 .3 3.5-3.3-1.3L12 21l-1.9-3.3-3.3 1.3.3-3.5-3.4-1 2.4-2.6-1.9-2.9 3.5-.6-.6-3.5 3.3 1.2z',
  // a shield
  shield: 'M12 3l7 2.6v5.6c0 4.4-2.9 8-7 9.8-4.1-1.8-7-5.4-7-9.8V5.6z',
  // an L-shaped boomerang with a small plus at its top right
  extra: 'M5 6h4v9h9v4H5zM16 3h2v2h2v2h-2v2h-2V7h-2V5h2z',
  // a skull
  skull:
    'M12 3a8 8 0 0 0-8 8c0 2.4 1 4 2.5 5v3h3v-2h1v2h3v-2h1v2h3v-3c1.5-1 2.5-2.6 2.5-5a8 8 0 0 0-8-8zM8.5 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  // two arrowheads: fast forward
  fastForward: 'M3 6l8 6-8 6zM12 6l8 6-8 6z',
  // two four-pointed sparkles: a big one up and right, a small one down and left
  sparkles:
    'M15 2c.6 3.7 2.3 5.4 6 6-3.7.6-5.4 2.3-6 6-.6-3.7-2.3-5.4-6-6 3.7-.6 5.4-2.3 6-6zM7 12.5c.4 2.3 1.2 3.1 3.5 3.5-2.3.4-3.1 1.2-3.5 3.5-.4-2.3-1.2-3.1-3.5-3.5 2.3-.4 3.1-1.2 3.5-3.5z',
  // a flame
  flame:
    'M12 2c1 3.5 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4.3 2.5-5.3.2 1.8.9 3 2 3.6C10.6 8.4 11.3 5 12 2z',
  // a six-armed snowflake
  snowflake:
    'M11 2h2v4.3l2.2-1.3 1 1.7L13 9v2.3l2-1.2V6.7l2-1.1v3.3l3.7-2.2 1 1.7-3.7 2.2 2.9 1.7-1 1.7-2.9-1.7-2 1.2 2 1.2 2.9-1.7 1 1.7-2.9 1.7 3.7 2.2-1 1.7-3.7-2.2v3.3l-2-1.1v-3.4l-2-1.2V15l3.2 2.3-1 1.7-2.2-1.3V22h-2v-4.3l-2.2 1.3-1-1.7L11 15v-2.3l-2 1.2v3.4l-2 1.1V15l-3.7 2.2-1-1.7L6 13.3 3.1 11.6l1-1.7L7 11.6l2-1.2-2-1.2-2.9 1.7-1-1.7L6 7.5 2.3 5.3l1-1.7L7 5.8V2.5l2 1.1V7l2 1.2V5.9L7.8 3.6l1-1.7L11 3.2z',
  // three curved arrows chasing round a ring
  multi:
    'M12 4a8 8 0 0 1 6.9 4l1.6-.9-.4 4.3-3.9-1.8 1.5-.9A6 6 0 0 0 12 6zM19.1 16a8 8 0 0 1-6.9 4v1.8l-3.5-2.5 3.5-2.5V18a6 6 0 0 0 5.2-3zM4.9 16a8 8 0 0 1 0-8l-1.6-.9 3.9-1.8.4 4.3-1.5-.9a6 6 0 0 0 0 6z',
});
