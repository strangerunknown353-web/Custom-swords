import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from designer import *
from PIL import Image

STEEL = dict(edge='#f4f6fb', light='#c9ced9', mid='#8f96a6', dark='#5a6070')

def C(**kw):
    base = dict(outline='#0b0a10', grip='#3a2a22', grip2='#5a4232', guard='#c9a04a', guard2='#7a5a1e',
                pommel='#d8b25a', pommel2='#8a6420', fuller='#5a6070', **STEEL)
    base.update(kw); return base

S = {}

S['ember_blade'] = dict(name='Ember Blade',
    desc='A slim, straight duelling blade of polished steel whose lower third still glows with forge heat, fading to a keen grey point. Compact brass cross-guard with a live ember gem, dark wire-wrapped grip, round brass pommel.',
    lines=5, shape='straight', fuller=(0.05, 0.7), glint=True,
    gradient=[(0.0, 0.4, '#fff1b0', '#ffb347', '#e0621a', '#8a2a0e')],
    colors=C(fuller='#4a4f5c'), guard='cross', guardLines=7, gem=('#ff7a1a', '#ffd27a'), pommel='round')

S['inferno_sword'] = dict(name='Inferno Sword',
    desc='A broad, heavy blade of black-forged iron with a molten seam glowing white-hot down the fuller and flames licking from its back edge. Horned obsidian guard, scorched grip, brass pommel.',
    lines=7, shape='straight', fuller=(0.02, 0.82),
    colors=C(edge='#ffd38a', light='#e2672a', mid='#9a2e14', dark='#4a1410', fuller='#fff0a0',
             guard='#5a4652', guard2='#2e2228', guardTip='#ff6a2a', grip='#3a1e14', grip2='#5c2e1a'),
    guard='up', guardLines=9, gem=('#ff4a1a', '#ffb070'), pommel='round',
    deco=[edge_flames('#ff8a1a', '#ffd34a', side=1, every=3.4, end=0.7)])

S['thunder_sword'] = dict(name='Thunder Sword',
    desc='A long, narrow storm-iron blade with a forked tip; a live arc of gold lightning crawls the fuller. Copper guard swept back like wings, dark corded grip, gold pommel.',
    lines=5, shape='straight', tipLen=0.12,
    colors=C(edge='#e8f0ff', light='#a8b4d0', mid='#5c6684', dark='#2e3450', guard='#e08a4a', guard2='#8a4a22',
             grip='#20202c', grip2='#3a3a4e'),
    guard='wing', guardLines=9, gem=('#ffd84a', '#fff6c0'), pommel='spike',
    deco=[line_glow('#ffe14a', 0.04, 0.86, zig=0.55, period=2.2), tip_fork('#e8f0ff')])

S['frost_sword'] = dict(name='Frost Sword',
    desc='Grown rather than forged: a crystalline blade of alternating ice facets, near-white where they catch the light and glacier blue where they do not, with frost spikes on the guard. Rimed silver guard, cold-wrapped grip, faceted crystal pommel.',
    lines=6, shape='straight', wave=0.35, waves=9, glint=True,
    colors=C(edge='#ffffff', light='#bff0ff', mid='#5fb8e8', dark='#2a6aa8', guard='#e0ecf4', guard2='#8aa6bc',
             grip='#2a3a52', grip2='#4a6282', pommel='#bff0ff', pommel2='#5fb8e8', pgem='#ffffff'),
    guard='up', guardLines=8, gem=('#7ad8ff', '#e8fbff'), pommel='gem',
    deco=[guard_spikes('#e8fbff', 2)])

S['wind_sword'] = dict(name='Wind Sword',
    desc='A slim, guardless sabre of pale sky-metal curving forward as if drawn by the air, with a pale teal edge; wrapped grip and a ring pommel.',
    lines=4, shape='saber', bladeStart=8.6, glint=True,
    colors=C(edge='#ffffff', light='#d6f5f0', mid='#8fd3c8', dark='#4a9a92', guard='#d6f5f0', guard2='#8fd3c8',
             grip='#3a5a5a', grip2='#5a8282', pommel='#d6f5f0', pommel2='#6aa8a0'),
    guard='none', pommel='ring')

