import { describe, expect, it } from 'vitest';
import { ensureCounterClockwise, signedArea } from './polygon';

describe('polygon helpers', () => {
	it('computes signed area from winding direction', () => {
		expect(signedArea([[0, 0], [2, 0], [0, 2]])).toBe(2);
		expect(signedArea([[0, 0], [0, 2], [2, 0]])).toBe(-2);
	});

	it('normalizes clockwise polygons to counter-clockwise', () => {
		const clockwise: readonly [number, number][] = [[0, 0], [0, 2], [2, 0]];
		const normalized = ensureCounterClockwise(clockwise);

		expect(normalized).toEqual([[2, 0], [0, 2], [0, 0]]);
		expect(signedArea(normalized)).toBe(2);
	});

	it('returns a copy when polygons are already counter-clockwise', () => {
		const ccw: readonly [number, number][] = [[0, 0], [2, 0], [0, 2]];
		const normalized = ensureCounterClockwise(ccw);

		expect(normalized).toEqual(ccw);
		expect(normalized).not.toBe(ccw);
	});
});
