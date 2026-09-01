/**
 * Combat behaviour: what happens when a custom sword lands a melee hit.
 *
 * This exists as its own system (rather than living in the input router)
 * because on-hit behaviour will grow: later milestones add life steal, combo
 * counters, on-hit chance rolls and crit windows. Keeping it behind one entry
 * point means those grow in a single place instead of per sword.
 */

/** @typedef {import('../core/types.js').SwordDefinition} SwordDefinition */

export class CombatSystem {
    /**
     * @param {object} deps
     * @param {import('../core/ability_executor.js').AbilityExecutor} deps.executor
     */
    constructor({ executor }) {
        /** @private @readonly */
        this.executor = executor;
    }

    /**
     * Called once per melee hit made with a registered sword.
     *
     * @param {object} event
     * @param {import('@minecraft/server').Player} event.player The attacker.
     * @param {import('@minecraft/server').Entity} event.target
     * @param {SwordDefinition} event.sword
     * @param {import('@minecraft/server').ItemStack} [event.itemStack]
     */
    onHitEntity({ player, target, sword, itemStack }) {
        const binding = sword.passive;
        if (binding === undefined) return;
        if (!target.isValid) return;

        this.executor.invoke({
            player,
            sword,
            binding,
            trigger: 'hit',
            itemStack,
            target,
        });
    }
}
