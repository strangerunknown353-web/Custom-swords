import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as Vec3 from '../../packs/CustomSwordsBP/scripts/util/vec3.js';
import { clamp, chance, randomInt } from '../../packs/CustomSwordsBP/scripts/util/mathx.js';
import { formatTicks, secondsToTicks, ticksToSeconds } from '../../packs/CustomSwordsBP/scripts/util/ticks.js';

describe('vec3', () => {
    it('adds, subtracts and scales without mutating inputs', () => {
        const a = { x: 1, y: 2, z: 3 };
        const b = { x: 4, y: 5, z: 6 };
        assert.deepEqual(Vec3.add(a, b), { x: 5, y: 7, z: 9 });
        assert.deepEqual(Vec3.subtract(b, a), { x: 3, y: 3, z: 3 });
        assert.deepEqual(Vec3.scale(a, 2), { x: 2, y: 4, z: 6 });
        assert.deepEqual(a, { x: 1, y: 2, z: 3 }, 'input must be untouched');
    });

    it('normalises to unit length', () => {
        const unit = Vec3.normalize({ x: 0, y: 0, z: 5 });
        assert.deepEqual(unit, { x: 0, y: 0, z: 1 });
        assert.equal(Math.abs(Vec3.length(Vec3.normalize({ x: 3, y: 4, z: 12 })) - 1) < 1e-12, true);
    });

    it('returns zero rather than NaN for a zero-length vector', () => {
        // NaN coordinates handed back to the engine throw, so this matters.
        assert.deepEqual(Vec3.normalize({ x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 0 });
        assert.deepEqual(Vec3.horizontalForce({ x: 0, y: 5, z: 0 }, 2), { x: 0, z: 0 });
    });

    it('builds a horizontal knockback vector whose magnitude is the force', () => {
        const force = Vec3.horizontalForce({ x: 3, y: 99, z: 4 }, 2);
        assert.equal(Math.abs(Math.hypot(force.x, force.z) - 2) < 1e-12, true);
        assert.equal('y' in force, false, 'applyKnockback takes a VectorXZ, not a Vector3');
    });

    it('measures distance and detects non-finite values', () => {
        assert.equal(Vec3.distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5);
        assert.equal(Vec3.isFinite3({ x: 1, y: 2, z: 3 }), true);
        assert.equal(Vec3.isFinite3({ x: Number.NaN, y: 0, z: 0 }), false);
    });

    it('projects a point along a direction', () => {
        assert.deepEqual(Vec3.project({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }, 5), { x: 0, y: 0, z: 5 });
    });
});

describe('mathx', () => {
    it('clamps at both bounds', () => {
        assert.equal(clamp(5, 0, 10), 5);
        assert.equal(clamp(-1, 0, 10), 0);
        assert.equal(clamp(99, 0, 10), 10);
    });

    it('accepts an injected RNG for determinism', () => {
        assert.equal(randomInt(1, 10, () => 0), 1);
        assert.equal(randomInt(1, 10, () => 0.999999), 10);
        assert.equal(chance(0.5, () => 0.4), true);
        assert.equal(chance(0.5, () => 0.6), false);
    });
});

describe('ticks', () => {
    it('converts between seconds and ticks', () => {
        assert.equal(secondsToTicks(3), 60);
        assert.equal(ticksToSeconds(60), 3);
        assert.equal(secondsToTicks(-5), 0, 'negative durations collapse to zero');
    });

    it('formats durations for the action bar', () => {
        assert.equal(formatTicks(60), '3s');
        assert.equal(formatTicks(50), '2.5s');
        assert.equal(formatTicks(0), '0s');
        assert.equal(formatTicks(-20), '0s');
    });
});
