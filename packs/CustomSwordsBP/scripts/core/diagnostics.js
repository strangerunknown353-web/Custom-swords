/**
 * In-game diagnostics, exposed as script events.
 *
 * The framework is mostly invisible: a player holding a sword cannot tell
 * whether the registry recognised it or whether the item merely *looks* right.
 * These commands make the framework's own view of the world observable, which
 * is what turns "it seems to work" into "the registry reports it".
 *
 *   /scriptevent custom_swords:list         every registered sword and its stats
 *   /scriptevent custom_swords:held         identify the item in your main hand
 *   /scriptevent custom_swords:info <id>    full record for one sword
 *
 * Cost when unused is a single event subscription filtered to our namespace —
 * no polling, no per-tick work. Output goes to the invoking player when there
 * is one, and to the content log otherwise (so it works from a command block or
 * the dedicated-server console).
 */

import { NAMESPACE, localNameOf } from './identifiers.js';
import { describeSword, describeAll } from './sword_stats.js';
import { ticksToSeconds } from '../util/ticks.js';

/** @typedef {import('@minecraft/server').Player} Player */

export class Diagnostics {
    /**
     * @param {object} deps
     * @param {import('./sword_registry.js').SwordRegistry} deps.swords
     * @param {import('./item_identifier.js').ItemIdentifier} deps.identifier
     * @param {typeof import('./log.js').log} deps.log
     */
    constructor({ swords, identifier, log }) {
        /** @private @readonly */
        this.swords = swords;
        /** @private @readonly */
        this.identifier = identifier;
        /** @private @readonly */
        this.log = log;
    }

    /**
     * Handles one `scriptevent`. Never throws: a diagnostic command that
     * crashes the handler would take the subscription down with it.
     *
     * @param {import('@minecraft/server').ScriptEventCommandMessageAfterEvent} event
     */
    handle(event) {
        try {
            const command = localNameOf(event.id);
            const player = this.playerFrom(event);

            switch (command) {
                case 'list':
                    this.reply(player, this.renderList());
                    return;
                case 'held':
                    this.reply(player, this.renderHeld(player));
                    return;
                case 'info':
                    this.reply(player, this.renderInfo(event.message.trim()));
                    return;
                default:
                    this.reply(player, [`§cUnknown command '${command}'. Try: list, held, info <id>.`]);
            }
        } catch (error) {
            this.log.error('Diagnostics command failed:', error);
        }
    }

    /**
     * @private
     * @param {import('@minecraft/server').ScriptEventCommandMessageAfterEvent} event
     * @returns {Player | undefined}
     */
    playerFrom(event) {
        const source = event.sourceEntity;
        if (source === undefined || source.typeId !== 'minecraft:player') return undefined;
        return /** @type {Player} */ (/** @type {unknown} */ (source));
    }

    /**
     * @private
     * @param {Player | undefined} player
     * @param {string[]} lines
     */
    reply(player, lines) {
        for (const line of lines) {
            if (player !== undefined && player.isValid) {
                try {
                    player.sendMessage(line);
                    continue;
                } catch {
                    // Fall through to the log if the player went away mid-reply.
                }
            }
            this.log.info(line);
        }
    }

    /**
     * @private
     * @returns {string[]}
     */
    renderList() {
        const shipped = this.swords.shipped();
        const diagnostics = this.swords.testItems();
        const lines = [
            `§b[Custom Swords]§r ${this.swords.size} registered — ` +
                `${shipped.length} shipped, ${diagnostics.length} diagnostic.`,
        ];
        for (const description of describeAll([...shipped, ...diagnostics])) {
            lines.push(
                `  ${description.coloredName} §7(${description.rarityLabel})§r ` +
                    `dmg ${description.stats.meleeDamage} · dur ${description.stats.durability}` +
                    `${description.isTestItem ? ' §8[diagnostic]§r' : ''}`,
            );
        }
        return lines;
    }

    /**
     * @private
     * @param {Player | undefined} player
     * @returns {string[]}
     */
    renderHeld(player) {
        if (player === undefined) {
            return ['§c/scriptevent custom_swords:held must be run by a player.'];
        }
        const description = this.identifier.describe(this.identifier.mainhandItem(player));
        switch (description.kind) {
            case 'custom_sword':
                return [
                    `§b[Custom Swords]§r Holding a registered custom sword:`,
                    ...this.renderSword(/** @type {any} */ (description.sword)),
                ];
            case 'vanilla_sword':
                return [`§b[Custom Swords]§r '${description.typeId}' is a §evanilla sword§r — not managed by this addon.`];
            case 'other_item':
                return [`§b[Custom Swords]§r '${description.typeId}' is not a custom sword.`];
            default:
                return ['§b[Custom Swords]§r Your main hand is empty.'];
        }
    }

    /**
     * @private
     * @param {string} argument
     * @returns {string[]}
     */
    renderInfo(argument) {
        if (argument.length === 0) {
            return [`§cUsage: /scriptevent ${NAMESPACE}:info <sword id or local name>`];
        }
        // Accept both `custom_swords:test_blade` and plain `test_blade`.
        const id = argument.includes(':') ? argument : `${NAMESPACE}:${argument}`;
        const sword = this.swords.get(id);
        if (sword === undefined) {
            return [`§cNo sword registered as '${id}'. Run /scriptevent ${NAMESPACE}:list to see all ids.`];
        }
        return this.renderSword(sword);
    }

    /**
     * @private
     * @param {import('./types.js').SwordDefinition} sword
     * @returns {string[]}
     */
    renderSword(sword) {
        const description = describeSword(sword);
        const lines = [
            `  ${description.coloredName} §8${description.id}§r`,
            `  §7${description.description}§r`,
            `  Rarity: ${description.rarityLabel} · Melee damage: ${description.stats.meleeDamage} · ` +
                `Durability: ${description.stats.durability}`,
            `  Enchantable: ${description.stats.enchantable ? `yes (${description.stats.enchantValue})` : 'no'} · ` +
                `Repair: ${description.stats.repairItems.join(', ') || 'none'}`,
        ];
        if (description.abilities.length === 0) {
            lines.push('  Abilities: none');
        }
        for (const ability of description.abilities) {
            lines.push(
                `  Ability (${ability.trigger}): §b${ability.abilityId}§r · ` +
                    `cooldown ${ticksToSeconds(ability.cooldownTicks)}s · ` +
                    `targeting ${ability.targetingType}${ability.range === undefined ? '' : ` r=${ability.range}`}`,
            );
        }
        return lines;
    }
}
