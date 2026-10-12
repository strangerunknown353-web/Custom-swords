/**
 * Crystal Sword — a lattice that answers a crowd, and hardens around a losing
 * wielder.
 *
 * The collection's first defensive sword. Every blade before it converts a
 * cooldown into damage in some form; this one converts *being outnumbered* into
 * damage and *being hurt* into survival, which are the two situations the other
 * nine handle worst.
 *
 * ## How it plays
 *
 *   let them surround you → Crystal Burst, which hits harder for every body in
 *   the ring → keep swinging as your health falls → Crystal Guard closes and
 *   buys the seconds to finish
 *
 * The two halves are deliberately aimed at the same moment. A player using this
 * well is fighting a group at low health on purpose, which is exactly the
 * situation Inferno, Earth and Thunder all want to avoid.
 *
 * ## Why it is not Frost
 *
 * Frost is the other crystalline blade and the comparison is the one that
 * matters, so they share nothing but the word:
 *
 * | | Crystal Sword | Frost Sword |
 * |---|---|---|
 * | Fantasy | a struck resonant lattice | grown glacier ice |
 * | Rarity | Epic | Rare |
 * | Active | `resonate` — damage rises with the crowd | `nova` — control falls off with distance |
 * | Passive | `ward` — reads the **wielder's** health | `afflict` — reads the **target's** effects |
 * | Colour | violet and rose-gold | pale blue and white |
 * | Silhouette | faceted double-edged shard, prism guard | grown blade widening to the tip |
 *
 * Different question asked by the active, opposite subject read by the passive,
 * different hue family, different shape. That is the bar the texture standard
 * sets for a themed pair, applied to mechanics as well as pixels.
 *
 * ## Balance
 *
 * Epic, 8 effective melee, and the **lowest durability of any Epic** at 850 —
 * below Frost, a Rare. That is not an oversight: amethyst is brittle, the sword
 * says so, and it is the price for a kit that is strong precisely when a fight
 * has gone wrong. It mends with amethyst shards, which a budding-amethyst farm
 * produces indefinitely, so the cost is attention rather than scarcity.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const crystalSword = {
    id: 'custom_swords:crystal_sword',
    name: 'Crystal Sword',
    rarity: 'epic',
    description: 'Struck once, it rings until everything around it answers.',

    item: {
        // 8 effective melee: level with Tidal and Shadow, under Inferno's 9 and
        // Earth's 10. The kit, not the stat line, is what makes it an Epic.
        attackDamage: 7,
        // The lowest of any Epic, and lower than two Rares. See the balance note
        // above — the sword is fragile on purpose.
        durability: 850,
        swingDuration: 0.34,
        enchantValue: 16,
        repairItems: ['minecraft:amethyst_shard'],
    },

    // Epic: three shards faceted into a head, a diamond core, a quartz hilt.
    // The only recipe in the collection with a full top row, so the shape reads
    // as a cluster grown onto a shaft rather than a forged point.
    recipe: {
        pattern: ['AAA', ' D ', ' Q '],
        key: {
            A: 'minecraft:amethyst_shard',
            D: 'minecraft:diamond',
            Q: 'minecraft:quartz',
        },
        unlockedBy: 'minecraft:amethyst_shard',
    },

    abilities: [
        {
            // CRYSTAL BURST — the lattice rings, and a crowd makes it louder.
            activation: 'use',
            visual: 'crystal',
            label: 'Crystal Burst',
            abilityId: 'custom_swords:resonate',
            cooldownTicks: 160,
            hudCategory: 'custom_swords_crystal',
            // Short reach on purpose: the ability wants the player standing in
            // the middle of the group, not shelling it from outside.
            targeting: { type: 'area', range: 4.5, maxTargets: 8 },
            allowedTargets: ['mob', 'player'],
            // A shove rather than a scatter — throwing the crowd apart would
            // undo the resonance the next activation depends on.
            knockback: { horizontal: 0.6, vertical: 0.15, mode: 'away' },
            effects: [{ effect: 'slowness', durationTicks: 60 }],
            particles: [
                { id: 'minecraft:lab_table_misc_mystical_particle', count: 16, spread: 1.1, at: 'caster' },
                { id: 'minecraft:magnesium_salts_emitter', count: 2, spread: 0.3, at: 'target' },
            ],
            sounds: { cast: 'crystal_cast', impact: 'crystal_impact' },
            params: {
                damage: 5,
                resonanceBonus: 1.2,
                // Reached at five targets: 5 + 4.2 = 9.2 each. Past that the
                // ring gets wider, not stronger.
                maxResonance: 4.2,
                cause: 'magic',
                ringPoints: 20,
            },
        },
        {
            activation: 'use',
            visual: 'crystal',
            label: 'Prism Beam',
            abilityId: 'custom_swords:beam',
            cooldownTicks: 160,
            hudCategory: 'custom_swords_crystal',
            targeting: { type: 'ray', range: 16 },
            allowedTargets: ['mob', 'player'],
            params: {
                damage: 7,
                pierceFalloff: 0.85,
                maxPierce: 6,
                cause: 'magic',
                igniteSeconds: 0,
                linePoints: 18,
            },
        },
        {
            activation: 'use',
            visual: 'crystal',
            label: 'Shard Storm',
            abilityId: 'custom_swords:burst',
            cooldownTicks: 160,
            hudCategory: 'custom_swords_crystal',
            targeting: { type: 'area', range: 5, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.6, vertical: 0.25, mode: 'away' },
            effects: [{ effect: 'slowness', durationTicks: 40 }],
            params: { damage: 7, edgeDamageFactor: 0.5, igniteSeconds: 0, cause: 'magic', ringPoints: 20 },
        },
        {
            activation: 'use',
            visual: 'crystal',
            label: 'Refraction Step',
            abilityId: 'custom_swords:blink',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_crystal',
            targeting: { type: 'self' },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.4, vertical: 0.2, mode: 'away' },
            params: {
                distance: 7,
                minDistance: 2,
                maxDrop: 4,
                allowLiquid: false,
                arrivalDamage: 4,
                arrivalRadius: 2.5,
                arrivalMaxTargets: 4,
                cause: 'magic',
                trailPoints: 12,
                markKey: 'refraction_step',
            },
        },
        {
            activation: 'use',
            visual: 'crystal',
            label: 'Crystal Shell',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 500,
            hudCategory: 'custom_swords_crystal',
            targeting: { type: 'self' },
            effects: [
                { effect: 'absorption', durationTicks: 200, amplifier: 1 },
                { effect: 'resistance', durationTicks: 100 },
            ],
            params: { heal: 0, extinguish: false },
        },
        {
            // CRYSTAL GUARD — nothing at all until the wielder is losing.
            activation: 'attack',
            visual: 'crystal',
            label: 'Crystal Guard',
            abilityId: 'custom_swords:ward',
            // The anti-spam floor only. The guard's own rhythm is
            // `guardIntervalTicks`, so a swing thrown at full health cannot
            // lock the guard out of the moment it is needed.
            cooldownTicks: 10,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            // Applied to the WIELDER, not the target — `ward` passes
            // `applyBindingEffects: false` and places them itself.
            effects: [{ effect: 'resistance', durationTicks: 100 }],
            particles: [{ id: 'minecraft:lab_table_misc_mystical_particle', count: 12, spread: 0.7, at: 'caster' }],
            sounds: { cast: 'crystal_ward' },
            params: {
                damage: 1,
                cause: 'entityAttack',
                // Below 60% health the guard may form; below 30% it forms one
                // tier stronger, to a hard ceiling of Resistance II.
                guardThreshold: 0.6,
                deepThreshold: 0.3,
                maxAmplifier: 1,
                guardIntervalTicks: 140,
                markKey: 'crystal_guard',
            },
        },
    ],
};
