/** What the console calls each game it can create. There is deliberately no catalogue. */
const GAME_TITLES: Readonly<Record<string, { title: string; subtitle: string }>> = {
  'foomerang-fu': { title: 'Foomerang Fu', subtitle: 'Combat skeleton — prototype' },
  'primitive-arena': { title: 'Foomerang', subtitle: 'Primitive arena — platform test' },
};
export const titleOf = (gameId: string | undefined): { title: string; subtitle: string } =>
  GAME_TITLES[gameId ?? ''] ?? { title: 'Foomerang', subtitle: '' };
