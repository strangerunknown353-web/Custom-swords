/**
 * A hand-written stand-in for `@minecraft/server`.
 *
 * The Bedrock script runtime is not available in Node, so the framework can
 * only be unit tested if the engine module can be substituted. This mock
 * implements exactly the surface the framework touches — nothing more — and
 * records calls so tests can assert on behaviour rather than on internals.
 *
 * The shapes here are copied from the `@minecraft/server` 2.0.0 type
 * definitions; if the real API changes, this file must change with it. See
 * docs/API_NOTES.md for the version contract.
 */

/** Mirrors the real enum; only the members the framework uses are required. */
export const EntityDamageCause = Object.freeze({
    entityAttack: 'entityAttack',
    fire: 'fire',
    lightning: 'lightning',
    magic: 'magic',
    none: 'none',
    override: 'override',
    projectile: 'projectile',
});

export const EquipmentSlot = Object.freeze({
    Head: 'Head',
    Chest: 'Chest',
    Legs: 'Legs',
    Feet: 'Feet',
    Mainhand: 'Mainhand',
    Offhand: 'Offhand',
});

export class MolangVariableMap {
    constructor() {
        /** @type {Record<string, unknown>} */
        this.values = {};
    }
    /** @param {string} name @param {unknown} color */
    setColorRGBA(name, color) {
        this.values[name] = color;
    }
    /** @param {string} name @param {unknown} color */
    setColorRGB(name, color) {
        this.values[name] = color;
    }
    /** @param {string} name @param {number} value */
    setFloat(name, value) {
        this.values[name] = value;
    }
}

/** A minimal event signal that records its subscribers. */
class Signal {
    constructor() {
        /** @type {Function[]} */
        this.handlers = [];
    }
    /** @param {Function} handler */
    subscribe(handler) {
        this.handlers.push(handler);
        return handler;
    }
    /** @param {Function} handler */
    unsubscribe(handler) {
        this.handlers = this.handlers.filter((h) => h !== handler);
    }
    /** @param {any} event */
    emit(event) {
        for (const handler of [...this.handlers]) handler(event);
    }
}

export class MockDimension {
    /** @param {string} id */
    constructor(id = 'minecraft:overworld') {
        this.id = id;
        /** @type {MockEntity[]} */
        this.entities = [];
        /** @type {{ id: string, location: any, molang: any }[]} */
        this.particles = [];
        /** @type {{ id: string, location: any, options: any }[]} */
        this.sounds = [];
    }

    /** @param {any} options */
    getEntities(options = {}) {
        return this.entities.filter((entity) => {
            if (options.excludeTypes?.includes(entity.typeId)) return false;
            if (options.location !== undefined && options.maxDistance !== undefined) {
                const dx = entity.location.x - options.location.x;
                const dy = entity.location.y - options.location.y;
                const dz = entity.location.z - options.location.z;
                if (Math.sqrt(dx * dx + dy * dy + dz * dz) > options.maxDistance) return false;
            }
            return true;
        });
    }

    /** @param {any} location @param {any} direction @param {any} options */
    getEntitiesFromRay(location, direction, options = {}) {
        return this.getEntities({ ...options, location, maxDistance: options.maxDistance }).map((entity) => ({
            entity,
            distance: 0,
        }));
    }

    /** @param {string} id @param {any} location @param {any} molang */
    spawnParticle(id, location, molang) {
        this.particles.push({ id, location: { ...location }, molang });
    }

    /** @param {string} id @param {any} location @param {any} options */
    playSound(id, location, options) {
        this.sounds.push({ id, location: { ...location }, options });
    }
}

export class MockEntity {
    /**
     * @param {object} options
     * @param {string} options.id
     * @param {string} [options.typeId]
     * @param {{x: number, y: number, z: number}} [options.location]
     * @param {MockDimension} [options.dimension]
     */
    constructor({ id, typeId = 'minecraft:zombie', location = { x: 0, y: 0, z: 0 }, dimension }) {
        this.id = id;
        this.typeId = typeId;
        this.location = location;
        this.dimension = dimension ?? new MockDimension();
        this.isValid = true;
        /** @type {{ amount: number, options: any }[]} */
        this.damageTaken = [];
        /** @type {{ horizontal: any, vertical: number }[]} */
        this.knockbacks = [];
        /** @type {{ effect: string, duration: number, options: any }[]} */
        this.effects = [];
    }