S['earth_sword'] = dict(name='Earth Sword',
    desc='A squat, very broad slab of banded deepslate with a blunt chisel end and glowing amber crystal veins down its centre; iron-shod block guard and a stone-weighted pommel.',
    lines=8, shape='slab',
    colors=C(edge='#b8b0a4', light='#8a8278', mid='#5c564e', dark='#38342e', guard='#8a8a92', guard2='#4a4a52',
             grip='#3a2e22', grip2='#5a4632', pommel='#6a645c', pommel2='#3e3a34'),
    guard='block', guardLines=8, guardThick=2.8, pommel='round',
    deco=[runes('#ffb84a', every=3.2, start=0.08, end=0.85), specks('#ffe08a', [(0.3, -0.9), (0.55, 0.9), (0.75, -0.8)])])

S['tidal_sword'] = dict(name='Ocean Sword',
    desc='A flamberge whose edge undulates like a swell, cast in prismarine and abyssal teal with a pearl-white crest; coral-branch guard, kelp-wound grip and a pearl pommel.',
    lines=6, shape='straight', wave=0.75, waves=4, fuller=(0.05, 0.75), glint=True,
    colors=C(edge='#e8fff8', light='#6fe3cf', mid='#1f9a9a', dark='#0d4a5c', fuller='#0a3a4a', guard='#ff8a7a', guard2='#b8483e',
             grip='#2a4a2a', grip2='#3e6a3a', pommel='#f4f4ff', pommel2='#b0b4d0'),
    guard='up', guardLines=8, pommel='round')

S['nature_sword'] = dict(name='Nature Sword',
    desc='A living blade of heartwood-green with a leaf-shaped swell and a pale vein down its middle, edged with amber sap; vines creep up from the root-woven grip over a wooden guard.',
    lines=6, shape='leaf', fuller=(0.05, 0.85),
    colors=C(edge='#f4e08a', light='#8fd65a', mid='#4a9a32', dark='#245a1e', fuller='#c8f08a', guard='#8a5a32', guard2='#4e3018',
             grip='#5a3a1e', grip2='#7a5230', pommel='#8a5a32', pommel2='#4e3018'),
    guard='down', guardLines=7, pommel='round',
    deco=[vine('#3aa832', '#7ae05a')])

S['shadow_sword'] = dict(name='Shadow Sword',
    desc='A long, narrow rapier of near-black enchanted steel with a seam of violet void-light along its cutting edge, set in a wide crescent guard that sweeps back like a wing. Dark corded grip and an amethyst pommel stone.',
    lines=4, shape='rapier', tipLen=0.2,
    colors=C(edge='#d68aff', light='#4a3a5c', mid='#2a2236', dark='#16121e', guard='#4a3a5c', guard2='#221a2c',
             grip='#1c1824', grip2='#30283c', pommel='#a05ad8', pommel2='#5a2a86', guardTip='#b05aff'),
    guard='crescent', guardLines=9, pommel='round',
    deco=[line_glow('#b05aff', 0.05, 0.9, v=-0.9)])

S['crystal_sword'] = dict(name='Crystal Sword',
    desc='An amethyst shard blade, faceted along its length in lilac and deep violet with bright glints, with crystal clusters growing from the guard and a raw amethyst pommel.',
    lines=6, shape='leaf', wave=0.45, waves=7, glint=True,
    colors=C(edge='#fbe8ff', light='#d6a0ff', mid='#9a5ad8', dark='#5a2a96', guard='#c88aff', guard2='#6a3aa8',
             grip='#2e2440', grip2='#4a3a66', pommel='#d6a0ff', pommel2='#6a3aa8', pgem='#ffffff'),
    guard='up', guardLines=8, gem=('#ffffff', '#fbe8ff'), pommel='gem',
    deco=[guard_spikes('#d6a0ff', 2), specks('#ffffff', [(0.25, -0.6), (0.5, 0.4), (0.7, -0.4)])])

