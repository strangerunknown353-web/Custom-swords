/**
 * Installs the `@minecraft/server` resolve hook for the test run.
 * Loaded via `node --import ./tests/register-mocks.mjs`.
 */

import { register } from 'node:module';

register('./mock-hooks.mjs', import.meta.url);
