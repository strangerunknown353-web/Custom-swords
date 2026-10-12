/**
 * Storm Sword — the whole sky, and only as strong as the wielder is fast.
 *
 * Storm Surge throws a cone of weather forward: wind that hurls what it catches,
 * rain that slows it, and a discharge drawn across the front. Its damage and its
 * knockback both scale with how fast the wielder was moving when they threw it.
 * Storm Momentum then grants Speed on every landed hit, so the sword supplies
 * the exact currency its own active spends.
 *
 * ## How it plays
 *
 *   never stand still — sprint into the group, hit something to gather speed,
 *   surge mid-run or falling into them, and keep moving
 *
 * That is the exact opposite of the collection's other new sword. Time Sword is
 * worth more the longer you have stood holding it; this is worth nothing at all
 * standing still. They are the last two swords deliberately: the same question
 * about time and motion, answered from both ends.
 *
 * ## Why it is neither Thunder nor Wind
 *
 * Both already exist, both are close, and a third sword in the same weather
 * needs to be separated on what it does rather than on what it looks like:
 *
 * | | Storm | Thunder | Wind |
 * |---|---|---|---|
 * | Rarity | Epic | Legendary | Rare |
 * | Active shape | a cone the wielder runs into | entity to entity along a line | a radial scatter |
 * | Damage scales with | the **wielder's motion** | falloff per jump | nothing — it is a push |
 * | Payload | knockback **and** slow, together | one hard strike | knockback alone |
 * | Passive | Speed to the wielder on contact | discharges every third hit | Speed on a cooldown |
 * | The decision | when am I fastest? | where is the line of enemies? | am I surrounded? |
 * | Profile | `tempest` — cloud, rain, a pale discharge | `storm` — white arc-sparks | `gale` — shockwave and motes |
 *
 * Thunder is a bolt: one point to another, precise. This is the weather itself.
 *
 * ## What it deliberately does not do
 *
 * No `minecraft:lightning_bolt` is ever spawned. `chain` documented the reason
 * and it holds: a real bolt starts fires, charges creepers, turns pigs into
 * zombified piglins and villagers into witches, hurts the caster, and does all
 * of it outside the combat layer's validation, hit protection and PvP rules. The
 * lightning here is a particle line. Nothing changes the weather, nothing is
 * spawned, no block is touched.
 *
 * ## Balance, and why it is Epic rather than Legendary
 *
 * It was drafted as a Legendary and the crafting-progression audit in
 * `tools/validate.mjs` disagreed: every ingredient here is tier 2 — a trial
 * chamber and a copper mine — while the other Legendaries are gated behind the
 * End, an ancient city or a boss. The choice was to invent a rarer ingredient
 * the sword did not want, or to accept the tier the materials actually describe.
 *
 * Epic is also the better design. It leaves Thunder as the collection's one
 * Legendary bolt and makes Storm the Epic weather sword beside it, which is a
 * sharper distinction than two Legendaries in the same sky, and it keeps the
 * roster from going top-heavy at sixteen swords.
 *
 * 9 effective melee is the top of the Epic band, level with Inferno. The surge
 * runs 4 from a standstill to 11 at full momentum, so its ceiling matches
 * Solar's noon flare while its floor is lower than most Rares' actives. Its
 * condition is achievable at will, unlike Solar's clock, which is why the swing
 * is narrower and the cooldown shorter.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const stormSword = {
    id: 'custom_swords:storm_sword',
    name: 'Storm Sword',
    rarity: 'epic',
    description: 'It brings the weather with it, and only as fast as you do.',

    item: {
        attackDamage: 8,
        durability: 1250,
        // Quick. A sword about motion should not feel heavy.
        swingDuration: 0.29,
        enchantValue: 20,
        repairItems: ['minecraft:copper_ingot'],
    },

    // Epic: the two halves of a storm, joined. Phantom membrane and a breeze
    // rod are Wind Sword's materials; a lightning rod over copper is Thunder's.
    // This is the only recipe in the collection that draws from two other
    // swords' material sets, which is exactly what the sword is — and it is why
    // the cost curve puts it at Epic rather than beside them.
    recipe: {
        pattern: ['PBP', ' L ', ' C '],
        key: {
            P: 'minecraft:phantom_membrane',
            B: 'minecraft:breeze_rod',
            L: 'minecraft:lightning_rod',
            C: 'minecraft:copper_block',
        },
        unlockedBy: 'minecraft:breeze_rod',
    },

    abilities: [
        {
            // STORM SURGE — the front, carrying whatever speed the wielder had.
            activation: 'use',
            visual: 'tempest',
            label: 'Storm Surge',
            abilityId: 'custom_swords:surge',
            cooldownTicks: 150,
            hudCategory: 'custom_swords_storm',
            // A wide, short cone: the weather arriving, not a beam. Wider than
            // Inferno's 110° and shorter than Tidal's 7-block reach.
            targeting: { type: 'cone', range: 6, angleDegrees: 130, maxTargets: 8 },
            allowedTargets: ['mob', 'player'],
            // Along the view, not radially: a front travels the way it is
            // pointed. Scaled by momentum inside the ability.
            knockback: { horizontal: 2.4, vertical: 0.35, mode: 'forward' },
            // Rain, not just wind. Both payloads land together, which is what
            // separates this from Wind Sword's pure push.
            effects: [{ effect: 'slowness', durationTicks: 70 }],
            particles: [
                { id: 'minecraft:campfire_tall_smoke_particle', count: 14, spread: 1.2, at: 'caster' },
                { id: 'minecraft:water_drip_particle', count: 5, spread: 0.5, at: 'target' },
            ],
            sounds: { cast: 'tempest_cast', impact: 'tempest_impact' },
            params: {
                // 4 standing still, 11 at a full sprint through the air.
                stillDamage: 4,
                momentumBonus: 7,
                cause: 'entityAttack',
                // Even at a standstill the wind still throws — just not far.
                stillKnockbackFactor: 0.4,
                arcPoints: 12,
            },
        },
        {
            activation: 'use',
            visual: 'tempest',
            label: 'Thunderhead',
            abilityId: 'custom_swords:chain',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_storm',
            targeting: { type: 'ray', range: 16, maxTargets: 1 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.8, vertical: 0.4 },
            params: {
                damage: 8,
                cause: 'lightning',
                maxJumps: 3,
                jumpRange: 5,
                jumpFalloff: 0.6,
                arcPoints: 10,
            },
        },
        {
            activation: 'use',
            visual: 'tempest',
            label: 'Lightning Lance',
            abilityId: 'custom_swords:beam',
            cooldownTicks: 160,
            hudCategory: 'custom_swords_storm',
            targeting: { type: 'ray', range: 14 },
            allowedTargets: ['mob', 'player'],
            params: {
                damage: 7,
                pierceFalloff: 0.8,
                maxPierce: 4,
                cause: 'lightning',
                igniteSeconds: 0,
                linePoints: 18,
            },
        },
        {
            activation: 'use',
            visual: 'tempest',
            label: 'Squall',
            abilityId: 'custom_swords:repulse',
            cooldownTicks: 160,
            hudCategory: 'custom_swords_storm',
            targeting: { type: 'cone', range: 7, angleDegrees: 100, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 2.4, vertical: 0.4, mode: 'forward' },
            effects: [{ effect: 'slowness', durationTicks: 60 }],
            params: { damage: 3, trailPoints: 5 },
        },
        {
            activation: 'use',
            visual: 'tempest',
            label: 'Storm Dash',
            abilityId: 'custom_swords:leap',
            cooldownTicks: 120,
            hudCategory: 'custom_swords_storm',
            targeting: { type: 'self' },
            effects: [{ effect: 'speed', durationTicks: 100, amplifier: 1 }],
            params: { horizontal: 2.6, vertical: 0.4, pitchLift: 0.5, burstCount: 12 },
        },
        {
            // STORM MOMENTUM — supplies what the surge spends.
            activation: 'attack',
            visual: 'tempest',
            label: 'Storm Momentum',
            abilityId: 'custom_swords:momentum',
            cooldownTicks: 10,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            // Applied to the WIELDER — `momentum` passes
            // `applyBindingEffects: false` and places them itself, so the enemy
            // is never handed Speed for being hit.
            effects: [{ effect: 'speed', durationTicks: 80 }],
            knockback: { horizontal: 0.8, vertical: 0.15, mode: 'away' },
            particles: [{ id: 'minecraft:campfire_tall_smoke_particle', count: 5, spread: 0.3, at: 'target' }],
            sounds: { impact: 'tempest_gust' },
            params: {
                damage: 1,
                cause: 'entityAttack',
                // Half the push standing still, up to 1.6× of it at a full run.
                stillKnockbackFactor: 0.5,
                momentumKnockbackBonus: 0.6,
            },
        },
    ],
};
