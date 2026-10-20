"""Bake the character-select animations of game-setting.mp4 (owner, 2026-10-20): what a character does in its big circle while a
player's cursor is on it. blender -b --python bake_select_anims.py -- <outdir> <size> <char,...> [rest]
With `rest`, only the rest pose (<name>_rest.png), to compare the look with the video.

Measured in the video (30 fps; Banana P1 frames 135-347, Milk P1 38-104; a character is ~53-65 px tall in the 640 px frame), the
same for every character:
 * ARRIVE: the character appears turned ~TURN_IN deg the way the cursor moved and faces the front in ARRIVE_FRAMES (ease-out);
   the hand on that side leads the idle loop that follows. One sequence per side.
 * BLINK and CHEER: see BLINK_AT and CHEER below (the faces are select_face.py's).
 * IDLE: a 40-frame loop. The hands rise in turn (HAND_LIFT of the height and HAND_IN inwards; low ~8 frames, rising ~16, a short
   top, falling ~12), the body leans ROLL deg and shifts SWAY towards the raised hand, and hops HOP at each hand's peak.
The look (camera, hands, colours, Banana upright) is select_rig.py's, fitted on the video by fit_select_look.py.
Output per character: <name>_idle_NN.png, <name>_arrive_{left,right}_NN.png, <name>_cheer_NN.png, <name>_blink_NN.png;
anims.json (frame counts, fps)."""
import bpy, json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import select_rig as R  # noqa: E402

args = sys.argv[sys.argv.index('--') + 1:]; OUT = os.path.abspath(args[0]); SIZE = int(args[1]); CHARS = args[2].split(',')
REST_ONLY = len(args) > 3 and args[3] == 'rest'
os.makedirs(OUT, exist_ok=True)

FPS = 30
IDLE_FRAMES = 40
ARRIVE_FRAMES = 5
TURN_IN = 27.0          # deg: the eyes shift 4-4.5 px on a ~10 px head radius
# The video's moves as fractions of the character's height ON SCREEN (hands 5 px up and 3 px in, eyes 2 px side to side and 1.3 px
# up, of ~53-65 px). Through the select camera a move of x model heights shows as ~x / CAL of the on-screen height (measured on
# Milk's hands: 0.114 shown for 0.146 asked), so each is given as the video fraction x CAL.
CAL = 1.25
HAND_LIFT = 0.077 * 1.13    # the hands' own factor (measured: 0.083 shown for 0.096 asked; the video's is 0.075)
HAND_IN = 0.045 * 1.13
ROLL = 1.2              # deg: with no sideways shift this moves the eyes ~0.03 of the height side to side, as the video's 2 px
SWAY = 0.0              # the video's eye tilt (+-3 deg read off eyes 13 px apart) was within its 1 px noise: no extra shift
HOP = 0.02 * CAL


def lift(phase):
    """One hand's lift (0 low .. 1 high) at loop phase 0..1, as tracked: low ~8 frames, rising ~16, a short top ~4, falling ~12."""
    p = (phase % 1.0) * IDLE_FRAMES
    ease = lambda u: 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, u)))
    if p < 8: return 0.0
    if p < 24: return ease((p - 8) / 16)
    if p < 28: return 1.0
    return 1.0 - ease((p - 28) / 12)


# The READY cheer (Banana P1 frames 630-658; Watermelon 463-486 and Donut 711-740 the same): 28 frames. Values are fractions of
# the character's on-screen height (x CAL for the body, x HAND_CAL for the hands) and degrees; (frame, value) keys, eased.
CHEER_FRAMES = 28
HAND_CAL = 1.13
CHEER = {
    'left_up': [(0, 0), (3, 0), (8, 0.48), (23, 0.48), (28, 0)],       # the screen-left hand is thrown up...
    'left_in': [(0, 0), (3, -0.11), (8, 0.0), (23, 0.0), (28, 0)],     # ...after a swing out, staying out to the side
    'right_up': [(0, 0), (4, 0.05), (7, 0), (28, 0)],
    'right_in': [(0, 0), (5, -0.12), (24, -0.12), (28, 0)],            # the other hand goes out and stays out
    'roll': [(0, 0), (4, 0), (8, -10.0), (24, -10.0), (28, 0)],        # the body leans ~10 deg to the screen right
    'hop': [(0, 0), (3, 0), (5, 0.04), (7, 0), (23, 0), (25, 0.03), (27, 0)],
}
HAPPY_UNTIL = 24                     # the happy face until here, then the face as before
WOBBLE = 0.016                       # the raised hand trembles while held (+-1 px), every ~6 frames
BLINK_AT = (0, 10, 20, 30)           # idle frames a blink may start at (the console picks which, at random)
BLINK_FRAMES = 3                     # eyes shut for 2-3 frames in the video


