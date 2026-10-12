/**
 * Gravity Sword — the collection's answer to everything that is not standing
 * on the floor with you.
 *
 * Gravity Crush opens a well at the wielder's feet: everything nearby is
 * dragged inward and pressed down, and the damage each target takes scales with
 * **how far above the caster it was**. Heavy Force then makes every ordinary
 * swing press its target into the ground rather than knock it away, hitting
 * hardest against the things with the most mass to move.
 *
 * ## How it plays
 *
 *   fight upward — phantoms, blazes, skeletons on ledges, anything a knockback
 *   has just put in the air — and use ordinary swings to keep a crowd gathered
 *   for the next crush rather than scattering it
 *
 * Vertical combat is the gap this fills. Thirteen other swords measure distance
 * in a straight line and treat "six blocks up" exactly like "six blocks
 * sideways"; several of them are actively bad at flying enemies. This one is
 * built for them.
 *
 * ## Why it is not Void Sword
 *
 * Both move enemies rather than the wielder, so the separation has to be sharp:
 *
 * | | Gravity | Void |
 * |---|---|---|
 * | Fantasy | force and mass — *this place*, pressing | dimensional energy — somewhere else, arriving |
 * | Where it acts | at the wielder's feet | at a point up to ten blocks away |
 * | Damage scales with | the target's **height** above the caster | the **reach** the rift was thrown |
 * | Passive reads | the target's **maximum** health (mass) | the target's **current** health (emptiness) |
 * | Passive knockback | straight down, pinning | none |
 * | Colour | achromatic — gunmetal, dust, a cold white core | deep indigo with cyan rift-light |
 *
 * One is about how far away you can reach; the other is about how hard you can
 * press. Neither teleports anything.
 *
 * ## Balance
 *
 * Epic, 10 effective melee — tying Earth for the heaviest melee in the
 * collection, and the two are deliberately the slow end of the roster: this
 * swings at 0.50 s against Earth's 0.55, and both trade speed for weight.
 * Enchantability is the lowest shipped (10, level with Earth): dense metal
 * takes an enchantment badly.
 *
 * The crush's ceiling (12 against something five blocks up) is high, and it is
 * bought with a condition that most fights never offer — a ground fight gets
 * the floor of 5.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const gravitySword = {
    id: 'custom_swords:gravity_sword',
    name: 'Gravity Sword',
    rarity: 'epic',
    description: 'Everything it touches remembers which way is down.',

    item: {
        // 10 effective melee, tying Earth. Both are heavy swords and both pay
        // for it in swing time.
        attackDamage: 9,
        durability: 1500,
        swingDuration: 0.5,
        // Level with Earth, and lowest in the collection. Dense metal resists.
        enchantValue: 10,
        repairItems: ['minecraft:ancient_debris'],
    },

    // Epic: a shulker shell — the game's one anti-gravity object — set in
    // ancient debris and obsidian on a solid iron core.
    recipe: {
        pattern: [' A ', 'OSO', ' I '],
        key: {
            A: 'minecraft:ancient_debris',
            O: 'minecraft:obsidian',
            S: 'minecraft:shulker_shell',
            I: 'minecraft:iron_block',
        },
        unlockedBy: 'minecraft:ancient_debris',
    },

    abilities: [
        {
            // GRAVITY CRUSH — pull in, press down, and bill by altitude.
            activation: 'use',
            visual: 'gravity',
            label: 'Gravity Crush',
            abilityId: 'custom_swords:crush',
            cooldownTicks: 200,
            hudCategory: 'custom_swords_gravity',
            // Six blocks, and `fullHeight` below is five — deliberately inside
            // the reach. An earlier draft paired a five-block well with a
            // six-block full-height bonus, which meant the ceiling was
            // unreachable: anything high enough to earn it was already outside
            // the query. A ceiling a sword cannot reach is a lie in the
            // tooltip, and a unit test caught it.
            targeting: { type: 'area', range: 6, maxTargets: 8 },
            allowedTargets: ['mob', 'player'],
            // Inward and DOWNWARD. The negative vertical is the whole point:
            // `config.combat.maxKnockbackVertical` clamps in both directions,
            // which is what makes a slam expressible at all.
            knockback: { horizontal: 1.4, vertical: -0.6, pull: true },
            effects: [{ effect: 'slowness', durationTicks: 60 }],
            particles: [
                { id: 'minecraft:rising_border_dust_particle', count: 16, spread: 1.2, at: 'caster' },
                { id: 'minecraft:dragon_destroy_block', count: 2, spread: 0.3, at: 'target' },
            ],
            sounds: { cast: 'gravity_cast', impact: 'gravity_impact' },
            params: {
                // 5 on the floor rising to 12 at five blocks up — and five is
                // comfortably inside the six-block reach above.
                groundDamage: 5,
                heightBonus: 7,
                fullHeight: 5,
                cause: 'entityAttack',
                ringPoints: 20,
            },
        },
        {
            activation: 'use',
            visual: 'gravity',
            label: 'Singularity',
            abilityId: 'custom_swords:repulse',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_gravity',
            targeting: { type: 'area', range: 9, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.8, vertical: 0.1, pull: true },
            effects: [{ effect: 'slowness', durationTicks: 60, amplifier: 1 }],
            params: { damage: 3, trailPoints: 5 },
        },
        {
            activation: 'use',
            visual: 'gravity',
            label: 'Repulsor Field',
            abilityId: 'custom_swords:repulse',
            cooldownTicks: 160,
            hudCategory: 'custom_swords_gravity',
            targeting: { type: 'area', range: 6, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 2.6, vertical: 0.5, mode: 'away' },
            params: { damage: 4, trailPoints: 5 },
        },
        {
            activation: 'use',
            visual: 'gravity',
            label: 'Levitation Field',
            abilityId: 'custom_swords:nova',
            cooldownTicks: 200,
            hudCategory: 'custom_swords_gravity',
            targeting: { type: 'area', range: 6, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.3, vertical: 0.1, mode: 'away' },
            effects: [
                { effect: 'levitation', durationTicks: 40 },
                { effect: 'slow_falling', durationTicks: 100 },
            ],
            params: {
                damage: 3,
                cause: 'magic',
                edgeDurationFactor: 0.4,
                shatterEffect: 'levitation',
                shatterBonus: 5,
                ringPoints: 20,
            },
        },
        {
            activation: 'use',
            visual: 'gravity',
            label: 'Gravity Leap',
            abilityId: 'custom_swords:leap',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_gravity',
            targeting: { type: 'self' },
            effects: [{ effect: 'slow_falling', durationTicks: 120 }],
            params: { horizontal: 1.4, vertical: 1.3, pitchLift: 0.3, burstCount: 12 },
        },
        {
            // HEAVY FORCE — pins rather than pushes, and bills by mass.
            activation: 'attack',
            visual: 'gravity',
            label: 'Heavy Force',
            abilityId: 'custom_swords:weigh',
            cooldownTicks: 10,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            // Straight down, no horizontal component: the target stays where it
            // is, which is what keeps a crowd gathered for the next crush.
            knockback: { horizontal: 0, vertical: -0.35, mode: 'away' },
            particles: [{ id: 'minecraft:mycelium_dust_particle', count: 5, spread: 0.3, at: 'target' }],
            sounds: { impact: 'gravity_impact' },
            params: {
                damage: 1,
                cause: 'entityAttack',
                // Caps at 60 maximum health, so an iron golem, a ravager, a
                // warden and the dragon are all worth the same 3.
                bonusPerMaxHealth: 0.05,
                maxBonus: 3,
            },
        },
    ],
};
