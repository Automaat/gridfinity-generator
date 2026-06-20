import { describe, expect, it } from 'vitest';
import type { Seam } from './baseplate-layout';
import { dovetailTabSpec, pinHoleSpec, pinRailSpec } from './baseplate-connectors';

describe('baseplate connector specs', () => {
	it('builds male dovetail tabs from the seam away from the tile body', () => {
		const seam: Seam = { axis: 'x', pos: 42, min: -21, max: 21, bodyDir: -1, male: true };

		expect(dovetailTabSpec(seam, 0, 5, false)).toEqual({
			points: [
				[40.5, -2.5],
				[40.5, 2.5],
				[46, 4],
				[46, -4]
			],
			z: 0,
			height: 5
		});
	});

	it('adds clearance and overshoot to female dovetail pockets', () => {
		const seam: Seam = { axis: 'x', pos: 42, min: -21, max: 21, bodyDir: 1, male: false };

		expect(dovetailTabSpec(seam, 10, 5, true)).toEqual({
			points: [
				[42, 7.35],
				[42, 12.65],
				[46.15, 14.15],
				[46.15, 5.85]
			],
			z: -0.1,
			height: 5.2
		});
	});

	it('orients dovetail points for horizontal seams', () => {
		const seam: Seam = { axis: 'y', pos: 84, min: 0, max: 84, bodyDir: -1, male: true };

		expect(dovetailTabSpec(seam, 21, 5, false).points).toEqual([
			[18.5, 82.5],
			[23.5, 82.5],
			[25, 88],
			[17, 88]
		]);
	});

	it('describes rail rectangles in assembled coordinates', () => {
		expect(pinRailSpec({ axis: 'x', pos: 42, min: -84, max: 0, bodyDir: -1, male: true }, 6)).toEqual({
			w: 6,
			l: 84,
			cx: 39,
			cy: -42
		});
		expect(pinRailSpec({ axis: 'y', pos: 42, min: -84, max: 0, bodyDir: 1, male: false }, 6)).toEqual({
			w: 84,
			l: 6,
			cx: -42,
			cy: 45
		});
	});

	it('describes pin-hole length and placement for each seam axis', () => {
		const xHole = pinHoleSpec({ axis: 'x', pos: 42, min: -84, max: 0, bodyDir: -1, male: true }, 7, 5, 1.6);
		expect(xHole.axis).toBe('x');
		expect(xHole.length).toBeCloseTo(5.4);
		expect(xHole.start).toBeCloseTo(36.8);
		expect(xHole.x).toBeCloseTo(36.8);
		expect(xHole.y).toBe(7);
		expect(xHole.z).toBe(1.6);

		const yHole = pinHoleSpec({ axis: 'y', pos: 42, min: -84, max: 0, bodyDir: 1, male: false }, 7, 5, 2);
		expect(yHole.axis).toBe('y');
		expect(yHole.length).toBeCloseTo(5.4);
		expect(yHole.start).toBeCloseTo(41.8);
		expect(yHole.x).toBe(7);
		expect(yHole.y).toBeCloseTo(41.8);
		expect(yHole.z).toBe(2);
	});
});
