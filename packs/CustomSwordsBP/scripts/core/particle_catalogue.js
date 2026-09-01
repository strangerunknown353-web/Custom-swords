/**
 * Vanilla Bedrock particle identifiers, split by whether they can actually be
 * spawned from script.
 *
 * ## Why this exists
 *
 * `Dimension.spawnParticle` does not fail loudly on a bad identifier. Depending
 * on the identifier you get silence, or you get content-log spam every tick the
 * ability fires. Either way the player sees nothing and the developer sees a
 * working test suite, because a mocked engine happily "spawns" anything.
 *
 * v0.5.1 shipped five unusable particle identifiers across four swords —
 * two that do not exist at all, three that cannot be spawned this way. Wind had
 * no working particle at all, so its ability was completely invisible. This
 * module makes that a build error instead.
 *
 * ## The two failure modes
 *
 * 1. **Does not exist.** `minecraft:sculk_soul_particle` and
 *    `minecraft:wind_explosion_emitter` are not vanilla identifiers. They read
 *    plausibly, which is exactly the problem.
 * 2. **Exists but needs Molang context.** Many vanilla particles are authored
 *    for a host entity and read variables the spawner cannot set. Spawning them
 *    standalone logs errors rather than rendering. `basic_crit_particle`,
 *    `electric_spark_particle` and `water_splash_particle` are all in this
 *    group — and each has a usable sibling
 *    (`critical_hit_emitter`, `endrod`, `water_splash_particle_manual`).
 *
 * Transcribed from the Bedrock Wiki's vanilla particle list, which classifies
 * every identifier by exactly this distinction. Like `effect_catalogue.js`,
 * this is a snapshot: a particle added in a later release is rejected until the
 * list is updated, which is the safe direction to fail.
 */

/**
 * Particles that render correctly when spawned from script with no host entity.
 *
 * @type {ReadonlySet<string>}
 */
export const USABLE_PARTICLES = Object.freeze(
    new Set([
        'minecraft:basic_flame_particle',
        'minecraft:basic_portal_particle',
        'minecraft:basic_smoke_particle',
        'minecraft:blue_flame_particle',
        'minecraft:campfire_smoke_particle',
        'minecraft:campfire_tall_smoke_particle',
        'minecraft:candle_flame_particle',
        'minecraft:critical_hit_emitter',
        'minecraft:crop_growth_emitter',
        'minecraft:dragon_breath_trail',
        'minecraft:dragon_destroy_block',
        'minecraft:dragon_dying_explosion',
        'minecraft:endrod',
        'minecraft:end_chest',
        'minecraft:evocation_fang_particle',
        'minecraft:evoker_spell',
        'minecraft:falling_border_dust_particle',
        'minecraft:heart_particle',
        'minecraft:honey_drip_particle',
        'minecraft:huge_explosion_emitter',
        'minecraft:ice_evaporation_emitter',
        'minecraft:knockback_roar_particle',
        'minecraft:lab_table_misc_mystical_particle',
        'minecraft:large_explosion',
        'minecraft:lava_drip_particle',
        'minecraft:lava_particle',
        'minecraft:llama_spit_smoke',
        'minecraft:magnesium_salts_emitter',
        'minecraft:mob_portal',
        'minecraft:mycelium_dust_particle',
        'minecraft:obsidian_glow_dust_particle',
        'minecraft:obsidian_tear_particle',
        'minecraft:redstone_ore_dust_particle',
        'minecraft:redstone_repeater_dust_particle',
        'minecraft:redstone_torch_dust_particle',
        'minecraft:redstone_wire_dust_particle',
        'minecraft:rising_border_dust_particle',
        'minecraft:sculk_sensor_redstone_particle',
        'minecraft:snowflake_particle',
        'minecraft:spore_blossom_ambient_particle',
        'minecraft:spore_blossom_shower_particle',
        'minecraft:stalactite_lava_drip_particle',
        'minecraft:stalactite_water_drip_particle',
        'minecraft:totem_particle',
        'minecraft:villager_angry',
        'minecraft:villager_happy',
        'minecraft:water_drip_particle',
        'minecraft:water_evaporation_bucket_emitter',
        'minecraft:water_splash_particle_manual',
    ]),
);

/**
 * Identifiers that exist but cannot be spawned standalone, mapped to the usable
 * sibling to reach for instead. Drives the validator's error message, so a
 * mistake comes with its own fix.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const NEEDS_HOST_CONTEXT = Object.freeze({
    'minecraft:basic_crit_particle': 'minecraft:critical_hit_emitter',
    'minecraft:water_splash_particle': 'minecraft:water_splash_particle_manual',
    'minecraft:electric_spark_particle': 'minecraft:endrod',
    'minecraft:soul_particle': 'minecraft:basic_portal_particle',
    'minecraft:explosion_particle': 'minecraft:huge_explosion_emitter',
    'minecraft:note_particle': 'minecraft:totem_particle',
    'minecraft:rain_splash_particle': 'minecraft:water_splash_particle_manual',
    'minecraft:enchanting_table_particle': 'minecraft:evoker_spell',
    'minecraft:conduit_absorb_particle': 'minecraft:water_evaporation_bucket_emitter',
    'minecraft:dragon_breath_fire': 'minecraft:dragon_breath_trail',
    'minecraft:dragon_breath_lingering': 'minecraft:dragon_breath_trail',
    'minecraft:mobspell_emitter': 'minecraft:evoker_spell',
    'minecraft:sparkler_emitter': 'minecraft:redstone_torch_dust_particle',
    'minecraft:water_wake_particle': 'minecraft:water_splash_particle_manual',
    'minecraft:wax_particle': 'minecraft:honey_drip_particle',
    'minecraft:shulker_bullet': 'minecraft:end_chest',
    'minecraft:portal_directional': 'minecraft:basic_portal_particle',
});

/**
 * @param {unknown} id
 * @returns {boolean}
 */
export function isUsableParticle(id) {
    return typeof id === 'string' && USABLE_PARTICLES.has(id);
}

/**
 * Explains why a particle cannot be used, and what to use instead. Returns
 * `undefined` when the identifier is fine.
 *
 * @param {string} id
 * @returns {string | undefined}
 */
export function explainParticle(id) {
    if (USABLE_PARTICLES.has(id)) return undefined;

    const sibling = NEEDS_HOST_CONTEXT[id];
    if (sibling !== undefined) {
        return `'${id}' exists but reads Molang variables from a host entity, so spawning it from script logs errors instead of rendering. Use '${sibling}'.`;
    }

    const suggestion = suggestParticle(id);
    return (
        `'${id}' is not a usable vanilla particle identifier.` +
        (suggestion === undefined ? '' : ` Did you mean '${suggestion}'?`)
    );
}

/**
 * Nearest usable identifier by shared word stems — enough to catch a typo or a
 * half-remembered name.
 *
 * @param {string} id
 * @returns {string | undefined}
 */
export function suggestParticle(id) {
    const stems = id.replace(/^minecraft:/, '').split('_').filter((w) => w.length > 2);
    if (stems.length === 0) return undefined;

    /** @type {{ id: string, score: number } | undefined} */
    let best;
    for (const candidate of USABLE_PARTICLES) {
        const words = candidate.replace(/^minecraft:/, '').split('_');
        const score = stems.filter((s) => words.includes(s)).length;
        if (score > 0 && (best === undefined || score > best.score)) best = { id: candidate, score };
    }
    return best?.id;
}
