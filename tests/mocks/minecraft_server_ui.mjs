/**
 * Stand-in for `@minecraft/server-ui`. Tests queue the responses a player
 * would give with `queueFormResponse`, and read what was shown from `shownForms`.
 */

/** @type {{ title: string, body: string, buttons: { text: string, icon?: string }[] }[]} */
export const shownForms = [];
/** @type {{ canceled: boolean, selection?: number }[]} */
const responses = [];

/** @param {{ canceled?: boolean, selection?: number }} response */
export function queueFormResponse(response) {
    responses.push({ canceled: response.canceled ?? false, selection: response.selection });
}

export function resetForms() {
    shownForms.length = 0;
    responses.length = 0;
}

export class ActionFormData {
    constructor() {
        this.data = { title: '', body: '', buttons: [] };
    }
    /** @param {string} text */
    title(text) {
        this.data.title = text;
        return this;
    }
    /** @param {string} text */
    body(text) {
        this.data.body = text;
        return this;
    }
    /** @param {string} text @param {string} [icon] */
    button(text, icon) {
        this.data.buttons.push({ text, icon });
        return this;
    }
    async show() {
        shownForms.push(this.data);
        return responses.shift() ?? { canceled: true };
    }
}
