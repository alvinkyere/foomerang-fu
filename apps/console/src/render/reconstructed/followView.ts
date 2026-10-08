/**
 * How a reconstructed map's baked canvas is framed on screen. The master video's camera holds its height and lens and PANS with
 * the action (harbour_fort's shot), so a canvas larger than the screen is viewed at the footage's scale (zoom 1), centred on
 * the living players, and zooms out only as far as needed to keep all of them (plus a margin) in view — never past the whole
 * canvas. Presentation only: it reads player positions, it decides nothing. Pure (no Phaser), so it can be tested.
 */
export interface Size {
  readonly width: number;
  readonly height: number;
}
export interface Point {
  readonly x: number;
  readonly y: number;
}
/** The visible canvas rectangle's top-left corner (canvas px) and the zoom (screen px per canvas px). */
export interface View {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

const place = (centre: number, visible: number, world: number): number =>
  visible >= world
    ? (world - visible) / 2
    : Math.min(Math.max(centre - visible / 2, 0), world - visible);

export function followView(players: readonly Point[], world: Size, view: Size, margin = 150): View {
  const minZoom = Math.min(1, view.width / world.width, view.height / world.height);
  if (players.length === 0)
    return {
      x: place(world.width / 2, view.width / minZoom, world.width),
      y: place(world.height / 2, view.height / minZoom, world.height),
      zoom: minZoom,
    };
  const xs = players.map((p) => p.x);
  const ys = players.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const zoom = Math.max(
    minZoom,
    Math.min(1, view.width / (x1 - x0 + 2 * margin), view.height / (y1 - y0 + 2 * margin)),
  );
  return {
    x: place((x0 + x1) / 2, view.width / zoom, world.width),
    y: place((y0 + y1) / 2, view.height / zoom, world.height),
    zoom,
  };
}
