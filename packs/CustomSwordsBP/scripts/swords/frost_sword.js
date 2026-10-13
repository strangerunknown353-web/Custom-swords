/**
 * Frost Sword — control, and the only sword that rewards a sequence.
 *
 * Identity: it does not kill things, it stops them. The lowest ability damage
 * in the collection, and the reason to carry it anyway.
 *
 * ## The combo, which is the sword
 *
 * Frostbite (passive) leaves slowness on whatever it touches. Frost Nova
 * (active) deals bonus damage to anything that is *already* slowed. So the
 * sword plays as: chill the group with melee, then shatter them.
 *
 * That is a different question from the other burst swords. `burst` (Earth)
 * asks how far a target is from the centre. `ember_burst` asks how much heat
 * the wielder has banked. Frost Nova asks what the *target* is already
 * suffering — the only ability in the collection that reads the enemy's state
 * rather than the caster's or the geometry.
 *
 * Nova also inverts the usual falloff: proximity scales the *effect duration*,
 * not the damage. Something at the caster's feet is locked down for the full
 * duration; something at the rim is briefly inconvenienced. It is a control
 * ability, so its falloff is control.
 *
 * ## Balance
 *
 * Rare, 7 melee, 900 durability, 6s cooldown. It sits below the Epics on raw
 * numbers deliberately: slowness III plus mining fatigue across ten targets is
 * worth more in a fight than the four damage it deals, and the shatter bonus
 * only pays out for a player who set it up.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const frostSword = {
    id: 'custom_swords:frost_sword',
    name: 'Frost Sword',
    rarity: 'rare',
    description: 'Grown, not forged. The air around the blade never quite thaws.',

    item: {
        attackDamage: 6,
        durability: 900,
        // Slower than Ember Blade, quicker than the Epics: a measured weapon.
        swingDuration: 0.32,
        enchantValue: 16,
        repairItems: ['minecraft:packed_ice'],
    },

    // Rare: packed ice grown around a diamond core.
    recipe: {
        pattern: [' X ', ' D ', ' I '],
        key: { X: 'minecraft:packed_ice', D: 'minecraft:diamond', I: 'minecraft:stick' },
        unlockedBy: 'minecraft:packed_ice',
    },

    abilities: [
        {
            // FROST NOVA — a ring of cold. Effects are the payload; the shatter
            // bonus is the reward for having chilled the target first.
            activation: 'use',
            visual: 'frost',
            label: 'Frost Nova',
            abilityId: 'custom_swords:nova',
            cooldownTicks: 120,
            hudCategory: 'custom_swords_frost',
            targeting: { type: 'area', range: 6, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            // A light shove only — this sword holds things in place rather than
            // scattering them, which is Wind's job.
            knockback: { horizontal: 0.3, vertical: 0.15, mode: 'away' },
            effects: [
                { effect: 'slowness', durationTicks: 140, amplifier: 2 },
                { effect: 'mining_fatigue', durationTicks: 120, amplifier: 1 },
            ],
            particles: [
                { id: 'minecraft:snowflake_particle', count: 20, spread: 2, at: 'caster' },
                { id: 'minecraft:ice_evaporation_emitter', count: 3, spread: 0.4, at: 'target' },
            ],
            sounds: { cast: 'frost_cast', impact: 'frost_impact' },
            params: {
                damage: 4,
                cause: 'magic',
                edgeDurationFactor: 0.4,
                shatterEffect: 'slowness',
                shatterBonus: 5,
                ringPoints: 20,
            },
        },
        {
            activation: 'use',
            visual: 'frost',
            label: 'Ice Lance',
            abilityId: 'custom_swords:beam',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_frost',
            targeting: { type: 'ray', range: 14 },
            allowedTargets: ['mob', 'player'],
            effects: [{ effect: 'slowness', durationTicks: 60, amplifier: 1 }],
            params: {
                damage: 5,
                pierceFalloff: 0.8,
                maxPierce: 4,
                cause: 'freezing',
                igniteSeconds: 0,
                linePoints: 18,
            },
        },
        {
            activation: 'use',
            visual: 'frost',
            label: 'Frost Step',
            abilityId: 'custom_swords:blink',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_frost',
            targeting: { type: 'self' },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.4, vertical: 0.2, mode: 'away' },
            effects: [{ effect: 'slowness', durationTicks: 60 }],
            params: {
                distance: 6,
                minDistance: 2,
                maxDrop: 4,
                allowLiquid: false,
                arrivalDamage: 3,
                arrivalRadius: 2.5,
                arrivalMaxTargets: 4,
                cause: 'magic',
                trailPoints: 12,
                markKey: 'frost_step',
            },
        },
        {
            activation: 'use',
            visual: 'frost',
            label: 'Glacial Ward',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 400,
            hudCategory: 'custom_swords_frost',
            targeting: { type: 'self' },
            effects: [
                { effect: 'resistance', durationTicks: 120, amplifier: 0 },
                { effect: 'fire_resistance', durationTicks: 200 },
            ],
            params: { heal: 2, extinguish: false },
        },
        {
            // FROSTBITE — contact chills, and bites deeper into something
            // already chilled. This is what sets up the nova.
            activation: 'attack',
            visual: 'frost',
            label: 'Frostbite',
            abilityId: 'custom_swords:afflict',
            cooldownTicks: 50,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            effects: [{ effect: 'slowness', durationTicks: 60 }],
            particles: [{ id: 'minecraft:snowflake_particle', count: 5, spread: 0.3, at: 'target' }],
            params: {
                damage: 1,
                cause: 'magic',
                markerEffect: 'slowness',
                escalationDamage: 3,
                escalationEffects: [{ effect: 'mining_fatigue', durationTicks: 60 }],
            },
        },
    ],
};
