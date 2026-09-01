/**
 * Central configuration for the Custom Swords framework.
 *
 * This is the ONLY place tunable global behaviour lives. Nothing in the
 * framework reads magic numbers directly; everything reads from here or from a
 * sword/ability definition. Keeping it engine-free means the whole config can
 * be loaded and asserted in unit tests.
 *
 * NOTE: values here are compile-time constants. Runtime, per-world settings are
 * intentionally out of scope for the foundation milestone (see TODO.md).
 */

export const CONFIG = Object.freeze({
    /** Namespace used for every identifier this project creates. */
    namespace: 'custom_swords',

    /** Semantic version of the framework. Kept in sync by `tools/set-version.mjs`. */
    version: '0.5.2',

    debug: Object.freeze({
        /** Emit lifecycle + dispatch logs to the content log. */
        enabled: true,
        /** 'error' | 'warn' | 'info' | 'debug' */
        level: 'info',
    }),

    combat: Object.freeze({
        /**
         * Global multiplier applied to every point of ability damage. Lets a
         * server operator soften or sharpen the whole addon in one place
         * without touching 25 sword definitions.
         */
        abilityDamageMultiplier: 1.0,
        /** Hard ceiling on a single ability damage application. */
        maxAbilityDamagePerHit: 100,
        /**
         * When false, abilities never damage or knock back other players.
         * Targeting filters this out before damage is ever applied.
         */
        allowPlayerVersusPlayer: true,
        /**
         * Ceilings on knockback, so a mis-authored definition cannot fling a
         * player across the world or out of the sky.
         */
        maxKnockbackHorizontal: 4,
        maxKnockbackVertical: 2,

        /**
         * Ticks a target is immune to *further hits from the same player's
         * abilities* after being struck. Guards against an ability that fires
         * repeatedly hitting one entity dozens of times a second. 0 disables it;
         * per-execution protection (one hit per target per activation) is always
         * on and is not affected by this.
         */
        hitProtectionTicks: 10,

        /**
         * Minimum ticks between two ability activations by the same player.
         * Purely anti-spam: a held right-click can otherwise re-fire every tick
         * and dominate a busy server's budget. Cooldowns are the gameplay
         * mechanism; this is the floor beneath them.
         */
        minActivationIntervalTicks: 2,

        /** Entity type ids that abilities must never target. */
        neverTarget: Object.freeze([
            'minecraft:item',
            'minecraft:xp_orb',
            'minecraft:arrow',
            'minecraft:area_effect_cloud',
            'minecraft:painting',
            'minecraft:leash_knot',
            'minecraft:armor_stand',
            'minecraft:tripod_camera',
            'minecraft:fishing_hook',
        ]),
    }),

    cooldown: Object.freeze({
        /**
         * Ticks between sweeps of the cooldown/player-state stores. This is the
         * ONLY recurring interval the addon schedules. 600 ticks = 30 seconds.
         */
        sweepIntervalTicks: 600,
        /**
         * Mirror script cooldowns onto the vanilla item-cooldown HUD overlay
         * when a sword opts in via `cooldown.hudCategory`.
         */
        mirrorToItemHud: true,
    }),

    targeting: Object.freeze({
        /** Safety ceiling so a mis-authored definition cannot scan the world. */
        maxRange: 32,
        /** Safety ceiling on how many entities one ability may act on. */
        maxTargets: 64,
    }),

    particles: Object.freeze({
        /** Safety ceiling on particles emitted by a single `particles.emit` call. */
        maxPerEmit: 64,
    }),

    feedback: Object.freeze({
        /** Show ability names / cooldown notices on the action bar. */
        actionBar: true,
        /** Play a short click when an ability is refused (cooldown, no target). */
        denySound: true,
    }),
});
