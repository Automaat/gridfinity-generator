import { describe, expect, it } from 'vitest';
import {
	CORNER_OFFSETS,
	HOLE_INSET,
	MAGNET_BOSS_RADIUS,
	SOCKET_DEPTH,
	THICKNESS_MAGNET,
	THICKNESS_SIMPLE,
	baseplateCellCorners,
	baseplateThickness
} from './baseplate-spec';

describe('baseplate spec', () => {
	it('derives shared baseplate dimensions', () => {
		expect(SOCKET_DEPTH).toBe(4.75);
		expect(THICKNESS_SIMPLE).toBe(6);
		expect(THICKNESS_MAGNET).toBeCloseTo(7.95, 6);
		expect(HOLE_INSET).toBe(13);
		expect(MAGNET_BOSS_RADIUS).toBe(5.25);
		expect(CORNER_OFFSETS).toEqual([
			[13, 13],
			[-13, 13],
			[13, -13],
			[-13, -13]
		]);
	});

	it('selects thickness by style', () => {
		expect(baseplateThickness('simple')).toBe(THICKNESS_SIMPLE);
		expect(baseplateThickness('magnet')).toBe(THICKNESS_MAGNET);
	});

	it('dedupes repeated magnet/screw corner sites', () => {
		expect(baseplateCellCorners([{ x: 0, y: 0 }])).toHaveLength(4);
		expect(baseplateCellCorners([{ x: 0, y: 0 }, { x: 0, y: 0 }])).toEqual([
			[13, 13],
			[-13, 13],
			[13, -13],
			[-13, -13]
		]);
	});
});