def keyed(keys, t):
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = (t - t0) / (t1 - t0) if t1 > t0 else 1.0
            return v0 + (v1 - v0) * (0.5 - 0.5 * math.cos(math.pi * u))
    return keys[-1][1]


def cheer(rig, t):
    held = 8 <= t <= 23
    wob = WOBBLE * math.sin(2 * math.pi * (t - 8) / 6) if held else 0.0
    rig.pose(roll_deg=keyed(CHEER['roll'], t), hop=keyed(CHEER['hop'], t) * CAL,
             lifts=((keyed(CHEER['left_up'], t) + wob) * HAND_CAL, keyed(CHEER['right_up'], t) * HAND_CAL),
             inward=(keyed(CHEER['left_in'], t) * HAND_CAL, keyed(CHEER['right_in'], t) * HAND_CAL),
             face='happy' if t < HAPPY_UNTIL else 'normal')


def idle(rig, phase, yaw=0.0, face='normal'):
    lL, lR = lift(phase), lift(phase + 0.5)
    lean = lL - lR                                 # +1: the screen-left hand is up, the body leans to the screen left
    rig.pose(yaw_deg=yaw, roll_deg=lean * ROLL, shift=lean * SWAY, hop=HOP * max(lL, lR) ** 2,
             lifts=(HAND_LIFT * lL, HAND_LIFT * lR), inward=(HAND_IN * lL, HAND_IN * lR), face=face)


sc, cam = R.setup_scene(SIZE)
meta = dict(fps=FPS, size=SIZE, sequences={'arrive_left': ARRIVE_FRAMES, 'arrive_right': ARRIVE_FRAMES, 'idle': IDLE_FRAMES,
                                          'cheer': CHEER_FRAMES, 'blink': len(BLINK_AT) * BLINK_FRAMES}, chars=[])
for name in CHARS:
    rig = R.Rig(name); rig.frame(cam)

    def shoot(path):
        sc.render.filepath = os.path.join(OUT, path); bpy.ops.render.render(write_still=True)

    if REST_ONLY:
        rig.pose(); shoot(f'{name}_rest.png'); continue
    for i in range(IDLE_FRAMES):
        idle(rig, i / IDLE_FRAMES); shoot(f'{name}_idle_{i:02d}.png')
    for side, sign, lead in (('left', 1, 0.0), ('right', -1, 0.5)):
        for i in range(ARRIVE_FRAMES):
            u = (i + 1) / ARRIVE_FRAMES; ease = 1 - (1 - u) ** 3
            # the loop runs into its start (phase `lead`: that side's hand about to rise) as the turn ends
            idle(rig, (lead - (ARRIVE_FRAMES - i) / IDLE_FRAMES) % 1.0, yaw=sign * TURN_IN * (1 - ease))
            shoot(f'{name}_arrive_{side}_{i:02d}.png')
    for i in range(CHEER_FRAMES):
        cheer(rig, i); shoot(f'{name}_cheer_{i:02d}.png')
    k = 0
    for start in BLINK_AT:                 # the idle frames again, eyes shut
        for j in range(BLINK_FRAMES):
            idle(rig, (start + j) / IDLE_FRAMES, face='blink'); shoot(f'{name}_blink_{k:02d}.png'); k += 1
    meta['chars'].append(name)
if not REST_ONLY:
    json.dump(meta, open(os.path.join(OUT, 'anims.json'), 'w'), indent=1)
print('select anims baked', OUT)
