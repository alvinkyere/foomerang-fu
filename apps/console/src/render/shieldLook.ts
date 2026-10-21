/**
 * The Shield's bubble and its pop, as the reference video draws them (6:54.38 the eggplant's bubble at 3.5×; 8:54.12–8:54.25
 * the donut's bubble breaking, read every frame; art/physics_reference/README.md, "Shield"). Pure.
 *
 * The bubble: a clear sphere round the body, ≈ 1.85 character widths across, centred about half a body up. Its rim is pale
 * cyan-white (#d4fcfa), a light pink-lilac (#eed8f4) on its right with a thin magenta line (#e07ad0), and a white highlight at
 * its top left; inside it is nearly clear. It is there while the player owns the Shield.
 * The pop: it is gone in one frame, broken into about ten small pink fragments (#e88fd5) that fly out ≈ 0.6 W and vanish in
 * 0.1 s.
 */
export const SHIELD_LOOK = Object.freeze({
  diameter: 1.85,
  centre: 0.5,
  rim: '#d4fcfa',
  rimPink: '#eed8f4',
  rimLine: '#e07ad0',
  highlight: '#ffffff',
  fragments: 10,
  fragment: '#e88fd5',
  fragmentTravel: 0.6,
  popMs: 100,
});

/** Fragment `i` of a pop: its direction (radians) in the screen's plane. */
export const fragmentAngle = (i: number): number => (i / SHIELD_LOOK.fragments) * Math.PI * 2 + 0.3;
