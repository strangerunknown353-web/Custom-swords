/**
 * Shadow Sword — position, not power.
 *
 * The collection's first sword whose active does no meaningful damage on its
 * own. Shadow Step moves the wielder up to six blocks through the dark; Shadow
 * Edge makes the next few seconds of swings hurt. Neither half is worth much
 * alone, and that is the design: the damage is paid for with movement.
 *
 * ## How it plays
 *
 *   step behind something → hit it inside the four-second window → heal a
 *   little of what you dealt → step out again when the cooldown allows
 *
 * A player who ignores the step and just swings has a 4-damage Epic. A player
 * who uses it has, briefly, the hardest single hit in the collection.
 *
 * ## Balance
 *
 * Epic, 8 melee, 1000 durability, 0.28s swing — quick, but under Inferno's 9
 * and well under Earth's 10. Its Epic rating is bought with utility rather than
 * numbers: a 7-second escape is worth more than two points of damage, and it is
 * the only sword in the set that can leave a fight it is losing.
 *
 * The 6-block step is deliberately short. A longer teleport is not a stronger
 * version of a short one — it is terrain traversal, which is a different and
 * much harder thing to keep safe. `config.movement.maxDashDistance` caps every
 * mobility ability at 10 regardless of what a definition asks for.
 *
 * ## What it is not
 *
 * It is not a stealth sword. Bedrock has no reliable invisibility-with-held-item
 * behaviour worth building an identity on, and faking it with the `invisibility`
 * effect leaves armour and the held sword rendered — a promise the game does
 * not keep. Mobility is the honest version of the same fantasy.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const shadowSword = {
    id: 'custom_swords:shadow_sword',
    name: 'Shadow Sword',
    rarity: 'epic',
    description: 'Its edge is only ever where you last looked away from.',

    item: {
        attackDamage: 7,
        durability: 1000,
        // Quick, but not Ember Blade quick — this is an elegant weapon, not a
        // frantic one.
        swingDuration: 0.28,
        enchantValue: 17,
        repairItems: ['minecraft:echo_shard'],
    },

    abilities: [
        {
            // SHADOW STEP — the sword. Everything else supports it.
            activation: 'use',
            visual: 'shadow',
            label: 'Shadow Step',
            abilityId: 'custom_swords:blink',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_shadow',
            // The dash needs no targeting spec of its own; `self` keeps the
            // envelope honest about who the ability acts on.
            targeting: { type: 'self' },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.4, vertical: 0.2, mode: 'away' },
            particles: [{ id: 'minecraft:mob_portal', count: 12, spread: 0.8, at: 'caster' }],
            sounds: { cast: 'shadow_cast', impact: 'shadow_impact' },
            params: {
                distance: 6,
                minDistance: 2,
                maxDrop: 4,
                allowLiquid: false,
                arrivalDamage: 4,
                arrivalRadius: 2.5,
                arrivalMaxTargets: 3,
                cause: 'magic',
                trailPoints: 10,
                markKey: 'shadow_step',
            },
        },
        {
            // SHADOW EDGE — ordinary on its own, dangerous just after a step.
            activation: 'attack',
            visual: 'shadow',
            label: 'Shadow Edge',
            abilityId: 'custom_swords:opportunist',
            cooldownTicks: 10,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            // Applied only on an empowered hit; the ability passes
            // `applyBindingEffects: false` otherwise.
            effects: [{ effect: 'weakness', durationTicks: 80 }],
            particles: [{ id: 'minecraft:obsidian_glow_dust_particle', count: 5, spread: 0.3, at: 'target' }],
            params: {
                damage: 1,
                empoweredDamage: 6,
                // Four seconds: long enough to cross the gap a step opened,
                // short enough that it cannot be banked.
                windowTicks: 80,
                markKey: 'shadow_step',
                lifesteal: 2,
                cause: 'magic',
                empoweredParticleCount: 10,
            },
        },
    ],
};
