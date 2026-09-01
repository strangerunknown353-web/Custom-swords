import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    ACTIVATION_LABELS,
    ACTIVATION_METHODS,
    activationFor,
    isActivationMethod,
    resolutionOrder,
} from '../../packs/CustomSwordsBP/scripts/core/activation.js';

describe('activation methods', () => {
    it('covers the four player-driven inputs', () => {
        assert.deepEqual(ACTIVATION_METHODS, ['use', 'sneak_use', 'attack', 'sneak_attack']);
        for (const method of ACTIVATION_METHODS) {
            assert.ok(ACTIVATION_LABELS[method]?.length > 0, `${method} needs a label`);
        }
    });

    it('recognises and rejects method names', () => {
        assert.equal(isActivationMethod('sneak_attack'), true);
        assert.equal(isActivationMethod('telepathy'), false);
        assert.equal(isActivationMethod(undefined), false);
        assert.equal(isActivationMethod('toString'), false);
    });

    it('maps an engine hook plus sneak state to a method', () => {
        assert.equal(activationFor('use', false), 'use');
        assert.equal(activationFor('use', true), 'sneak_use');
        assert.equal(activationFor('attack', false), 'attack');
        assert.equal(activationFor('attack', true), 'sneak_attack');
    });

    it('falls a sneaking method back to its base, and never the other way', () => {
        assert.deepEqual(resolutionOrder('sneak_use'), ['sneak_use', 'use']);
        assert.deepEqual(resolutionOrder('sneak_attack'), ['sneak_attack', 'attack']);
        // A standing player must never trigger a sneak-only ability.
        assert.deepEqual(resolutionOrder('use'), ['use']);
        assert.deepEqual(resolutionOrder('attack'), ['attack']);
    });
});
