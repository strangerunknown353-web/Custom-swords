/**
 * ESM resolve hook that redirects `@minecraft/server` to the local mock.
 *
 * Registered by `tests/register-mocks.mjs`, which `npm test` loads with
 * `node --import`. This is what allows the framework's real modules — the ones
 * that ship inside the .mcaddon — to be exercised in plain Node instead of
 * testing a parallel copy.
 */

/** Resolved from `import.meta.url` so no Node version newer than 20 is needed. */
const MOCK_URL = new URL('./mocks/minecraft_server.mjs', import.meta.url).href;

/**
 * @param {string} specifier
 * @param {object} context
 * @param {Function} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {
    if (specifier === '@minecraft/server') {
        return { url: MOCK_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}