S['void_sword'] = dict(name='Void Sword',
    desc='A blade like a slice of the night sky — black-violet, scattered with star specks, with an ender-purple edge — set with a staring ender-eye gem in a dark, wide guard; netherite grip and pommel.',
    lines=6, shape='straight', fuller=(0.05, 0.8),
    colors=C(edge='#e0a8ff', light='#5a2a86', mid='#2a1440', dark='#120a1e', fuller='#06040c', guard='#2e2a36', guard2='#14121a',
             grip='#2a2630', grip2='#423c4a', pommel='#4a4452', pommel2='#24202a'),
    guard='cross', guardLines=9, gem=('#3aff9a', '#c0ffd8'), pommel='round',
    deco=[specks('#ffffff', [(0.12, 0.0), (0.33, 0.0), (0.5, 0.0), (0.71, 0.0)]), specks('#d08aff', [(0.22, 0.0), (0.6, 0.0)])])

S['solar_sword'] = dict(name='Solar Sword',
    desc='A broad blade of white gold, bright as noon at the edge and amber at the spine, set in a radiant sun-disc guard with a fiery core; gilded grip and pommel.',
    lines=6, shape='broad_tip', fuller=(0.05, 0.7), glint=True,
    colors=C(edge='#ffffff', light='#fff0a8', mid='#f0c040', dark='#b07818', fuller='#ffe070', guard='#ffd84a', guard2='#c08a1a',
             grip='#7a4a1a', grip2='#a06a2a', pommel='#ffd84a', pommel2='#c08a1a', guardTip='#fff6c0'),
    guard='disc', guardLines=10, guardThick=3.0, gem=('#ff7a1a', '#ffe0a0'), pommel='round')

S['gravity_sword'] = dict(name='Gravity Sword',
    desc='A heavy cleaver-like blade that widens toward its end, of dense dark-grey alloy etched with violet gravity runes; massive block guard and a weighted pommel.',
    lines=6, shape='broad_tip', tipLen=0.08,
    colors=C(edge='#c8c4d0', light='#8a8696', mid='#55525e', dark='#2e2c36', guard='#5a5664', guard2='#2e2c36',
             grip='#24222a', grip2='#3a3842', pommel='#6a6674', pommel2='#3a3842'),
    guard='block', guardLines=8, guardThick=2.8, gem=('#a05aff', '#d8b0ff'), pommel='round',
    deco=[runes('#b07aff', every=3.6, start=0.1, end=0.85)])

S['poison_sword'] = dict(name='Poison Sword',
    desc='A serrated blade of sickly green steel, venom pooling in its fuller and dripping from the teeth; a bone-pale guard, a bound grip and a toxic gem pommel.',
    lines=5, shape='straight', serrate=3, fuller=(0.05, 0.75),
    colors=C(edge='#e8ffb0', light='#9ad84a', mid='#5a9a2a', dark='#2e5a1a', fuller='#c8ff4a', guard='#d8d0b0', guard2='#8a8268',
             grip='#2e3a22', grip2='#4a5a32', pommel='#9ad84a', pommel2='#3a6a1e', pgem='#e8ffb0'),
    guard='down', guardLines=7, pommel='gem',
    deco=[drips('#9aff3a', [0.3, 0.6])])

S['time_sword'] = dict(name='Time Sword',
    desc='A slim blade like a clock hand, bronze edged in gold with a blue hourglass glow down its spine, set in a ring guard shaped like a clock face; a gear-toothed pommel.',
    lines=5, shape='rapier', tipLen=0.22,
    colors=C(edge='#fff0c0', light='#e0b060', mid='#a8742e', dark='#5a3a18', guard='#e0b060', guard2='#8a5a22',
             grip='#2a2a3a', grip2='#46465e', pommel='#e0b060', pommel2='#8a5a22'),
    guard='disc', guardLines=9, guardThick=2.8, gem=('#4ac8ff', '#c8f0ff'), pommel='ring',
    deco=[line_glow('#6ad8ff', 0.05, 0.75)])

S['storm_sword'] = dict(name='Storm Sword',
    desc='A storm-grey blade like a rolling thundercloud, with a cyan lightning seam zig-zagging its length, set in a billowing cloud-shaped guard; copper-wrapped grip.',
    lines=6, shape='straight', wave=0.3, waves=6,
    colors=C(edge='#dfe8f0', light='#8a9aaa', mid='#55606e', dark='#2c333e', guard='#c8d0d8', guard2='#7a8490',
             grip='#5a3a22', grip2='#c87a4a', pommel='#c87a4a', pommel2='#7a4a22'),
    guard='crescent', guardLines=8, pommel='round',
    deco=[line_glow('#5ae8ff', 0.04, 0.88, zig=0.7, period=1.8)])

