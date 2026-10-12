/**
 * Player-facing feedback: action bar text and the small audio cues that tell a
 * player why nothing happened.
 *
 * Feedback is always sent to exactly one player. Nothing here can broadcast, so
 * one player's cooldown notice can never appear on another player's screen.
 *
 * Text is emitted as `RawMessage` translation keys where a key exists, falling
 * back to literal text, so a later localisation milestone only has to add
 * `.lang` entries.
 */

import { formatTicks } from '../util/ticks.js';

/** @typedef {import('@minecraft/server').Player} Player */

export class FeedbackService {
    /**
     * @param {typeof import('../config.js').CONFIG} config
     * @param {import('./sounds.js').SoundService} sounds
     * @param {typeof import('../core/log.js').log} log
     */
    constructor(config, sounds, log) {
        /** @private @readonly */
        this.config = config;
        /** @private @readonly */
        this.sounds = sounds;
        /** @private @readonly */
        this.log = log;
    }

    /**
     * @param {Player} player
     * @param {string} text Plain text, may contain Minecraft section colour codes.
     */
    actionBar(player, text) {
        if (!this.config.feedback.actionBar) return;
        if (!player.isValid) return;
        try {
            player.onScreenDisplay.setActionBar(text);
        } catch (error) {
            this.log.debug('feedback.actionBar failed:', error);
        }
    }

    /**
     * Shown when an ability fires successfully.
     *
     * @param {Player} player
     * @param {string} abilityName
     * @param {string} [detail] Optional suffix, e.g. `3 hit`.
     */
    abilityUsed(player, abilityName, detail) {
        this.actionBar(player, `§b${abilityName}§r${detail ? ` §7${detail}§r` : ''}`);
    }

    /**
     * Shown when the ability is still cooling down.
     *
     * @param {Player} player
     * @param {string} abilityName
     * @param {number} remainingTicks
     */
    /**
     * The player switched abilities. Shows position, name and readiness, with a
     * click so the switch is felt even when the action bar is missed.
     *
     * @param {import('@minecraft/server').Player} player
     * @param {{ label: string, index: number, count: number, remainingTicks: number }} selection
     */
    abilitySelected(player, { label, index, count, remainingTicks }) {
        const status = remainingTicks > 0 ? `§c${formatTicks(remainingTicks)}` : '§aReady';
        this.actionBar(player, `§e[${index + 1}/${count}] §b${label} §7- ${status}§r`);
        this.sounds.playFor(player, 'ability_switch');
    }

    onCooldown(player, abilityName, remainingTicks) {
        this.actionBar(player, `§7${abilityName} §c${formatTicks(remainingTicks)}§r`);
        if (this.config.feedback.denySound) this.sounds.playFor(player, 'ability_deny');
    }

    /**
     * Shown when an ability ran but found nothing to act on.
     *
     * @param {Player} player
     * @param {string} message
     */
    denied(player, message) {
        this.actionBar(player, `§7${message}§r`);
        if (this.config.feedback.denySound) this.sounds.playFor(player, 'ability_deny');
    }

    /**
     * Shown when an ability threw. Deliberately vague to the player; the real
     * detail goes to the content log for the developer.
     *
     * @param {Player} player
     */
    internalError(player) {
        this.actionBar(player, '§cThat ability failed. Check the content log.§r');
    }
}
