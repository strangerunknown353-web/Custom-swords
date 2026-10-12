/**
 * Target categories — the vocabulary a sword uses to say what it may hit.
 *
 * A binding declares `allowedTargets: ['hostile']` and the combat system does
 * the rest. Categories are resolved in two stages:
 *
 *  1. **Engine-side pre-filter.** When exactly one category is requested, its
 *     `query` is handed to `Dimension.getEntities`, so the engine culls before
 *     anything reaches script. This is the cheap path and the common one.
 *  2. **Client-side union.** `families` is documented as matching *all* the
 *     listed families, so `['monster', 'player']` would match nothing. When
 *     several categories are requested the engine query is widened and the
 *     union is applied per entity instead.
 *
 * Family names below are the vanilla `minecraft:type_family` values, verified
 * against the entity reference: a Blaze is `["blaze", "monster", "mob"]`, an
 * Allay is `["allay", "mob"]`, an Armor Stand is `["armor_stand", "inanimate",
 * "mob"]`. Custom entities from other add-ons that follow the same convention
 * are categorised correctly for free; ones that do not fall into `any`.
 *
 * Engine-free, so the build tools validate the same catalogue the game uses.
 */

/**
 * @typedef {Object} TargetCategory
 * @property {string} id
 * @property {string} label Human-readable, for diagnostics and documentation.
 * @property {string[]} families Families an entity must have ALL of.
 * @property {string[]} excludeFamilies Families that disqualify an entity.
 * @property {string[]} typeIds When set, the entity's typeId must be one of these.
 */

/** @type {Readonly<Record<string, TargetCategory>>} */
export const TARGET_CATEGORIES = Object.freeze({
    /** Anything the safety rules already allow. The default. */
    any: Object.freeze({ id: 'any', label: 'Any entity', families: [], excludeFamilies: [], typeIds: [] }),

    /** Every living mob, hostile or not. Excludes armour stands and the like. */
    mob: Object.freeze({
        id: 'mob',
        label: 'Mobs',
        families: ['mob'],
        excludeFamilies: ['inanimate'],
        typeIds: [],
        // Other add-ons' creatures often lack the `mob` family. Anything with
        // health that is not a player or inanimate still counts.
        acceptLiving: true,
    }),

    /** Hostile mobs. The default for offensive abilities that specify anything. */
    hostile: Object.freeze({
        id: 'hostile',
        label: 'Hostile mobs',
        families: ['monster'],
        excludeFamilies: [],
        typeIds: [],
    }),

    /** Peaceful mobs: animals, villagers, ambient creatures. */
    passive: Object.freeze({
        id: 'passive',
        label: 'Passive mobs',
        families: ['mob'],
        excludeFamilies: ['monster', 'inanimate'],
        typeIds: [],
    }),

    /** Other players. Still subject to `config.combat.allowPlayerVersusPlayer`. */
    player: Object.freeze({
        id: 'player',
        label: 'Players',
        families: [],
        excludeFamilies: [],
        typeIds: ['minecraft:player'],
    }),

    undead: Object.freeze({ id: 'undead', label: 'Undead', families: ['undead'], excludeFamilies: [], typeIds: [] }),

    arthropod: Object.freeze({
        id: 'arthropod',
        label: 'Arthropods',
        families: ['arthropod'],
        excludeFamilies: [],
        typeIds: [],
    }),
});

/** Category ids, in the order documentation should list them. */
export const TARGET_CATEGORY_IDS = Object.freeze(Object.keys(TARGET_CATEGORIES));

/** What a binding gets when it does not restrict its targets. */
export const DEFAULT_CATEGORIES = Object.freeze(['any']);

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isTargetCategory(value) {
    return typeof value === 'string' && Object.hasOwn(TARGET_CATEGORIES, value);
}

/**
 * @param {string} id
 * @returns {TargetCategory | undefined}
 */
export function categoryOf(id) {
    return isTargetCategory(id) ? TARGET_CATEGORIES[id] : undefined;
}

/**
 * Builds the engine-side pre-filter for a set of categories.
 *
 * Returns family constraints only when they are provably safe to push down to
 * the engine — that is, when a single category is requested. With several, the
 * AND semantics of `families` would silently return nothing, so the query is
 * left wide and {@link matchesCategories} does the work instead.
 *
 * @param {readonly string[]} categories
 * @returns {{ families?: string[], excludeFamilies?: string[] }}
 */
export function queryFor(categories) {
    if (categories.length !== 1) return {};
    const category = categoryOf(categories[0]);
    if (category === undefined) return {};

    /** @type {{ families?: string[], excludeFamilies?: string[] }} */
    const query = {};
    // A category that also accepts unlabelled creatures cannot push its family
    // filter down to the engine, or those creatures would never be returned.
    if (category.families.length > 0 && category.acceptLiving !== true) query.families = [...category.families];
    if (category.excludeFamilies.length > 0) query.excludeFamilies = [...category.excludeFamilies];
    return query;
}

/**
 * True when an entity's type id and family list satisfy at least one category.
 *
 * Takes the families as a plain array rather than an entity so it stays pure
 * and unit-testable; the caller reads them from
 * `EntityTypeFamilyComponent.getTypeFamilies()`.
 *
 * @param {string} typeId
 * @param {readonly string[]} families
 * @param {readonly string[]} categories
 * @param {{ living?: () => boolean }} [traits] Lazily-read facts about the entity.
 * @returns {boolean}
 */
export function matchesCategories(typeId, families, categories, traits = {}) {
    if (categories.length === 0) return true;
    return categories.some((id) => matchesCategory(typeId, families, id, traits));
}

/**
 * @param {string} typeId
 * @param {readonly string[]} families
 * @param {string} categoryId
 * @param {{ living?: () => boolean }} [traits]
 * @returns {boolean}
 */
export function matchesCategory(typeId, families, categoryId, traits = {}) {
    const category = categoryOf(categoryId);
    if (category === undefined) return false;
    if (category.id === 'any') return true;

    if (
        category.acceptLiving === true &&
        typeId !== 'minecraft:player' &&
        !families.includes(category.families[0] ?? '') &&
        !category.excludeFamilies.some((family) => families.includes(family))
    ) {
        return traits.living?.() === true;
    }

    if (category.typeIds.length > 0 && !category.typeIds.includes(typeId)) return false;
    if (!category.families.every((family) => families.includes(family))) return false;
    if (category.excludeFamilies.some((family) => families.includes(family))) return false;
    return true;
}
