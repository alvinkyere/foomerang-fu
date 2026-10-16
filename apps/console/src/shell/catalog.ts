import fuArt from './art/fu-map.jpg';

/** What the shell shows for each game. Presentation data only: the session knows nothing of it. */
export interface CatalogGame {
  readonly id: string;
  readonly title: string;
  readonly art?: string;
  readonly comingSoon?: boolean;
  readonly tagline: string;
  readonly players?: string;
}

export const GAMES: readonly CatalogGame[] = [
  {
    id: 'foomerang-fu',
    title: 'Foomerang Fu',
    art: fuArt,
    tagline: 'Throw, slash and dash your way to the top.',
    players: '2–6 players',
  },
  { id: 'soon-1', title: 'Coming soon', comingSoon: true, tagline: 'More games are on the way.' },
  { id: 'soon-2', title: 'Coming soon', comingSoon: true, tagline: 'More games are on the way.' },
];
