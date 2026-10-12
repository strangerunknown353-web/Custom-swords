/**
 * Poison Sword — a sword that banks its resource in the enemy.
 *
 * Venomous Edge works venom one tier deeper into a target with every swing, up
 * to Poison III. Venom Burst then ruptures whatever has been built: each target
 * takes damage scaled by the venom it is carrying, and that venom is spent.
 *
 * ## How it plays
 *
 *   pick one thing, stay on it, watch the venom climb — then burst before it
 *   times out, and accept that walking away from a half-poisoned troll wastes
 *   every swing you put into it
 *
 * That is a commitment mechanic, and it is the sword's whole identity. Ember
 * Blade is the closest relative and the difference is where the meter lives:
 *
 * | | Poison Sword | Ember Blade |
 * |---|---|---|
 * | The meter is on | each **target** | the **wielder** |
 * | Filled by | hitting *that* target | hitting anything |
 * | Carried between fights | no — it dies with the mob | yes, until you do |
 * | Punishes | switching targets | dying |
 *
 * A wielder with a full Ember meter takes it into the next fight. A wielder who
 * spends thirty seconds poisoning a ravager and then kills a chicken has banked
 * nothing at all.
 *
 * ## Why it is not Nature Sword
 *
 * Green is a crowded colour, so the two are opposites on every axis that
 * matters:
 *
 * | | Poison | Nature |
 * |---|---|---|
 * | Fantasy | venom, rot, a coated blade | growth, vines, sap |
 * | Active | `rupture` — spends venom already worked in | `entangle` — roots a group |
 * | The active pays | **damage**, per tier carried | **healing**, per target held |
 * | Passive | escalates an affliction on one target | applies a fixed one |
 * | Direction | outward, offensive | inward, sustaining |
 * | Colour | sickly yellow-green, bruised violet, corroded bronze | leaf green, living wood, gold sap |
 *
 * Nature's kit is about staying alive in a crowd. This one is about killing one
 * specific thing.
 *
 * ## Balance
 *
 * Rare, and the **lowest melee in the collection after Ember Blade** at 6. That
 * is correct twice over: the venom is the damage, and it arrives late. A player
 * who swings this like an ordinary sword has a weak Rare; one who plays the
 * loop has a full Venom Burst worth up to 13 against a single well-worked
 * target.
 *
 * Poison cannot kill in Bedrock — it stops at half a heart — so the sword can
 * never finish anything on its own. That is a real constraint and it is why the
 * burst deals direct damage rather than simply stacking more poison.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const poisonSword = {
    id: 'custom_swords:poison_sword',
    name: 'Poison Sword',
    rarity: 'rare',
    description: 'The wound is the smaller half of what it leaves behind.',

    item: {
        // 6 effective melee — level with Wind, above only Ember Blade's 6 at
        // Uncommon. The blade is a delivery mechanism.
        attackDamage: 5,
        durability: 750,
        // Quick and light, like something meant to score skin rather than
        // cleave through it.
        swingDuration: 0.26,
        enchantValue: 18,
        repairItems: ['minecraft:fermented_spider_eye'],
    },

    // Rare: a pufferfish barbed onto an iron core between two fermented spider
    // eyes, on a cactus grip. Every ingredient is something that hurts to touch.
    recipe: {
        pattern: [' P ', 'FIF', ' C '],
        key: {
            P: 'minecraft:pufferfish',
            F: 'minecraft:fermented_spider_eye',
            I: 'minecraft:iron_ingot',
            C: 'minecraft:cactus',
        },
        unlockedBy: 'minecraft:fermented_spider_eye',
    },

    abilities: [
        {
            // VENOM BURST — spends what the passive has been working in.
            activation: 'use',
            visual: 'venom',
            label: 'Venom Burst',
            abilityId: 'custom_swords:rupture',
            cooldownTicks: 130,
            hudCategory: 'custom_swords_poison',
            targeting: { type: 'area', range: 4, maxTargets: 6 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.4, vertical: 0.1, mode: 'away' },
            // Nausea on top of the venom the ability manages itself — the
            // disorientation of a lungful of toxin.
            effects: [{ effect: 'nausea', durationTicks: 80 }],
            particles: [
                { id: 'minecraft:llama_spit_smoke', count: 16, spread: 1.1, at: 'caster' },
                { id: 'minecraft:sculk_sensor_redstone_particle', count: 5, spread: 0.4, at: 'target' },
            ],
            sounds: { cast: 'venom_cast', impact: 'venom_impact' },
            params: {
                // 4 clean, rising to 13 against a target carrying Poison III.
                damage: 4,
                cause: 'magic',
                venomEffect: 'poison',
                damagePerTier: 3,
                // A rupture leaves its targets poisoned, not cleansed. Curing an
                // enemy would be a strange thing for a poison sword to do.
                residualTicks: 60,
                ringPoints: 18,
            },
        },
        {
            activation: 'use',
            visual: 'venom',
            label: 'Venom Spit',
            abilityId: 'custom_swords:beam',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_poison',
            targeting: { type: 'ray', range: 12 },
            allowedTargets: ['mob', 'player'],
            effects: [{ effect: 'poison', durationTicks: 100, amplifier: 1 }],
            params: {
                damage: 3,
                pierceFalloff: 0.8,
                maxPierce: 3,
                cause: 'magic',
                igniteSeconds: 0,
                linePoints: 18,
            },
        },
        {
            activation: 'use',
            visual: 'venom',
            label: 'Toxic Cloud',
            abilityId: 'custom_swords:nova',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_poison',
            targeting: { type: 'area', range: 6, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.3, vertical: 0.1, mode: 'away' },
            effects: [
                { effect: 'poison', durationTicks: 100, amplifier: 0 },
                { effect: 'nausea', durationTicks: 80 },
            ],
            params: {
                damage: 3,
                cause: 'magic',
                edgeDurationFactor: 0.4,
                shatterEffect: 'poison',
                shatterBonus: 5,
                ringPoints: 20,
            },
        },
        {
            activation: 'use',
            visual: 'venom',
            label: 'Withering Hex',
            abilityId: 'custom_swords:brand',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_poison',
            targeting: { type: 'ray', range: 10, maxTargets: 1 },
            allowedTargets: ['mob', 'player'],
            effects: [
                { effect: 'weakness', durationTicks: 160 },
                { effect: 'hunger', durationTicks: 160, amplifier: 1 },
            ],
            params: { damage: 2, cause: 'magic', igniteSeconds: 0, focusedDurationBonus: 1.5 },
        },
        {
            // VENOMOUS EDGE — the meter, kept on the enemy.
            activation: 'attack',
            visual: 'venom',
            label: 'Venomous Edge',
            abilityId: 'custom_swords:envenom',
            // The anti-spam floor. The venom's own ceiling is `maxAmplifier`,
            // so a fast flurry cannot push past Poison III however it is timed.
            cooldownTicks: 12,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            particles: [{ id: 'minecraft:llama_spit_smoke', count: 5, spread: 0.3, at: 'target' }],
            sounds: { impact: 'venom_impact' },
            params: {
                damage: 1,
                cause: 'magic',
                venomEffect: 'poison',
                // Five seconds, refreshed by every hit that deepens it — long
                // enough to build a stack, short enough that walking away loses
                // it.
                venomTicks: 100,
                // Poison III. Higher, on a refreshable timer, kills anything
                // given patience, which is a wait rather than a weapon.
                maxAmplifier: 2,
            },
        },
    ],
};
