/**
 * Solar Sword — a weapon that keeps office hours.
 *
 * The collection's first sword whose power depends on something outside the
 * fight. Both its abilities read the sky: Solar Flare draws its damage from how
 * high the sun stands, and Solar Radiance pays its bonus against the undead in
 * proportion to the same light. At noon on the surface it is the hardest-hitting
 * sword here. In a cave at midnight, or anywhere in the Nether, it is a Rare
 * with a good tooltip.
 *
 * ## How it plays
 *
 *   fight in daylight, on the surface, against the things daylight is already
 *   against — and carry something else for the night shift
 *
 * That is a scheduling decision, and no other sword asks for one. Thirteen
 * others are exactly as good at midnight as at noon.
 *
 * ## Why it is not a fire sword
 *
 * This is the third warm-coloured sword and the one most at risk of being a
 * recolour of the first two, so the separation is mechanical before it is
 * visual:
 *
 * | | Solar | Inferno | Ember Blade |
 * |---|---|---|---|
 * | Fantasy | the sun itself | a weapon that ends things | an ember-forged duellist |
 * | Payload | `blindness` — light in the eyes | ignition | banked heat |
 * | Sets fire | **never** | yes, 3 s | yes, 1-2 s |
 * | Damage from | the time of day | a large flat number | hits already landed |
 * | Good against | undead, in daylight | anything, always | anything you stay on |
 * | Colour | white-gold and pale blue steel | dark iron and molten orange | cold steel with a heat band |
 *
 * It never ignites anything and never touches a block. A solar weapon that set
 * the grass alight would be Inferno with a different particle, and the whole
 * point of the theme is that light is not fire.
 *
 * ## Balance
 *
 * Legendary, 9 effective melee — level with Thunder and Void. It earns the tier
 * on its ceiling rather than its floor: Solar Flare peaks at 11 in a cone, the
 * highest single-activation figure in the collection, and bottoms out at 3.
 * A sword that is sometimes the best and sometimes the worst averages to a
 * Legendary and plays like neither.
 *
 * Gold is the honest material for it and gold is soft, so this carries the
 * lowest durability of any Legendary (1000, under Thunder's 1400 and Void's
 * 1600) and, matching vanilla's treatment of gold, **the highest enchantability
 * in the collection** at 24.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const solarSword = {
    id: 'custom_swords:solar_sword',
    name: 'Solar Sword',
    rarity: 'legendary',
    description: 'Sharpened at noon. It remembers, and it is much less at night.',

    item: {
        attackDamage: 8,
        // The most fragile Legendary. Gold is soft; the sword says so.
        durability: 1000,
        swingDuration: 0.3,
        // The highest in the collection, matching vanilla's gold: soft metals
        // take enchantment far more readily than hard ones.
        enchantValue: 24,
        repairItems: ['minecraft:gold_ingot'],
    },

    // Legendary, and gated behind a Wither: a nether star is the only vanilla
    // item that is literally a captured star, which is the right thing to hang
    // a solar blade on.
    recipe: {
        pattern: [' N ', 'GIG', ' R '],
        key: {
            N: 'minecraft:nether_star',
            G: 'minecraft:glowstone',
            I: 'minecraft:gold_ingot',
            R: 'minecraft:blaze_rod',
        },
        unlockedBy: 'minecraft:nether_star',
    },

    abilities: [
        {
            // SOLAR FLARE — a cone of light, as bright as the hour allows.
            activation: 'use',
            visual: 'solar',
            label: 'Solar Flare',
            abilityId: 'custom_swords:flare',
            cooldownTicks: 170,
            hudCategory: 'custom_swords_solar',
            // A cone, because light goes where it is pointed. Wider than
            // Inferno's 110° and shorter, so the two never play the same.
            targeting: { type: 'cone', range: 6, angleDegrees: 120, maxTargets: 8 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.5, vertical: 0.1, mode: 'forward' },
            // Dazzled, not burned. Applied only when there is a sun to be
            // dazzled by — the ability passes `applyBindingEffects: false` at
            // night.
            effects: [{ effect: 'blindness', durationTicks: 60 }],
            particles: [
                { id: 'minecraft:totem_particle', count: 16, spread: 1.1, at: 'caster' },
                { id: 'minecraft:evocation_fang_particle', count: 4, spread: 0.4, at: 'target' },
            ],
            sounds: { cast: 'solar_cast', impact: 'solar_impact' },
            params: {
                // 3 at midnight rising to 11 at noon. The widest swing between
                // a sword's best and worst case in the collection.
                nightDamage: 3,
                sunBonus: 8,
                cause: 'magic',
                dazzleThreshold: 0.35,
                arcPoints: 14,
            },
        },
        {
            // SOLAR RADIANCE — what the sun has always been against.
            activation: 'attack',
            visual: 'solar',
            label: 'Solar Radiance',
            abilityId: 'custom_swords:radiance',
            cooldownTicks: 10,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            // The sun saps what hides from it. Applied only on a smiting hit;
            // an ordinary swing at a pig gets nothing.
            //
            // `glowing` was the first choice and `core/effect_catalogue.js`
            // rejected it at build time: it is a Java-edition effect that does
            // not exist in Bedrock's registry, and `addEffect` would have failed
            // silently every swing.
            effects: [{ effect: 'weakness', durationTicks: 80 }],
            particles: [{ id: 'minecraft:totem_particle', count: 6, spread: 0.35, at: 'target' }],
            // `impact` is inherited from the profile and plays on every hit;
            // `cast` is the smite cue, which `radiance` plays at the target on a
            // smiting hit only.
            sounds: { cast: 'solar_smite' },
            params: {
                damage: 1,
                cause: 'magic',
                // Binding data, not code: a later sword could bind the same
                // ability against `arthropod` and be a spider-bane.
                smiteCategories: ['undead'],
                smiteDamage: 6,
                // A quarter of the bonus survives the night — an undead is
                // still an undead in the dark, just less exposed.
                nightFactor: 0.25,
                smiteParticleCount: 10,
            },
        },
    ],
};
