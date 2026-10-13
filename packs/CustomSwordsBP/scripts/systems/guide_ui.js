/**
 * The guide book's screens.
 *
 * Using the guide book opens a menu (Minecraft's own form UI): "How to play",
 * then every sword with its icon, sorted by rarity. Each sword's page shows
 * its recipe as a grid, its stats, every power and its passive, with buttons
 * to step to the next or previous sword. Content comes from
 * `core/guide_content.js`; this file only shows it.
 *
 * Forms are asynchronous. Every step catches its own errors, so a closed or
 * failed form simply ends the session instead of surfacing as a script error.
 */

import { ActionFormData } from '@minecraft/server-ui';

import { guideOrder, howToPlayPage, indexPage, swordIcon, swordPage } from '../core/guide_content.js';
import { GUIDE_TEXTURE_PATH } from '../core/identifiers.js';

const HOW_TO_PLAY_ICON = GUIDE_TEXTURE_PATH;

export class GuideUi {
    /**
     * @param {readonly import('../core/types.js').SwordDefinition[]} swords
     * @param {typeof import('../core/log.js').log} log
     */
    constructor(swords, log) {
        /** @private @readonly */
        this.swords = guideOrder(swords);
        /** @private @readonly */
        this.log = log;
    }

    /**
     * @param {import('@minecraft/server').Player} player
     * @returns {Promise<void>}
     */
    async open(player) {
        try {
            await this.showIndex(player);
        } catch (error) {
            this.log.debug('Guide closed:', error);
        }
    }

    /**
     * @private
     * @param {import('@minecraft/server').Player} player
     */
    async showIndex(player) {
        const page = indexPage(this.swords);
        const form = new ActionFormData().title(page.title).body(page.body);
        form.button('§lHow to play§r', HOW_TO_PLAY_ICON);
        for (const sword of this.swords) form.button(swordPage(sword).title, swordIcon(sword));

        const response = await form.show(/** @type {any} */ (player));
        if (response.canceled || response.selection === undefined) return;
        if (response.selection === 0) {
            await this.showHowToPlay(player);
        } else {
            await this.showSword(player, response.selection - 1);
        }
    }

    /**
     * @private
     * @param {import('@minecraft/server').Player} player
     */
    async showHowToPlay(player) {
        const page = howToPlayPage();
        const form = new ActionFormData().title(page.title).body(page.body).button('§l< Back§r');
        const response = await form.show(/** @type {any} */ (player));
        if (!response.canceled) await this.showIndex(player);
    }

    /**
     * @private
     * @param {import('@minecraft/server').Player} player
     * @param {number} index
     */
    async showSword(player, index) {
        const count = this.swords.length;
        const sword = this.swords[((index % count) + count) % count];
        const page = swordPage(sword);
        const form = new ActionFormData()
            .title(page.title)
            .body(page.body)
            .button('§lNext sword >§r')
            .button('§l< Previous sword§r')
            .button('§lAll swords§r');
        const response = await form.show(/** @type {any} */ (player));
        if (response.canceled) return;
        if (response.selection === 0) await this.showSword(player, index + 1);
        else if (response.selection === 1) await this.showSword(player, index - 1);
        else if (response.selection === 2) await this.showIndex(player);
    }
}
