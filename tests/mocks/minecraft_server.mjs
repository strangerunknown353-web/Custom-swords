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
        /** Options passed to the most recent subscribe, so tests can assert filters. */
        this.options = undefined;
    }
    /** @param {Function} handler @param {any} [options] */
    subscribe(handler, options) {
        this.handlers.push(handler);
        this.options = options;
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
        /** @type {Map<string, string>} Block overrides, keyed "x,y,z". */
        this.blocks = new Map();
        /** @type {Set<string>} Coordinates that throw, as an unloaded chunk does. */
        this.unreadable = new Set();
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

    /**
     * Block lookup for the movement system.
     *
     * The default world is open air above y=64 and solid stone below it, which
     * gives dashes somewhere to land. Tests override individual blocks with
     * `setBlock(x, y, z, kind)` where kind is 'air' | 'stone' | 'water' |
     * 'lava', or set `unloadedBelowY` to model a chunk edge.
     *
     * @param {any} location
     */
    getBlock(location) {
        const key = `${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
        if (this.unreadable.has(key)) {
            throw new Error('LocationInUnloadedChunkError');
        }
        const kind = this.blocks.get(key) ?? (Math.floor(location.y) < 64 ? 'stone' : 'air');
        return {
            typeId: kind === 'air' ? 'minecraft:air' : `minecraft:${kind}`,
            isAir: kind === 'air',
            isLiquid: kind === 'water' || kind === 'lava',
        };
    }

    /** @param {number} x @param {number} y @param {number} z @param {string} kind */
    setBlock(x, y, z, kind) {
        this.blocks.set(`${x},${y},${z}`, kind);
        return this;
    }

    /** Marks a block coordinate as raising, the way an unloaded chunk does. */
    setUnreadable(x, y, z) {
        this.unreadable.add(`${x},${y},${z}`);
        return this;
    }

    /** @param {any} location @param {any} direction @param {any} options */
    getEntitiesFromRay(location, direction, options = {}) {
        return this.getEntities({ ...options, location, maxDistance: options.maxDistance }).map((entity) => ({
            entity,
            distance: 0,
        }));
    }

    /**
     * Block raycast. The mock world is empty air, so this reports no hit and
     * callers fall back to their maximum reach — which is the common outdoor
     * case in a real world too.
     *
     * @param {any} location @param {any} direction @param {any} options
     */
    getBlockFromRay(location, direction, options) {
        return undefined;
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

/** Type families the real game assigns, keyed by entity type id. */
const DEFAULT_FAMILIES = Object.freeze({
    'minecraft:zombie': ['zombie', 'undead', 'monster', 'mob'],
    'minecraft:skeleton': ['skeleton', 'undead', 'monster', 'mob'],
    'minecraft:creeper': ['creeper', 'monster', 'mob'],
    'minecraft:spider': ['spider', 'arthropod', 'monster', 'mob'],
    'minecraft:pig': ['pig', 'mob'],
    'minecraft:cow': ['cow', 'mob'],
    'minecraft:villager_v2': ['villager', 'mob'],
    'minecraft:armor_stand': ['armor_stand', 'inanimate', 'mob'],
    'minecraft:player': ['player'],
});

export class MockEntity {
    /**
     * @param {object} options
     * @param {string} options.id
     * @param {string} [options.typeId]
     * @param {{x: number, y: number, z: number}} [options.location]
     * @param {MockDimension} [options.dimension]
     */
    constructor({ id, typeId = 'minecraft:zombie', location = { x: 0, y: 0, z: 0 }, dimension, families }) {
        this.id = id;
        this.typeId = typeId;
        /**
         * Vanilla `minecraft:type_family` values. Defaulted from the type id so
         * tests get realistic categorisation without restating it every time;
         * a Blaze really is `["blaze", "monster", "mob"]` in the game data.
         */
        this.families = families ?? DEFAULT_FAMILIES[typeId] ?? ['mob'];
        this.location = location;
        this.dimension = dimension ?? new MockDimension();
        this.isValid = true;
        this.isSneaking = false;
        this.isOnGround = true;
        this.isInWater = false;
        /** @type {{ x: number, y: number, z: number }[]} */
        this.impulses = [];
        /** @type {{ seconds: number }[]} */
        this.ignitions = [];
        /** @type {{ location: any, options: any }[]} */
        this.teleports = [];
        /** @type {Record<string, any>} */
        this.components = {};
        this.setHealth(20, 20);
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

    /**
     * Installs a health component with the given current/max values.
     *
     * @param {number} current
     * @param {number} max
     */
    setHealth(current, max = 20) {
        const owner = this;
        this.components['minecraft:health'] = {
            get currentValue() {
                return owner._health;
            },
            effectiveMax: max,
            /** @param {number} value */
            setCurrentValue(value) {
                owner._health = value;
                return true;
            },
        };
        this._health = current;
    }

    /** @param {number} seconds @param {boolean} [useEffects] */
    setOnFire(seconds, useEffects = true) {
        if (!this.isValid) throw new Error('Entity is not valid.');
        this.ignitions.push({ seconds, useEffects });
        return true;
    }

    extinguishFire() {
        this.ignitions.length = 0;
        return true;
    }

    /** @param {any} location @param {any} options */
    teleport(location, options) {
        if (!this.isValid) throw new Error('Entity is not valid.');
        this.teleports.push({ location: { ...location }, options });
        this.location = { ...location };
    }

    /** @param {any} vector */
    applyImpulse(vector) {
        if (!this.isValid) throw new Error('Entity is not valid.');
        this.impulses.push({ ...vector });
    }

    /** @param {string} effect @param {number} duration @param {any} options */
    addEffect(effect, duration, options) {
        if (!this.isValid) throw new Error('Entity is not valid.');
        this.effects.push({ effect, duration, options });
        return { typeId: effect };
    }

    /**
     * Mirrors the real `getEffect`: returns the most recently applied matching
     * effect, or `undefined`. Effects here never expire — nothing in the
     * framework advances a mock effect clock — so a test that needs an effect
     * to lapse must remove it explicitly.
     *
     * @param {string} effectId
     */
    getEffect(effectId) {
        if (!this.isValid) throw new Error('Entity is not valid.');
        const match = [...this.effects].reverse().find((e) => e.effect === effectId);
        if (match === undefined) return undefined;
        return { typeId: match.effect, duration: match.duration, amplifier: match.options?.amplifier ?? 0 };
    }

    getEffects() {
        if (!this.isValid) throw new Error('Entity is not valid.');
        return this.effects.map((e) => ({ typeId: e.effect, duration: e.duration, amplifier: e.options?.amplifier ?? 0 }));
    }

    /**
     * Mirrors `Entity.tryTeleport`: returns false rather than throwing when the
     * destination is occupied. The mock treats a non-air feet or head block as
     * an intersection, which is the case the real collision test catches.
     *
     * @param {any} location @param {any} options
     */
    tryTeleport(location, options = {}) {
        if (!this.isValid) throw new Error('Entity is not valid.');
        if (options.checkForBlocks !== false && this.dimension?.getBlock !== undefined) {
            try {
                const feet = this.dimension.getBlock(location);
                const head = this.dimension.getBlock({ ...location, y: location.y + 1 });
                if (!feet?.isAir && !feet?.isLiquid) return false;
                if (!head?.isAir && !head?.isLiquid) return false;
            } catch {
                return false;
            }
        }
        this.teleports.push({ location, options });
        this.location = { ...location };
        return true;
    }

    getHeadLocation() {
        return { x: this.location.x, y: this.location.y + 1.62, z: this.location.z };
    }

    /**
     * Only the components the framework actually asks for are modelled.
     *
     * @param {string} componentId
     * @returns {any}
     */
    getComponent(componentId) {
        if (!this.isValid) throw new Error('Entity is not valid.');
        if (componentId === 'minecraft:type_family') {
            return {
                getTypeFamilies: () => [...this.families],
                hasTypeFamily: (family) => this.families.includes(family),
            };
        }
        return this.components[componentId];
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
        /** @type {string[]} */
        this.chatMessages = [];
        /** @type {Record<string, MockItemStack | undefined>} */
        this.equipment = {};
        this.components['minecraft:equippable'] = {
            /** @param {string} slot */
            getEquipment: (slot) => this.equipment[slot],
            /** @param {string} slot @param {MockItemStack | undefined} item */
            setEquipment: (slot, item) => {
                this.equipment[slot] = item;
                return true;
            },
        };
    }

    /**
     * Convenience for tests: put an item in the main hand.
     *
     * @param {MockItemStack | undefined} itemStack
     */
    setMainhand(itemStack) {
        this.equipment[EquipmentSlot.Mainhand] = itemStack;
    }

    /** @param {string} message */
    sendMessage(message) {
        this.chatMessages.push(message);
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

    /**
     * The real engine documents `applyImpulse` as throwing when called on a
     * Player, so the mock does too — that is exactly the behaviour
     * `EffectService.impulse` has to route around.
     */
    applyImpulse() {
        throw new Error('applyImpulse is not supported for Players.');
    }
}

/**
 * Stand-in for `ItemStack`. Only `typeId` and `hasTag` are modelled, which is
 * the entire surface the identification system touches.
 */
export class MockItemStack {
    /**
     * @param {string} typeId
     * @param {string[]} [tags]
     */
    constructor(typeId, tags = []) {
        this.typeId = typeId;
        /** @private */
        this.tags = new Set(tags);
    }

    /** @param {string} tag */
    hasTag(tag) {
        return this.tags.has(tag);
    }
}

/** An ItemStack handle that has already been invalidated by the engine. */
export class InvalidMockItemStack {
    get typeId() {
        throw new Error('ItemStack handle is no longer valid.');
    }
    hasTag() {
        throw new Error('ItemStack handle is no longer valid.');
    }
}

/** Controllable stand-in for the `system` global. */
export const system = {
    currentTick: 0,
    beforeEvents: { startup: new Signal(), shutdown: new Signal() },
    afterEvents: { scriptEventReceive: new Signal() },
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
        entityDie: new Signal(),
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
    system.afterEvents.scriptEventReceive = new Signal();
    world.afterEvents.playerLeave = new Signal();
    world.afterEvents.playerSpawn = new Signal();
    world.afterEvents.entityDie = new Signal();
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
