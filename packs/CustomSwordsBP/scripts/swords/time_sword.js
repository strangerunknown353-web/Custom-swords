/**
 * Time Sword — the collection's only Mythic, and the one sword that is worth
 * more for not being used.
 *
 * Time Freeze holds everything nearby still, and how long it holds depends
 * entirely on how long the sword has been carried without firing it. Spent the
 * instant its cooldown lifts, it buys two seconds. Saved for a minute — or
 * wound up by fighting, which is what Temporal Edge is for — it buys eight.
 *
 * ## How it plays
 *
 *   carry it unfired, or wind it on ordinary mobs, and hold the full charge for
 *   the moment that actually needs eight seconds of nobody moving
 *
 * Every other active in the collection is worth the same whenever you press it,
 * so the only question they ask is whether the cooldown is up. This one asks a
 * second question, and it is the only sword here where *not* pressing the button
 * is a real play.
 *
 * ## Why it is not a teleport sword
 *
 * Shadow Sword owns mobility and this deliberately does not touch it: Time Sword
 * never moves the wielder, never moves a target, and has no dash, blink or
 * reposition of any kind. Time here is a **resource**, not a way of getting
 * somewhere.
 *
 * ## What it deliberately does not do
 *
 * | Tempting | Why not |
 * |---|---|
 * | `world.setTimeOfDay` | one player's sword would change everyone's sky, permanently, on a shared world |
 * | Stop an entity's AI outright | no supported Bedrock API does it; Slowness VI is the honest rendering |
 * | A timer per frozen entity, restored on expiry | the effect expires itself — a per-entity timer is the easiest memory leak in this addon and buys nothing |
 * | Rewinding health or position | needs a per-player history buffer polled every tick, which is the one thing the architecture forbids |
 *
 * ## Balance
 *
 * Mythic — the first, and with Storm Sword the last two swords the collection
 * takes. It is emphatically **not** the highest-damage sword: 9 effective melee,
 * level with Thunder, Void, Solar and Storm, and its active deals 3. The tier is
 * for the ceiling of what a full-charge freeze does to a fight, not for a number
 * on the tooltip.
 *
 * Eight seconds is a long time to be unable to move, so the price is that a
 * player who fires it on cooldown never sees it: at 12 seconds between casts the
 * charge is a fifth of a meter, and the freeze is barely longer than Frost's.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const timeSword = {
    id: 'custom_swords:time_sword',
    name: 'Time Sword',
    rarity: 'mythic',
    description: 'It keeps what you do not spend, and spends what you have kept.',

    item: {
        // 9 effective melee. A Mythic that is not the hardest hitter, because
        // the tier is bought with the freeze rather than with the stat line.
        attackDamage: 8,
        // The highest in the collection. Nothing wears out a sword that is
        // partly outside the moment.
        durability: 1800,
        swingDuration: 0.32,
        enchantValue: 20,
        repairItems: ['minecraft:echo_shard'],
    },

    // Mythic, and priced as the most expensive recipe in the collection: a
    // totem that already cheats death once, two echo shards out of an ancient
    // city, a working clock and a block of gold for the movement.
    recipe: {
        pattern: [' C ', 'ETE', ' G '],
        key: {
            C: 'minecraft:clock',
            E: 'minecraft:echo_shard',
            T: 'minecraft:totem_of_undying',
            G: 'minecraft:gold_block',
        },
        unlockedBy: 'minecraft:totem_of_undying',
    },

    abilities: [
        {
            // TIME FREEZE — as long as it has been saved up for.
            activation: 'use',
            visual: 'chrono',
            label: 'Time Freeze',
            abilityId: 'custom_swords:stasis',
            // Twelve seconds. The floor between casts; the charge accumulates
            // for as long past it as the wielder is willing to wait.
            cooldownTicks: 240,
            hudCategory: 'custom_swords_time',
            // Deliberately tight. A hold this strong at Earth's six-block reach
            // would be a fight-ender rather than a moment-maker.
            targeting: { type: 'area', range: 4, maxTargets: 6 },
            allowedTargets: ['mob', 'player'],
            // Applied at the ability's computed duration, not this one — a long
            // hold is long in every respect. `stasis` passes
            // `applyBindingEffects: false` and places them itself.
            effects: [
                { effect: 'weakness', durationTicks: 40 },
                { effect: 'mining_fatigue', durationTicks: 40, amplifier: 2 },
            ],
            particles: [
                { id: 'minecraft:redstone_repeater_dust_particle', count: 16, spread: 1.1, at: 'caster' },
                { id: 'minecraft:stalactite_water_drip_particle', count: 4, spread: 0.4, at: 'target' },
            ],
            sounds: { cast: 'chrono_cast', impact: 'chrono_impact' },
            params: {
                // Low. The hold is the payload; the damage is an afterthought.
                damage: 3,
                cause: 'magic',
                // Two seconds spent immediately, eight at a full meter.
                minFreezeTicks: 40,
                maxFreezeTicks: 160,
                // Sixty seconds of waiting buys a full charge.
                fullChargeTicks: 1200,
                // Slowness VI: movement reduced to almost nothing, which is as
                // close to frozen as Bedrock supports.
                holdAmplifier: 5,
                holdEffect: 'slowness',
                chargeKey: 'temporal_charge',
                ringPoints: 20,
            },
        },
        {
            activation: 'use',
            visual: 'chrono',
            label: 'Slow Field',
            abilityId: 'custom_swords:nova',
            cooldownTicks: 200,
            hudCategory: 'custom_swords_time',
            targeting: { type: 'area', range: 7, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.3, vertical: 0.1, mode: 'away' },
            effects: [
                { effect: 'slowness', durationTicks: 120, amplifier: 3 },
                { effect: 'mining_fatigue', durationTicks: 120, amplifier: 1 },
            ],
            params: {
                damage: 3,
                cause: 'magic',
                edgeDurationFactor: 0.4,
                shatterEffect: 'slowness',
                shatterBonus: 5,
                ringPoints: 20,
            },
        },
        {
            activation: 'use',
            visual: 'chrono',
            label: 'Chrono Lance',
            abilityId: 'custom_swords:beam',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_time',
            targeting: { type: 'ray', range: 18 },
            allowedTargets: ['mob', 'player'],
            effects: [{ effect: 'slowness', durationTicks: 80, amplifier: 1 }],
            params: {
                damage: 9,
                pierceFalloff: 0.8,
                maxPierce: 5,
                cause: 'magic',
                igniteSeconds: 0,
                linePoints: 18,
            },
        },
        {
            activation: 'use',
            visual: 'chrono',
            label: 'Time Skip',
            abilityId: 'custom_swords:blink',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_time',
            targeting: { type: 'self' },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.4, vertical: 0.2, mode: 'away' },
            params: {
                distance: 8,
                minDistance: 2,
                maxDrop: 4,
                allowLiquid: false,
                arrivalDamage: 4,
                arrivalRadius: 2.5,
                arrivalMaxTargets: 4,
                cause: 'magic',
                trailPoints: 12,
                markKey: 'time_skip',
            },
        },
        {
            activation: 'use',
            visual: 'chrono',
            label: 'Temporal Rift',
            abilityId: 'custom_swords:rift',
            cooldownTicks: 220,
            hudCategory: 'custom_swords_time',
            targeting: { type: 'point', range: 14 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.1, vertical: 0.2, pull: true },
            params: {
                nearDamage: 7,
                reachBonus: 5,
                radius: 3.5,
                maxTargets: 6,
                cause: 'magic',
                ringPoints: 18,
                tetherPoints: 8,
            },
        },
        {
            activation: 'use',
            visual: 'chrono',
            label: 'Haste',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 500,
            hudCategory: 'custom_swords_time',
            targeting: { type: 'self' },
            effects: [
                { effect: 'speed', durationTicks: 160, amplifier: 2 },
                { effect: 'haste', durationTicks: 160, amplifier: 1 },
            ],
            params: { heal: 0, extinguish: false },
        },
        {
            activation: 'use',
            visual: 'chrono',
            label: 'Rewind',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 900,
            hudCategory: 'custom_swords_time',
            targeting: { type: 'self' },
            effects: [{ effect: 'regeneration', durationTicks: 120, amplifier: 1 }],
            params: { heal: 6, extinguish: false },
        },
        {
            // TEMPORAL EDGE — fighting winds the sword faster than waiting does.
            activation: 'attack',
            visual: 'chrono',
            label: 'Temporal Edge',
            abilityId: 'custom_swords:tempo',
            cooldownTicks: 10,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            // A brief drag on every landed hit — certain, not a dice roll.
            effects: [{ effect: 'slowness', durationTicks: 30 }],
            particles: [{ id: 'minecraft:redstone_repeater_dust_particle', count: 5, spread: 0.3, at: 'target' }],
            sounds: { impact: 'chrono_wind' },
            params: {
                damage: 2,
                cause: 'magic',
                // Three seconds of charge per hit: twenty landed hits are worth
                // the same as a full minute of patience.
                chargePerHit: 60,
                maxBankedHits: 8,
                // Both of these MUST match the active's. `npm run validate`
                // checks each ability's own parameters but cannot know that two
                // bindings on one sword are meant to agree — see docs.
                chargeKey: 'temporal_charge',
                fullChargeTicks: 1200,
            },
        },
    ],
};
