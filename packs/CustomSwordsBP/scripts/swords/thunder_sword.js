/**
 * Thunder Sword — precision and reach. The collection's Legendary.
 *
 * Identity: it picks one target and the storm follows the line. Thunder Strike
 * hits the entity the wielder is looking at, then arcs to whatever stands
 * nearest, up to three further links at 60% damage each. It rewards finding a
 * line of enemies rather than a cluster's centre, which is what separates it
 * from every radial ability in the set.
 *
 * ## No vanilla lightning
 *
 * The obvious implementation is `spawnEntity('minecraft:lightning_bolt')`, and
 * it is the wrong one. A real bolt starts fires, turns creepers charged, pigs
 * into zombified piglins and villagers into witches, hurts anything nearby
 * including the wielder, and does all of it outside the combat layer's
 * validation, hit protection and PvP toggle.
 *
 * So the bolt is particles and sound, and every point of damage goes through
 * `combat.strikeOne` like any other ability. The sword looks like lightning and
 * behaves like the framework. See `abilities/builtin/chain.js` and
 * `docs/API_NOTES.md`.
 *
 * ## Balance
 *
 * Legendary, 9 melee, 1400 durability, 10s cooldown. Its ceiling is the highest
 * in the collection — 12 + 7.2 + 4.3 + 2.6 across four links — and it is also
 * the easiest to waste: one target in the open pays 12 for a ten-second wait,
 * where Earth's burst pays 11 to everything around it every nine.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const thunderSword = {
    id: 'custom_swords:thunder_sword',
    name: 'Thunder Sword',
    rarity: 'legendary',
    description: 'Storm-iron, quenched in a lightning strike. It still remembers the sky.',

    item: {
        attackDamage: 8,
        durability: 1400,
        swingDuration: 0.38,
        enchantValue: 18,
        repairItems: ['minecraft:copper_ingot'],
        glint: true,
    },

    abilities: [
        {
            // THUNDER STRIKE — one chosen target, then the arc.
            activation: 'use',
            visual: 'storm',
            label: 'Thunder Strike',
            abilityId: 'custom_swords:chain',
            cooldownTicks: 200,
            hudCategory: 'custom_swords_thunder',
            // `ray` rather than `point`: the player names a victim, and the
            // chain decides the rest. Nothing is struck at random.
            targeting: { type: 'ray', range: 16, maxTargets: 1 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.9, vertical: 0.5 },
            effects: [{ effect: 'weakness', durationTicks: 100 }],
            particles: [{ id: 'minecraft:endrod', count: 18, spread: 0.8, at: 'caster' }],
            sounds: { cast: 'thunder_cast', impact: 'thunder_impact' },
            params: {
                damage: 12,
                cause: 'lightning',
                maxJumps: 3,
                jumpRange: 5,
                jumpFalloff: 0.6,
                arcPoints: 10,
            },
        },
        {
            // STATIC CHARGE — builds on every third blow, then lets go.
            activation: 'attack',
            visual: 'storm',
            label: 'Static Charge',
            abilityId: 'custom_swords:discharge',
            cooldownTicks: 10,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            effects: [{ effect: 'weakness', durationTicks: 60 }],
            particles: [{ id: 'minecraft:endrod', count: 4, spread: 0.3, at: 'target' }],
            params: {
                // 1 chip point per swing: enough for the ability to know the
                // blow landed, and it reads as a small shock on contact.
                damage: 1,
                cause: 'lightning',
                interval: 3,
                dischargeDamage: 6,
                chargeKey: 'static_charge',
                dischargeParticleCount: 14,
            },
        },
    ],
};
