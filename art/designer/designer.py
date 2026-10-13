"""32x32 sword designer: geometry + shading + outline -> art JSON + preview."""
import json, math, sys, os
from PIL import Image

N = 32
P0 = (2.6, 29.4)   # pommel end
P1 = (29.6, 2.4)   # tip
DX, DY = P1[0] - P0[0], P1[1] - P0[1]
L = math.hypot(DX, DY)
D = (DX / L, DY / L)
NRM = (D[1], -D[0])  # perpendicular; negative v = upper-left side (lit)

def uv(x, y):
    px, py = x + 0.5 - P0[0], y + 0.5 - P0[1]
    return px * D[0] + py * D[1], -(px * NRM[0] + py * NRM[1])

def at(s, v):
    """pixel coords for axis position s and offset v"""
    x = P0[0] + D[0] * s - NRM[0] * v
    y = P0[1] + D[1] * s - NRM[1] * v
    return int(math.floor(x)), int(math.floor(y))

def lerp(a, b, t): return a + (b - a) * t

def hexmix(a, b, t):
    a = [int(a[i:i + 2], 16) for i in (1, 3, 5)]; b = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(round(lerp(a[i], b[i], t)) for i in range(3))

# ---------------------------------------------------------------- profiles
SQ2 = math.sqrt(2)

def blade_half(spec, s):
    """continuous centre offset and half-width (px) — used by decorations"""
    lines, center = blade_lines(spec, s)
    if lines is None: return None, 0
    return center, max(lines, 1) / (2 * SQ2)

def blade_lines(spec, s):
    """number of diagonal pixel lines across the blade at s, and centre offset (px)"""
    b0 = spec['bladeStart']; tip = L - 0.2
    f = (s - b0) / (tip - b0)
    if f < 0 or f > 1: return None, 0
    n = spec.get('lines', 6)
    kind = spec.get('shape', 'straight')
    tipLen = spec.get('tipLen', 0.15)
    if kind == 'leaf':
        n = n * (0.7 + 0.45 * math.sin(math.pi * min(1, f * 1.1)))
    elif kind == 'broad_tip':
        n = n * (0.8 + 0.4 * f)
    elif kind == 'rapier':
        n = n * (1 - 0.3 * f)
    elif kind == 'slab':
        tipLen = 0.07
    if f > 1 - tipLen:
        k = (1 - f) / tipLen
        n = n * (0.6 + 0.4 * k) if kind == 'slab' else n * k
    center = 0.0
    if kind == 'saber': center = -1.7 * (f ** 2)
    if spec.get('wave'): center += spec['wave'] * math.sin(f * math.pi * spec.get('waves', 5))
    return n, center