    /** @param {number} amount @param {any} options */
    applyDamage(amount, options) {
        if (!this.isValid) throw new Error('Entity is not valid.');
        this.damageTaken.push({ amount, options });
        return true;
    }

    /** @param {any} horizontal @param {number} vertical */
    applyKnockback(horizontal, vertical) {
        if (!this.isValid) throw new Error('Entity is not valid.');
        this.knockbacks.push({ horizontal, vertical });
    }

    /** @param {string} effect @param {number} duration @param {any} options */
    addEffect(effect, duration, options) {
        if (!this.isValid) throw new Error('Entity is not valid.');
        this.effects.push({ effect, duration, options });
        return { typeId: effect };
    }

    getHeadLocation() {
        return { x: this.location.x, y: this.location.y + 1.62, z: this.location.z };
    }

    getViewDirection() {
        return { x: 0, y: 0, z: 1 };
    }
}

export class MockPlayer extends MockEntity {
    /** @param {object} options */
    constructor(options) {
        super({ typeId: 'minecraft:player', ...options });
        /** @type {string[]} */
        this.actionBarMessages = [];
        /** @type {{ id: string, options: any }[]} */
        this.soundsHeard = [];
        /** @type {{ category: string, ticks: number }[]} */
        this.itemCooldowns = [];
        this.onScreenDisplay = {
            /** @param {string} text */
            setActionBar: (text) => {
                this.actionBarMessages.push(text);
            },
        };
    }

    /** @param {string} id @param {any} options */
    playSound(id, options) {
        this.soundsHeard.push({ id, options });
    }

    /** @param {string} category @param {number} ticks */
    startItemCooldown(category, ticks) {
        this.itemCooldowns.push({ category, ticks });
    }

    /** @param {string} category */
    getItemCooldown(category) {
        return this.itemCooldowns.filter((c) => c.category === category).at(-1)?.ticks ?? 0;
    }
}

/** Controllable stand-in for the `system` global. */
export const system = {
    currentTick: 0,
    beforeEvents: { startup: new Signal(), shutdown: new Signal() },
    afterEvents: {},
    /** @type {{ callback: Function, interval: number, id: number }[]} */
    intervals: [],
    _nextRunId: 1,
    /** @param {Function} callback */
    run(callback) {
        callback();
        return this._nextRunId++;
    },
    /** @param {Function} callback @param {number} [interval] */
    runInterval(callback, interval = 1) {
        const id = this._nextRunId++;
        this.intervals.push({ callback, interval, id });
        return id;
    },
    /** @param {Function} callback @param {number} [delay] */
    runTimeout(callback, delay = 0) {
        return this._nextRunId++;
    },
    /** @param {number} id */
    clearRun(id) {
        this.intervals = this.intervals.filter((entry) => entry.id !== id);
    },
};

/** Controllable stand-in for the `world` global. */
export const world = {
    afterEvents: {
        playerLeave: new Signal(),
        playerSpawn: new Signal(),
        worldLoad: new Signal(),
        entityHitEntity: new Signal(),
    },
    beforeEvents: {},
    /** @type {MockPlayer[]} */
    players: [],
    getAllPlayers() {
        return this.players;
    },
    /** @param {any} message */
    sendMessage(message) {
        this.messages.push(message);
    },
    /** @type {any[]} */
    messages: [],
};

/** Resets every mutable global between tests. */
export function resetMocks() {
    system.currentTick = 0;
    system.intervals = [];
    system._nextRunId = 1;
    system.beforeEvents.startup = new Signal();
    world.afterEvents.playerLeave = new Signal();
    world.afterEvents.worldLoad = new Signal();
    world.players = [];
    world.messages = [];
}

/** Registry stand-in passed to `InputRouter.register`. */
export class MockItemComponentRegistry {
    constructor() {
        /** @type {Map<string, any>} */
        this.components = new Map();
    }
    /** @param {string} name @param {any} component */
    registerCustomComponent(name, component) {
        if (this.components.has(name)) throw new Error(`Component '${name}' already registered.`);
        this.components.set(name, component);
    }
}
