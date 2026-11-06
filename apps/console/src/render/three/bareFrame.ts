/** `?bare=on` (a developer's check, with `?frame=hq`): draw the map alone, without the players, their boomerangs or the pickups. */
export function isBareFrame(search: string): boolean {
  return new URLSearchParams(search).get('bare') === 'on';
}

/** The view with its actors taken out; the map's own moving parts (sliders, turntables, gates) are kept. */
export function withoutActors<
  V extends {
    readonly circles: readonly unknown[];
    readonly boomerangs: readonly unknown[];
    readonly pickups: readonly unknown[];
  },
>(view: V): V {
  return { ...view, circles: [], boomerangs: [], pickups: [] };
}
