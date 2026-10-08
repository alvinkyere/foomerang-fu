"""Register a generated map in the game's TABLES (no renderer branches): rules export, the parameterized rules test, the console's arena
choice + playable-arena row, the reconstructed-map registry row (asset folder, seat roster, arena size), and the in-game e2e list.
Idempotent. python register_map.py <repo_root> <map> <CONST_PREFIX> <rules_module_basename> <background_hex> <kind1,kind2> [seat note]"""
import sys, os, re, json
ROOT, MAP, P, MOD, BG, KINDS = sys.argv[1:7]; NOTE = sys.argv[7] if len(sys.argv) > 7 else ''
cfg = json.load(open(os.path.join(ROOT, 'art/reconstruction/maps', f'{MAP}.json'))); roster = cfg['roster']
ts = open(os.path.join(ROOT, 'games/foomerang-fu/src/rules', f'{MOD}.ts')).read()
W = int(re.search(rf'{P}_WIDTH = (\d+)', ts).group(1)); H = int(re.search(rf'{P}_HEIGHT = (\d+)', ts).group(1))
T = ''.join(w.capitalize() for w in P.lower().split('_'))
def edit(rel, fn):
    p = os.path.join(ROOT, rel); s = open(p).read(); s2 = fn(s)
    if s2 != s: open(p, 'w').write(s2); print('updated', rel)
def idx(s):
    if f"from './{MOD}'" in s: return s
    return s.rstrip() + f"\nexport {{\n  {P}_ARENA,\n  {P}_BOOK_SPOTS,\n  {P}_HEIGHT,\n  {P}_SPAWNS,\n  {P}_WALLS,\n  {P}_WIDTH,\n}} from './{MOD}';\nexport type {{ {T}Wall }} from './{MOD}';\n"
edit('games/foomerang-fu/src/rules/index.ts', idx)
def test(s):
    if f'name: \'{MAP}\'' in s: return s
    s = s.replace("  createFuMatch,\n", f"  {P}_ARENA,\n  {P}_BOOK_SPOTS,\n  {P}_SPAWNS,\n  {P}_WALLS,\n  createFuMatch,\n", 1)
    kinds = ', '.join(f"'{k}'" for k in KINDS.split(','))
    return s.replace("const CASES: readonly Case[] = [", f"const CASES: readonly Case[] = [\n  {{ name: '{MAP}', arena: {P}_ARENA, walls: {P}_WALLS, spawns: {P}_SPAWNS, books: {P}_BOOK_SPOTS, kinds: [{kinds}] }},", 1)
edit('games/foomerang-fu/test/reconstructedArenas.test.ts', test)
def choice(s):
    if f"'{MAP}'" in s: return s
    return s.replace("] as const;", f"  '{MAP}',\n] as const;", 1) if 'export const ARENA_CHOICES = [' in s else s
edit('apps/console/src/runtime/powerupMode.ts', choice)
def arenas(s):
    if f'{MAP}:' in s: return s
    s = s.replace("  type FuArena,\n} from '@foomerang/foomerang-fu';", f"  {P}_ARENA,\n  {P}_BOOK_SPOTS,\n  type FuArena,\n}} from '@foomerang/foomerang-fu';", 1)
    return s.replace("\n});\n\n/** Which arena choice", f"\n  {MAP}: {{ arena: {P}_ARENA, bookSpots: {P}_BOOK_SPOTS, named: true }},\n}});\n\n/** Which arena choice", 1)
edit('apps/console/src/runtime/arenas.ts', arenas)
def maps(s):
    s = re.sub(r"Extract<ArenaChoice, ([^>]*)>", lambda m: m.group(0) if f"'{MAP}'" in m.group(1) else f"Extract<ArenaChoice, {m.group(1)} | '{MAP}'>", s, count=1)
    if f"  {MAP}: Object.freeze(" in s:
        return re.sub(rf"(  {MAP}: Object\.freeze\(\{{.*?arena: Object\.freeze\(\{{ width: )\d+(, height: )\d+", lambda m: f"{m.group(1)}{W}{m.group(2)}{H}", s, count=1, flags=re.S)
    row = (f"    // {NOTE}\n" if NOTE else '') + f"    {MAP}: Object.freeze({{\n      id: '{MAP}',\n      assetDir: 'maps/{MAP}/',\n      roster: Object.freeze([{', '.join(repr(r) for r in roster)}] as const),\n      arena: Object.freeze({{ width: {W}, height: {H} }}),\n      background: '{BG}',\n    }}),\n"
    return s.replace("  });\n\nexport const reconstructedMapFor", row + "  });\n\nexport const reconstructedMapFor", 1)
edit('apps/console/src/render/reconstructed/maps.ts', maps)
def e2e(s):
    return re.sub(r"for \(const map of \[([^\]]*)\] as const\)", lambda m: m.group(0) if f"'{MAP}'" in m.group(1) else f"for (const map of [{m.group(1)}, '{MAP}'] as const)", s, count=1)
edit('integration/e2e/reconstructedMaps.e2e.ts', e2e)
print('registered', MAP, W, 'x', H)
