/**
 * The end of a match, timed from the reference footage ("foomerang - fu physics.mp4", a Coffee win, 12:36.7–12:49.4). Every
 * figure is measured there (15 fps frames, so ±70 ms):
 *
 *   beatMs      the deciding kill → the iris starts closing (12:36.7 → 12:37.8)
 *   irisMs      the iris closes on the winner (12:37.8 → 12:38.2)
 *   darkMs      the final scoreboard alone on the dark → the arena back, dimmed, with CONTINUE (12:38.3 → 12:40.5)
 *   boardOutMs  CONTINUE → the scoreboard gone (12:42.9 → 12:43.3)
 *   titlePopMs  …→ "<CHARACTER> WINS!" pops in at the centre (12:43.3 → 12:43.7)
 *   titleUpMs   …→ it rises to the top (12:43.3 → 12:44.6)
 *   titleMs     …→ the first column appears (12:43.3 → 12:44.9)
 *   columnMs    one column to the next (12:44.9, 12:45.9, 12:47.0, 12:48.1: its circle, then its award pills 0.27 s apart)
 *   panelMs     the winner's circle → their panel grows behind it (12:48.07 → 12:48.33)
 *   buttonsMs   after the last column: BACK TO MENU slides in, REMATCH 0.27 s later; both in place (12:49.13 → 12:49.67)
 */
export const MATCH_END_TIMING = Object.freeze({
  beatMs: 1100,
  irisMs: 400,
  darkMs: 2200,
  boardOutMs: 400,
  titlePopMs: 400,
  titleUpMs: 1330,
  titleMs: 1600,
  columnMs: 1070,
  panelMs: 270,
  buttonsMs: 540,
});
