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
  readonly icon: 'burst' | 'shield' | 'extra' | 'multi' | undefined;
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
  CAFFEINATED: { name: 'CAFFEINATED', colour: '#e0a91f', icon: undefined, fromVideo: false },
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
});

/** How long the badge stays over the player (the video: 4:11.0 to 4:12.9). */
export const PICKUP_LABEL_SECONDS = 1.9;

/** The power's icon, white, as an SVG path in a 24 × 24 box. */
export const BADGE_ICON: Readonly<Record<NonNullable<PowerBadge['icon']>, string>> = Object.freeze({
  // a round burst with eight short spikes (the video's explosive icon)
  burst:
    'M12 3l1.6 3.1 3.3-1.2-.6 3.5 3.5.6-1.9 2.9 2.4 2.6-3.4 1 .3 3.5-3.3-1.3L12 21l-1.9-3.3-3.3 1.3.3-3.5-3.4-1 2.4-2.6-1.9-2.9 3.5-.6-.6-3.5 3.3 1.2z',
  // a shield
  shield: 'M12 3l7 2.6v5.6c0 4.4-2.9 8-7 9.8-4.1-1.8-7-5.4-7-9.8V5.6z',
  // an L-shaped boomerang with a small plus at its top right
  extra: 'M5 6h4v9h9v4H5zM16 3h2v2h2v2h-2v2h-2V7h-2V5h2z',
  // three curved arrows chasing round a ring
  multi:
    'M12 4a8 8 0 0 1 6.9 4l1.6-.9-.4 4.3-3.9-1.8 1.5-.9A6 6 0 0 0 12 6zM19.1 16a8 8 0 0 1-6.9 4v1.8l-3.5-2.5 3.5-2.5V18a6 6 0 0 0 5.2-3zM4.9 16a8 8 0 0 1 0-8l-1.6-.9 3.9-1.8.4 4.3-1.5-.9a6 6 0 0 0 0 6z',
});
