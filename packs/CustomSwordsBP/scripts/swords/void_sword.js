/**
 * Void Sword — the first blade that reaches somewhere the wielder is not.
 *
 * Void Rift resolves the block the player is looking at, up to ten blocks away,
 * and collapses it: everything nearby is damaged, weakened and dragged toward
 * the tear. Void Drain then pays the wielder back out of whatever is closest to
 * dying. Reach, then harvest.
 *
 * ## How it plays
 *
 *   tear a rift under a group at range → they are pulled together and weakened
 *   → close, and every swing on the survivors returns health in proportion to
 *   how little they have left
 *
 * The rift is worth more the further it is thrown, and the drain is worth more
 * the closer its target is to death. Both ends of the kit push the player
 * towards the same play — commit to a distant, wounded group — which is a
 * different fight from any of the other ten swords.
 *
 * ## Why it is not Shadow
 *
 * This is the comparison the sword exists to survive, and the answer is that
 * the two move opposite things:
 *
 * | | Void Sword | Shadow Sword |
 * |---|---|---|
 * | Fantasy | somewhere else arriving | being where you were not |
 * | What moves | the **enemy**, dragged inward | the **wielder**, six blocks through the dark |
 * | Active | `rift` — remote point, damage rises with reach | `blink` — validated dash, no meaningful damage |
 * | Passive | `drain` — pays out on how *hurt the target* is | `opportunist` — pays out inside a window the dash opened |
 * | Sustain | continuous trickle, self-limiting | a fixed lifesteal on empowered hits only |
 * | Colour | deep indigo, cyan rift-light, pale bone | matte near-black, violet rim light |
 *
 * Void Sword never teleports anything, wielder or enemy. That was the obvious
 * design and it is the one Shadow already owns; a second teleport sword would
 * have been a recolour with extra steps.
 *
 * ## What it deliberately does not do
 *
 * No blocks are broken or placed, no portal is created, no entity is spawned or
 * relocated across the world, and nothing survives the activation. The rift is
 * a location, a particle sphere and one pass through the combat layer. See
 * `abilities/builtin/rift.js` for why that restraint is load-bearing rather
 * than timid.
 *
 * ## Balance
 *
 * Legendary, 9 effective melee — level with Thunder, and the joint-highest
 * outside Earth. It earns the tier on reach rather than on numbers: ten blocks
 * of aimed area control is worth more than a point of damage, and the sustain
 * is capped hard enough (3 HP at the very best, against a nearly dead target,
 * on a hit that actually landed) that it never becomes a way to out-heal a
 * fight. Its 1600 durability is the collection's highest: the one material here
 * that does not really wear.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const voidSword = {
    id: 'custom_swords:void_sword',
    name: 'Void Sword',
    rarity: 'legendary',
    description: 'The edge is a seam. What it opens does not stay open.',

    item: {
        // 9 effective melee, matching Thunder. The reach is the Legendary part.
        attackDamage: 8,
        durability: 1600,
        swingDuration: 0.36,
        // The highest in the collection. Void metal takes enchantment readily —
        // and this is the sword most worth investing in.
        enchantValue: 21,
        repairItems: ['minecraft:ender_eye'],
    },

    // Legendary, and priced like one: dragon breath means the fight has already
    // been won once, and nothing else in the collection asks for netherite.
    recipe: {
        pattern: [' B ', 'ENE', ' R '],
        key: {
            B: 'minecraft:dragon_breath',
            E: 'minecraft:ender_eye',
            N: 'minecraft:netherite_ingot',
            R: 'minecraft:end_rod',
        },
        unlockedBy: 'minecraft:dragon_breath',
    },

    abilities: [
        {
            // VOID RIFT — the collection's first ability that acts somewhere
            // the caster is not.
            activation: 'use',
            visual: 'void',
            label: 'Void Rift',
            abilityId: 'custom_swords:rift',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_void',
            // `point` resolves a location, not entities; `rift` queries around
            // it once. Ten blocks, echoing the movement layer's dash ceiling —
            // far enough to open a fight, short enough to stay a local effect.
            targeting: { type: 'point', range: 10 },
            allowedTargets: ['mob', 'player'],
            // Applied from the RIFT's centre with `pull`, so everything caught
            // is dragged in rather than scattered.
            knockback: { horizontal: 1.2, vertical: 0.2, pull: true },
            effects: [{ effect: 'weakness', durationTicks: 80 }],
            particles: [
                { id: 'minecraft:dragon_breath_trail', count: 10, spread: 0.9, at: 'caster' },
                { id: 'minecraft:obsidian_tear_particle', count: 6, spread: 0.5, at: 'target' },
            ],
            sounds: { cast: 'void_cast', impact: 'void_impact' },
            params: {
                // 5 at the wielder's feet rising to 9 at full reach. The exact
                // inverse of `burst`'s falloff, and the reason aiming matters.
                nearDamage: 5,
                reachBonus: 4,
                radius: 3.5,
                maxTargets: 6,
                cause: 'magic',
                ringPoints: 18,
                tetherPoints: 8,
            },
        },
        {
            activation: 'use',
            visual: 'void',
            label: 'Void Lance',
            abilityId: 'custom_swords:beam',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_void',
            targeting: { type: 'ray', range: 18 },
            allowedTargets: ['mob', 'player'],
            effects: [{ effect: 'weakness', durationTicks: 80 }],
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
            visual: 'void',
            label: 'Null Step',
            abilityId: 'custom_swords:blink',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_void',
            targeting: { type: 'self' },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.4, vertical: 0.2, mode: 'away' },
            params: {
                distance: 9,
                minDistance: 2,
                maxDrop: 4,
                allowLiquid: false,
                arrivalDamage: 5,
                arrivalRadius: 2.5,
                arrivalMaxTargets: 4,
                cause: 'magic',
                trailPoints: 12,
                markKey: 'null_step',
            },
        },
        {
            activation: 'use',
            visual: 'void',
            label: 'Event Horizon',
            abilityId: 'custom_swords:repulse',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_void',
            targeting: { type: 'area', range: 9, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.8, vertical: 0.1, pull: true },
            effects: [{ effect: 'slowness', durationTicks: 80, amplifier: 1 }],
            params: { damage: 3, trailPoints: 5 },
        },
        {
            activation: 'use',
            visual: 'void',
            label: 'Entropy',
            abilityId: 'custom_swords:nova',
            cooldownTicks: 200,
            hudCategory: 'custom_swords_void',
            targeting: { type: 'area', range: 7, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.3, vertical: 0.1, mode: 'away' },
            effects: [{ effect: 'wither', durationTicks: 80 }, { effect: 'weakness', durationTicks: 100 }],
            params: {
                damage: 4,
                cause: 'magic',
                edgeDurationFactor: 0.4,
                shatterEffect: 'wither',
                shatterBonus: 5,
                ringPoints: 20,
            },
        },
        {
            activation: 'use',
            visual: 'void',
            label: 'Void Shell',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 600,
            hudCategory: 'custom_swords_void',
            targeting: { type: 'self' },
            effects: [
                { effect: 'resistance', durationTicks: 160, amplifier: 1 },
                { effect: 'absorption', durationTicks: 200, amplifier: 1 },
            ],
            params: { heal: 0, extinguish: false },
        },
        {
            // VOID DRAIN — sustain that shrinks as its source recovers.
            activation: 'attack',
            visual: 'void',
            label: 'Void Drain',
            abilityId: 'custom_swords:drain',
            cooldownTicks: 10,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            particles: [{ id: 'minecraft:end_chest', count: 6, spread: 0.35, at: 'target' }],
            sounds: { impact: 'void_drain' },
            params: {
                damage: 2,
                cause: 'magic',
                // 3 HP against something at death's door, scaling to nothing at
                // 85% health. Never enough to out-heal an incoming fight.
                maxHeal: 3,
                emptyThreshold: 0.85,
            },
        },
    ],
};