def render(spec):
    g = [[None] * N for _ in range(N)]
    C = spec['colors']
    gripEnd = spec.get('gripEnd', 8.4)
    guardT = spec.get('guardThick', 2.4)
    spec.setdefault('bladeStart', gripEnd + guardT - 0.3)
    pom = spec.get('pommelLen', 2.8)
    for y in range(N):
        for x in range(N):
            s, v = uv(x, y)
            j = x + y - 31          # diagonal line index across the sword (neg = lit side)
            c = None
            n, center = blade_lines(spec, s)
            if n is not None and n >= 0.5:
                jc = round(center * SQ2)
                ni = max(1, int(round(n)))
                lo = -(ni // 2); hi = lo + ni - 1
                jr = j - jc
                if lo <= jr <= hi:
                    f = (s - spec['bladeStart']) / (L - spec['bladeStart'])
                    c = shade_blade(spec, f, jr - lo, ni, s)
                    serr = spec.get('serrate')
                    if serr and jr == hi and ni >= 4 and (int(s * 1.42) % serr) == 0 and f < 0.85:
                        c = None
            if c is None and gripEnd - 0.2 <= s <= gripEnd + guardT + 1.5:
                c = guard_pixel(spec, s - gripEnd, j, guardT)
            if c is None and pom - 0.3 <= s < gripEnd and -1 <= j <= spec.get('gripHi', 1):
                band = int(math.floor(s * 1.42)) % 3
                c = C['grip2'] if band == 0 else C['grip']
                if j == -1: c = hexmix(c, '#ffffff', 0.18)
            if c is None and s < pom:
                c = pommel_pixel(spec, s, v, pom)
            g[y][x] = c
    for deco in spec.get('deco', []):
        deco(g, spec)
    outline(g, C['outline'])
    return g

def shade_blade(spec, f, p, n, s):
    """p = 0 at the lit edge .. n-1 at the shadow edge"""
    C = spec['colors']
    edge, light, mid, dark = C['edge'], C['light'], C['mid'], C['dark']
    for (f0, f1, e2, l2, m2, d2) in spec.get('gradient', []):
        if f0 <= f <= f1:
            k = (f - f0) / max(f1 - f0, 1e-6)
            k = round(k * 3) / 3   # three distinct heat bands, not a smear of near-duplicates
            edge, light, mid, dark = hexmix(e2, edge, k), hexmix(l2, light, k), hexmix(m2, mid, k), hexmix(d2, dark, k)
    if n <= 2:
        col = edge if p == 0 else mid
    elif p == 0: col = edge
    elif p == n - 1: col = dark
    elif p < n * 0.5: col = light
    else: col = mid
    ful = spec.get('fuller')
    if ful and ful[0] <= f <= ful[1] and n >= 5 and p == n // 2:
        col = C.get('fuller', dark)
    if spec.get('glint') and p == 0 and int(s * 1.42) % 9 == 4: col = '#ffffff'
    return col

def guard_pixel(spec, ds, j, T):
    C = spec['colors']; st = spec.get('guard', 'cross'); hw = spec.get('guardLines', 7)
    a = abs(j)
    if st == 'none':
        inside = a <= 2 and 0 <= ds <= 0.8
        T = 0.8
    elif st == 'cross':
        inside = a <= hw and 0 <= ds <= T
    elif st == 'down':
        inside = a <= hw and 0 <= ds + 0.32 * max(0, a - 2) <= T
    elif st == 'up':
        inside = a <= hw and 0 <= ds - 0.32 * max(0, a - 2) <= T
    elif st == 'wing':
        inside = a <= hw and 0 <= ds - 0.42 * max(0, a - 2) <= T + 0.18 * a
    elif st == 'disc':
        inside = math.hypot((ds - T * 0.5) * 1.8, a / SQ2) <= hw / SQ2 * 0.95
    elif st == 'block':
        inside = a <= hw and 0 <= ds <= T + 0.4
    elif st == 'crescent':
        inside = a <= hw and 0 <= ds + 0.045 * a * a - 0.9 <= T * 0.75
    if not inside: return None
    gem = spec.get('gem')
    if gem and a <= 1 and 0.3 <= ds <= T - 0.2:
        return gem[1] if j < 0 else gem[0]
    tip = a >= hw - 1
    if tip: return C.get('guardTip', C['guard'])
    return C['guard'] if j < 0 else C['guard2']

def pommel_pixel(spec, s, v, pom):
    C = spec['colors']; st = spec.get('pommel', 'round')
    lit = C['pommel'] if v < 0.1 else C['pommel2']
    if st == 'round':
        if math.hypot(s - pom * 0.5, v) <= 1.75: return lit
    elif st == 'spike':
        if s >= -0.8 and abs(v) <= max(0.0, (s + 0.8) * 0.8) and s < pom: return lit
    elif st == 'ring':
        r = math.hypot(s - pom * 0.45, v)
        if 0.8 <= r <= 2.0: return lit
    elif st == 'horn':
        if math.hypot(s - pom * 0.6, v) <= 1.4: return lit
        for sg in (-1, 1):
            if 0 <= sg * v - 0.6 <= 1.8 and abs(s - 0.6 + 0.6 * (sg * v - 0.6)) <= 0.6: return lit
    elif st == 'gem':
        if math.hypot(s - pom * 0.5, v) <= 1.75:
            if abs(v) < 0.8 and abs(s - pom * 0.5) < 0.8: return C.get('pgem', C['pommel'])
            return lit
    return None

def outline(g, col):
    filled = [[g[y][x] is not None for x in range(N)] for y in range(N)]
    for y in range(N):
        for x in range(N):
            if filled[y][x]: continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < N and 0 <= yy < N and filled[yy][xx]:
                    g[y][x] = col; break

# ---------------------------------------------------------------- decorations
def put(g, s, v, col, only_filled=True):
    x, y = at(s, v)
    if 0 <= x < N and 0 <= y < N and (g[y][x] is not None or not only_filled):
        g[y][x] = col

def runes(col, every=4, start=0.15, end=0.8, v=0.0):
    def f(g, spec):
        b = spec['bladeStart']; span = L - b
        s = b + span * start
        while s < b + span * end:
            put(g, s, v, col); s += every
    return f

def line_glow(col, start, end, v=0.0, zig=0.0, period=2.4):
    def f(g, spec):
        b = spec['bladeStart']; span = L - b
        s = b + span * start
        while s <= b + span * end:
            off = zig * (1 if int(s / period) % 2 == 0 else -1) if zig else 0
            put(g, s, v + off, col); s += 0.5
    return f

def specks(col, positions):
    def f(g, spec):
        b = spec['bladeStart']; span = L - b
        for (fs, vv) in positions: put(g, b + span * fs, vv, col)
    return f

def edge_flames(col, col2, side=1, every=3.2, start=0.05, end=0.75, h=1.4):
    def f(g, spec):
        b = spec['bladeStart']; span = L - b
        s = b + span * start
        while s < b + span * end:
            c, hw = blade_half(spec, s)
            if c is None: break
            put(g, s, c + side * (hw + 0.9), col, False)
            put(g, s + 0.8, c + side * (hw + 0.9 + h * 0.6), col2, False)
            s += every
    return f

def tip_fork(col):
    def f(g, spec):
        put(g, L - 1.8, -1.5, col, False); put(g, L - 1.2, -2.2, col, False)
    return f

def vine(col, col2):
    def f(g, spec):
        s = 2.6
        while s < spec['bladeStart'] + 7:
            v = 1.3 * math.sin(s * 1.4)
            put(g, s, v, col, False)
            if int(s * 2) % 5 == 0: put(g, s + 0.5, v + 0.9, col2, False)
            s += 0.45
    return f

def drips(col, positions):
    def f(g, spec):
        for (fs) in positions:
            s = spec['bladeStart'] + (L - spec['bladeStart']) * fs
            c, hw = blade_half(spec, s)
            put(g, s - 0.6, c + hw + 1.0, col, False)
            put(g, s - 1.2, c + hw + 1.8, col, False)
    return f

def guard_spikes(col, n=2):
    def f(g, spec):
        hw = spec.get('guardHalf', 5)
        for side in (-1, 1):
            for k in range(n):
                put(g, spec.get('gripEnd', 8.2) + 1.6 + k * 0.9, side * (hw - 0.5 - k * 1.2), col, False)
    return f

# ---------------------------------------------------------------- output
CHARS = 'oabcdefghijklmnpqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

def merge_close(g, keep, limit=14):
    """Fold colours closer than `limit` (L1 over RGB) into the more common one."""
    from collections import Counter
    counts = Counter(c for r in g for c in r if c)
    rgb = lambda c: [int(c[i:i + 2], 16) for i in (1, 3, 5)]
    order = sorted(counts, key=lambda c: (c != keep, -counts[c]))
    target = {}
    kept = []
    for c in order:
        for k in kept:
            if sum(abs(a - b) for a, b in zip(rgb(c), rgb(k))) < limit:
                target[c] = k; break
        else:
            kept.append(c)
    for r in g:
        for i, c in enumerate(r):
            if c in target: r[i] = target[c]

def to_art(name, desc, g, outline_col):
    merge_close(g, outline_col)
    pal = {}; rows = []
    order = [outline_col] + sorted({c for r in g for c in r if c and c != outline_col})
    for i, c in enumerate(order): pal[c] = CHARS[i]
    for r in g: rows.append(''.join('.' if c is None else pal[c] for c in r))
    return {'name': name, 'description': desc, 'palette': {v: k for k, v in pal.items()}, 'pixels': rows}

def to_image(g):
    im = Image.new('RGBA', (N, N))
    for y in range(N):
        for x in range(N):
            c = g[y][x]
            if c: im.putpixel((x, y), tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
    return im
