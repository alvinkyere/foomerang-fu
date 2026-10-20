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
  readonly icon: 'burst' | 'shield' | 'bolt' | 'pair';
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
  CAFFEINATED: { name: 'CAFFEINATED', colour: '#e0a91f', icon: 'bolt', fromVideo: false },
  TWIN_THROW: { name: 'TWIN THROW', colour: '#5fb83a', icon: 'pair', fromVideo: false },
});

/** How long the badge stays over the player (the video: 4:11.0 to 4:12.9). */
export const PICKUP_LABEL_SECONDS = 1.9;

/** The power's icon, white, as an SVG path in a 24 × 24 box. */
export const BADGE_ICON: Readonly<Record<PowerBadge['icon'], string>> = Object.freeze({
  // a round burst with eight short spikes (the video's explosive icon)
  burst:
    'M12 3l1.6 3.1 3.3-1.2-.6 3.5 3.5.6-1.9 2.9 2.4 2.6-3.4 1 .3 3.5-3.3-1.3L12 21l-1.9-3.3-3.3 1.3.3-3.5-3.4-1 2.4-2.6-1.9-2.9 3.5-.6-.6-3.5 3.3 1.2z',
  // a shield
  shield: 'M12 3l7 2.6v5.6c0 4.4-2.9 8-7 9.8-4.1-1.8-7-5.4-7-9.8V5.6z',
  // a lightning bolt
  bolt: 'M13 2L5 14h6l-1 8 8-12h-6z',
  // two boomerangs
  pair: 'M4 6h7v3H7v9H4zM13 6h7v3h-4v9h-3z',
});
