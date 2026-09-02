/**
 * Radiance — sunlight against the things that hide from it.
 *
 * The first passive that asks **what a target is** rather than what state it is
 * in. Every landed hit deals a bonus against a declared target category —
 * undead, on Solar Sword — and the bonus is scaled by the same daylight
 * `flare` draws on, so the sword's two halves rise and fall together instead of
 * being two unrelated numbers on one item.
 *
 * ## Why a category and not a list of mob ids
 *
 * `services.targeting.isCategory` answers the question through
 * `core/target_categories.js`, which is built on Bedrock's own
 * `minecraft:type_family` data. A hard-coded list of zombie, skeleton, husk,
 * drowned, stray, wither skeleton, zoglin, phantom and zombie villager would be
 * wrong the day Mojang adds the tenth, and silently wrong — the bonus would
 * simply stop applying, with nothing to notice it. Reading the family means a
 * future undead mob is covered on the day it ships, and it means the bonus
 * category is *binding data*: a later sword can bind this same ability against
 * `arthropod` and become a spider-slayer with no new code.
 *
 * ## Balance
 *
 * The bonus is conditional twice over — the target must be in the category and
 * the sun must be up — so it can be generous where it applies without making
 * the sword generally strong. Against a creeper at noon, or a zombie at
 * midnight, this passive is a 1-damage chip and nothing more.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const radiance = {
    id: 'custom_swords:radiance',
    name: 'Radiance',
    description: 'Burns brightest against what the sun was always against.',

    defaults: {
        /**
         * Chip damage on an ordinary hit. At least 1 — this ability learns that
         * its blow landed from `StrikeReport.damaged`, and the damage layer
         * refuses a strike that resolves to zero.
         */
        damage: 1,
        cause: 'magic',
        /**
         * Target categories the bonus applies to. Data, not code: any category
         * `core/target_categories.js` knows works here.
         */
        smiteCategories: ['undead'],
        /** Extra damage against a matching target, at full daylight. */
        smiteDamage: 6,
        /**
         * Share of the bonus that lands with no sun at all. The bonus never
         * disappears completely — an undead is still an undead at night — but
         * most of it is the sun's.
         */
        nightFactor: 0.25,
        /** Particles on a smiting hit only. */
        smiteParticleCount: 10,
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.damage !== 'number' || params.damage < 1) {
            problems.push(
                "'damage' must be at least 1 — the bonus is checked on a landed hit, and a zero-damage strike is refused.",
            );
        }
        if (!Array.isArray(params.smiteCategories) || params.smiteCategories.length === 0) {
            problems.push("'smiteCategories' must be a non-empty array of target category ids.");
        }
        if (typeof params.smiteDamage !== 'number' || params.smiteDamage < 0) {
            problems.push("'smiteDamage' must be a non-negative number.");
        }
        if (typeof params.nightFactor !== 'number' || params.nightFactor < 0 || params.nightFactor > 1) {
            problems.push("'nightFactor' must be between 0 and 1.");
        }
        return problems;
    },

    /**
     * @param {import('../../core/types.js').AbilityContext} ctx
     * @returns {import('../../core/types.js').AbilityResult}
     */
    execute(ctx) {
        const { params, services } = ctx;

        const target = services.targeting.resolve(ctx)[0];
        if (target === undefined) return { ok: false, message: 'No contact.' };

        const smites = services.targeting.isCategory(target, params.smiteCategories);
        const sun = smites ? services.environment.daylight(ctx.dimension) : 0;
        const bonus = smites ? params.smiteDamage * (params.nightFactor + (1 - params.nightFactor) * sun) : 0;

        const report = services.combat.strikeOne(ctx, target, {
            damage: params.damage + bonus,
            damageCause: params.cause,
            // The binding's effects belong to the smite, not to every swing at
            // every pig.
            applyBindingEffects: smites,
        });

        if (!report.damaged) return { ok: false, message: 'The blow glanced off.' };
        if (!smites) return { ok: true, message: 'strike' };

        services.particles.emit(
            ctx.dimension,
            {
                id: ctx.visual?.target ?? 'minecraft:evocation_fang_particle',
                count: params.smiteParticleCount,
                spread: 0.5,
            },
            target.location,
        );
        // The binding's `cast` slot is this ability's smite cue rather than an
        // activation sound — `attack` bindings get no action-bar feedback, so a
        // distinct note is the only way the bonus is legible. The ordinary
        // impact sound has already played for every hit, smiting or not.
        if (ctx.sounds.cast !== undefined) {
            services.sounds.playAt(ctx.dimension, ctx.sounds.cast, target.location);
        }

        return { ok: true, message: 'radiance' };
    },
};
