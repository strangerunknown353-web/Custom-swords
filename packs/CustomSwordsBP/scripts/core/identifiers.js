/**
 * The project's identifier convention, in one place.
 *
 * Every namespaced string the addon creates — item ids, ability ids, the item
 * custom component, item tags, localisation keys and texture paths — is derived
 * here. Before this module the namespace, the component id and the identifier
 * regex were each written out in two or three files, which is exactly how a
 * rename silently half-lands.
 *
 * Engine-free: imported by the runtime, by `tools/generate.mjs` and by
 * `tools/validate.mjs`, so all three necessarily agree.
 *
 * ## Convention
 *
 *   <namespace>:<local_name>
 *
 * - namespace is always `custom_swords` for content this project owns;
 * - local_name is lower_snake_case, starts with a letter, and is unique within
 *   its kind (sword, ability);
 * - the namespace guarantees no collision with vanilla `minecraft:` ids or with
 *   any other add-on that follows the same rule.
 */

/** The one namespace this project owns. */
export const NAMESPACE = 'custom_swords';

/** `namespace:local_name`, lower-case ASCII, digits and underscores. */
export const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/;

/** A bare local name, used for texture shortnames and file stems. */
export const LOCAL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * The single item custom component every sword declares. One component for the
 * whole addon, no matter how many swords exist.
 */
export const SWORD_COMPONENT_ID = `${NAMESPACE}:sword`;

/** Item tag applied to every custom sword, for recipes and future filtering. */
export const SWORD_ITEM_TAG = `${NAMESPACE}:is_custom_sword`;

/** Resource-pack directory holding sword icons, relative to the pack root. */
export const SWORD_TEXTURE_DIR = `textures/items/${NAMESPACE}/swords`;

/**
 * @param {string} localName
 * @returns {string} A fully-qualified sword item identifier.
 */
export function swordId(localName) {
    return `${NAMESPACE}:${localName}`;
}

/**
 * @param {string} localName
 * @returns {string} A fully-qualified ability identifier.
 */
export function abilityId(localName) {
    return `${NAMESPACE}:${localName}`;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidIdentifier(value) {
    return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidLocalName(value) {
    return typeof value === 'string' && LOCAL_NAME_PATTERN.test(value);
}

/**
 * @param {string} identifier
 * @returns {string} The part before the colon, or `''` when unqualified.
 */
export function namespaceOf(identifier) {
    const index = identifier.indexOf(':');
    return index === -1 ? '' : identifier.slice(0, index);
}

/**
 * @param {string} identifier
 * @returns {string} The part after the colon, or the whole string when unqualified.
 */
export function localNameOf(identifier) {
    const index = identifier.indexOf(':');
    return index === -1 ? identifier : identifier.slice(index + 1);
}

/**
 * True when the identifier belongs to this project rather than to vanilla or
 * another add-on. Used by the item identification system to reject foreign ids
 * before any registry lookup.
 *
 * @param {unknown} identifier
 * @returns {boolean}
 */
export function isOwnedIdentifier(identifier) {
    return typeof identifier === 'string' && namespaceOf(identifier) === NAMESPACE;
}

/**
 * Creative-inventory placement for every sword.
 *
 * `group` **must carry the `minecraft:` namespace**. Minecraft's own older
 * tutorials show the bare `itemGroup.name.sword`, which is what this project
 * shipped in v0.5.0 and why the swords landed in the generic Items tab instead
 * of beside the vanilla swords: from 1.26.20 the description block is validated
 * strictly, and an unnamespaced group is not a valid group reference.
 *
 * Kept here rather than inline in `tools/generate.mjs` because it is exactly
 * the kind of magic string that gets fixed in one place and left wrong in
 * another.
 */
export const CREATIVE_CATEGORY = 'equipment';
export const CREATIVE_GROUP = 'minecraft:itemGroup.name.sword';

/**
 * Localisation key for a sword's display name.
 *
 * This is the key **Minecraft itself generates** for a namespaced custom item:
 * `item.<namespace>:<local_name>`, with **no `.name` suffix**. Vanilla items
 * use `item.<name>.name`, and following that pattern for a custom item — as
 * this project did through v0.5.0 — produces a key the engine never looks up,
 * so the raw identifier shows in the tooltip instead of the sword's name.
 *
 * @param {string} id
 * @returns {string}
 */
export function nameKey(id) {
    return `item.${id}`;
}

/**
 * The vanilla-style `item.<id>.name` key.
 *
 * Not what the engine looks up for a custom item, but emitted alongside the
 * real key so that a client which does follow the vanilla convention still
 * finds a name. Two lines of `.lang` per sword is a cheap hedge against a
 * convention that is version-dependent and poorly documented.
 *
 * @param {string} id
 * @returns {string}
 */
export function legacyNameKey(id) {
    return `item.${id}.name`;
}

/**
 * Localisation key for a sword's description. Not shown by the vanilla tooltip
 * (Bedrock has no item-JSON lore component); reserved for the codex UI planned
 * in a later milestone.
 *
 * @param {string} id
 * @returns {string}
 */
export function descriptionKey(id) {
    return `item.${id}.description`;
}

/**
 * Resource-pack path for a sword icon, without the `.png` extension — which is
 * the form `item_texture.json` expects.
 *
 * @param {string} shortname
 * @returns {string}
 */
export function swordTexturePath(shortname) {
    return `${SWORD_TEXTURE_DIR}/${shortname}`;
}
