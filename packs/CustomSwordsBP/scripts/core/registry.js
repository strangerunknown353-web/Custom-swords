/**
 * A tiny, strict, generic registry.
 *
 * Both the ability registry and the sword registry are built on this so that
 * lookup semantics, duplicate handling and sealing behave identically. It is a
 * plain `Map` wrapper: O(1) lookup, no scanning, no global mutable state beyond
 * the instance the bootstrap creates.
 *
 * @template T
 */
export class Registry {
    /** @param {string} label Used in error messages, e.g. `ability`. */
    constructor(label) {
        /** @private @readonly */
        this.label = label;
        /** @private @type {Map<string, T>} */
        this.entries = new Map();
        /** @private */
        this.sealed = false;
    }

    /**
     * @param {string} id
     * @param {T} value
     * @throws {Error} If the registry is sealed or the id is already taken.
     */
    register(id, value) {
        if (this.sealed) {
            throw new Error(`Cannot register ${this.label} '${id}': registry is sealed.`);
        }
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error(`Cannot register ${this.label}: id must be a non-empty string.`);
        }
        if (this.entries.has(id)) {
            throw new Error(`Duplicate ${this.label} id '${id}'.`);
        }
        this.entries.set(id, value);
    }

    /**
     * @param {string} id
     * @returns {T | undefined}
     */
    get(id) {
        return this.entries.get(id);
    }

    /**
     * @param {string} id
     * @returns {T}
     * @throws {Error} When the id is not registered.
     */
    require(id) {
        const value = this.entries.get(id);
        if (value === undefined) {
            throw new Error(`Unknown ${this.label} '${id}'. Registered: ${this.ids().join(', ') || '(none)'}`);
        }
        return value;
    }

    /**
     * @param {string} id
     * @returns {boolean}
     */
    has(id) {
        return this.entries.has(id);
    }

    /** @returns {string[]} */
    ids() {
        return [...this.entries.keys()];
    }

    /** @returns {T[]} */
    values() {
        return [...this.entries.values()];
    }

    /** @returns {number} */
    get size() {
        return this.entries.size;
    }

    /**
     * Freezes the registry. Called once bootstrap finishes so that a late
     * `register` becomes a loud error instead of a silent race.
     */
    seal() {
        this.sealed = true;
    }

    /** @returns {boolean} */
    get isSealed() {
        return this.sealed;
    }
}