S['soul_sword'] = dict(name='Soul Sword',
    desc='A long blade of pale soul-steel burning cold blue along its edge, with soul flame curling from its back; a bone guard holding a soul-fire gem, wrapped grip and a bone pommel.',
    lines=5, shape='straight', fuller=(0.05, 0.75),
    colors=C(edge='#e0ffff', light='#7ae8f0', mid='#2c9ab0', dark='#16506a', fuller='#9ff8ff', guard='#e6dcc0', guard2='#8a8068',
             grip='#3a3040', grip2='#5a4a60', pommel='#e6dcc0', pommel2='#8a8068'),
    guard='down', guardLines=7, gem=('#40e8ff', '#c0fbff'), pommel='round',
    deco=[edge_flames('#40c8ff', '#b0f8ff', side=1, every=4.0, end=0.6)])

S['blood_sword'] = dict(name='Blood Sword',
    desc='A long crimson blade with a serrated spine, bright at the edge and near black along its back, dripping red; a down-swept blackened iron guard set with a ruby, dark red grip and an iron pommel.',
    lines=6, shape='straight', serrate=4, glint=True,
    colors=C(edge='#ffb0a8', light='#e0283a', mid='#9a1222', dark='#4a0810', guard='#6a6470', guard2='#33303a',
             grip='#4a1016', grip2='#7a1c24', pommel='#8a8494', pommel2='#4a4652'),
    guard='down', guardLines=8, gem=('#ff3048', '#ffb0b8'), pommel='spike',
    deco=[drips('#c8102a', [0.25, 0.5])])

S['echo_sword'] = dict(name='Echo Sword',
    desc='A broad blade of deep sculk-steel with a glowing cyan edge and a dark fuller pulsing with sculk veins, set in a heavy deepslate guard with an echo-shard core; netherite grip and pommel.',
    lines=7, shape='straight', fuller=(0.04, 0.85),
    colors=C(edge='#b8fff6', light='#1fc2c2', mid='#0b5a6a', dark='#06303c', fuller='#021820', guard='#3c4a52', guard2='#1c262c',
             grip='#2a3438', grip2='#46545a', pommel='#4a4046', pommel2='#2a2428'),
    guard='block', guardLines=8, guardThick=2.6, gem=('#5ffff0', '#d8fffb'), pommel='round',
    deco=[runes('#5ffff0', every=2.6, start=0.06, end=0.82)])

S['dragon_sword'] = dict(name='Dragon Sword',
    desc='A long black-violet blade with an ender-purple edge and a scale pattern along its spine, set in a gold guard swept back like dragon wings around a dragon-breath gem; a scaled grip and a pale horned pommel.',
    lines=6, shape='straight', glint=True,
    colors=C(edge='#f4c8ff', light='#b04ce0', mid='#5a1e86', dark='#2a0c44', guard='#ffcf4a', guard2='#a87a10',
             grip='#2a1036', grip2='#46205a', pommel='#e8e0f0', pommel2='#9a90a8', guardTip='#fff0a0'),
    guard='wing', guardLines=10, gem=('#ff5cf0', '#ffd0fa'), pommel='spike',
    deco=[runes('#ff8af4', every=2.2, start=0.06, end=0.8, v=0.6)])

if __name__ == '__main__':
    out = sys.argv[1]; sheet_path = sys.argv[2]
    names = list(S)
    cols = 5; cell = 32 * 4 + 12
    sheet = Image.new('RGBA', (cols * cell, ((len(names) + cols - 1) // cols) * (cell + 40)), (52, 56, 66, 255))
    for i, k in enumerate(names):
        sp = S[k]
        g = render(sp)
        art = to_art(sp['name'], sp['desc'], g, sp['colors']['outline'])
        json.dump(art, open(os.path.join(out, k + '.json'), 'w'), indent=2); open(os.path.join(out, k + '.json'), 'a').write('\n')
        im = to_image(g)
        x = (i % cols) * cell + 6; y = (i // cols) * (cell + 40) + 6
        sheet.alpha_composite(im.resize((128, 128), Image.NEAREST), (x, y))
        sheet.alpha_composite(im, (x, y + 132))
    sheet.save(sheet_path)
    print('ok', len(names))
