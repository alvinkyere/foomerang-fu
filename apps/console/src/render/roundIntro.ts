/**
 * A round's start as the reference video shows it (0:30.96–0:34.4, timed from the iris opening; art/physics_reference/README.md,
 * "A round's start"). The rules hold everyone still for `seconds` (config `roundIntroSeconds`); the TV shows each character
 * landing in turn, READY, then GO. Pure timing.
 */
export const ROUND_INTRO = Object.freeze({
  /** From the round's start to GO: nobody moves or acts before it. */
  seconds: 2.84,
  /** The first character lands this long after the start (the banana, 31.78 − 30.96)… */
  firstLanding: 0.82,
  /** …and the next ones one after another, this far apart (31.78, 32.03, ~32.4, 32.73). */
  between: 0.32,
  /** Each is in the air this long before it lands, turning `flips` somersaults (the donut, 31.57–32.0). */
  air: 0.45,
  flips: 2,
  /** How high the jump goes, in body heights (read by eye). */
  height: 1.2,
  /** The crouch on landing: squashed to this, back up over `crouchFor` (read by eye: 32.0–32.1). */
  crouch: 0.78,
  crouchFor: 0.12,
  /** The white ring from its feet: out to `ringTo` body widths over `ringFor` seconds, fading (32.03–32.4). */
  ringTo: 1.8,
  ringFor: 0.4,
  /** READY is up from…to: the 0.983 s up to GO (the HQ video, 9:05.656–9:06.639; render/readyGo.ts draws it). */
  ready: [2.84 - 0.983, 2.84] as const,
  /** GO shows for this long once play starts (the HQ video, 9:06.639–9:07.322). */
  goFor: 0.683,
});

/** The big word over the arena: READY during the intro's window, GO for a moment once play starts; else nothing. */
export function introBanner(
  introElapsed: number | undefined,
  sinceGo: number | undefined,
): 'READY' | 'GO' | undefined {
  if (introElapsed !== undefined)
    return introElapsed >= ROUND_INTRO.ready[0] && introElapsed < ROUND_INTRO.ready[1]
      ? 'READY'
      : undefined;
  if (sinceGo !== undefined && sinceGo < ROUND_INTRO.goFor) return 'GO';
  return undefined;
}

export interface LandingPose {
  /** Drawn at all (not before its jump). */
  readonly visible: boolean;
  /** How high above its spot, in body heights. */
  readonly lift: number;
  /** Its somersault so far (radians, in the screen's plane). */
  readonly turn: number;
  /** Its height squash (1: none). */
  readonly squash: number;
  /** The ring from its feet: radius in body widths, and how opaque. */
  readonly ring?: { readonly radius: number; readonly opacity: number };
}

const STILL: LandingPose = Object.freeze({ visible: true, lift: 0, turn: 0, squash: 1 });

/** Where the `k`th character to land (0 first) is, `t` seconds into the intro. */
export function landingPose(t: number, k: number): LandingPose {
  const lands = ROUND_INTRO.firstLanding + ROUND_INTRO.between * k;
  const jumps = lands - ROUND_INTRO.air;
  if (t < jumps) return { visible: false, lift: 0, turn: 0, squash: 1 };
  if (t < lands) {
    const u = (t - jumps) / ROUND_INTRO.air; // 0 … 1 through the jump
    return {
      visible: true,
      lift: 4 * ROUND_INTRO.height * u * (1 - u),
      turn: u * ROUND_INTRO.flips * Math.PI * 2,
      squash: 1,
    };
  }
  const since = t - lands;
  if (since >= ROUND_INTRO.ringFor) return STILL;
  const crouched = since < ROUND_INTRO.crouchFor;
  return {
    visible: true,
    lift: 0,
    turn: 0,
    squash: crouched
      ? ROUND_INTRO.crouch + (1 - ROUND_INTRO.crouch) * (since / ROUND_INTRO.crouchFor)
      : 1,
    ring: {
      radius: ROUND_INTRO.ringTo * (0.25 + 0.75 * (since / ROUND_INTRO.ringFor)),
      opacity: 1 - since / ROUND_INTRO.ringFor,
    },
  };
}
