import { describe, expect, it } from 'vitest';
import {
	BASE_PROFILE_HEIGHT,
	BASE_PROFILE_LEVELS,
	CORNER_FILLET_RADIUS,
	FLOOR_THICKNESS,
	HOLE_OFFSET,
	HOLE_OFFSETS,
	REDUCED_LIP_PROTRUSION,
	STACKING_LIP_PROTRUSION,
	WALL_BOTTOM,
	bodySize,
	cellCenter,
	gridOffset,
	gridHoleSites,
	innerFillet,
	isOuterGridCorner,
	lipProfileHeight,
	lipProtrusion,
	profileSections,
	reducedLipCavityLevels,
	standardLipCavityLevels
} from './gridfinity-spec';

describe('gridfinity spec', () => {
	it('keeps derived Gridfinity dimensions centralized', () => {
		expect(bodySize(1)).toBe(41.5);
		expect(bodySize(2)).toBe(83.5);
		expect(gridOffset(3)).toBe(42);
		expect(cellCenter(0, 3)).toBe(-42);
		expect(cellCenter(2, 3)).toBe(42);
		expect(WALL_BOTTOM).toBe(BASE_PROFILE_HEIGHT + FLOOR_THICKNESS);
	});

	it('exposes the canonical base profile levels', () => {
		expect(BASE_PROFILE_LEVELS).toEqual([
			{ z: 0, size: 35.6, r: 0.8 },
			{ z: 0.8, size: 37.2, r: 1.6 },
			{ z: 2.6, size: 37.2, r: 1.6 },
			{ z: 4.75, size: 41.5, r: 3.75 }
		]);
	});

	it('names the three build sections in a four-level profile', () => {
		const sections = profileSections(BASE_PROFILE_LEVELS);

		expect(sections.lowerChamfer).toEqual([BASE_PROFILE_LEVELS[0], BASE_PROFILE_LEVELS[1]]);
		expect(sections.vertical).toEqual([BASE_PROFILE_LEVELS[1], BASE_PROFILE_LEVELS[2]]);
		expect(sections.upperChamfer).toEqual([BASE_PROFILE_LEVELS[2], BASE_PROFILE_LEVELS[3]]);
	});

	it('derives lip profile and protrusion by lip mode', () => {
		expect(lipProfileHeight('standard')).toBe(BASE_PROFILE_HEIGHT);
		expect(lipProfileHeight('reduced')).toBe(REDUCED_LIP_PROTRUSION);
		expect(lipProfileHeight('none')).toBe(0);
		expect(lipProtrusion('standard')).toBe(STACKING_LIP_PROTRUSION);
		expect(lipProtrusion('reduced')).toBe(REDUCED_LIP_PROTRUSION);
		expect(lipProtrusion('none')).toBe(0);
	});

	it('builds lip cavity profiles from the same offsets as the geometry paths', () => {
		const standard = standardLipCavityLevels(83.5, 41.5, 21);
		expect(standard).toHaveLength(4);
		expect(standard[0]!.z).toBe(21);
		expect(standard[0]!.w).toBeCloseTo(77.6, 6);
		expect(standard[0]!.l).toBeCloseTo(35.6, 6);
		expect(standard[3]!.z).toBeCloseTo(25.75, 6);
		expect(standard[3]!.w).toBe(83.5);
		expect(standard[3]!.l).toBe(41.5);
		expect(standard[3]!.r).toBe(CORNER_FILLET_RADIUS);

		const reduced = reducedLipCavityLevels(83.5, 41.5, 21, REDUCED_LIP_PROTRUSION);
		expect(reduced[0].z).toBe(21);
		expect(reduced[0].w).toBeCloseTo(81.9, 6);
		expect(reduced[0].l).toBeCloseTo(39.9, 6);
		expect(reduced[1].z).toBeCloseTo(23.15, 6);
		expect(reduced[1].w).toBe(83.5);
		expect(reduced[1].l).toBe(41.5);
	});

	it('centralizes hole offsets and corner filtering', () => {
		expect(HOLE_OFFSET).toBe(12.75);
		expect(HOLE_OFFSETS).toEqual([
			[12.75, 12.75],
			[-12.75, 12.75],
			[12.75, -12.75],
			[-12.75, -12.75]
		]);
		expect(isOuterGridCorner(2, 2, 0, 0, -HOLE_OFFSET, -HOLE_OFFSET)).toBe(true);
		expect(isOuterGridCorner(2, 2, 0, 0, HOLE_OFFSET, HOLE_OFFSET)).toBe(false);

		const sites = gridHoleSites(2, 2);
		expect(sites).toHaveLength(16);
		expect(sites.filter((site) => site.outerCorner).map(({ x, y }) => [x, y])).toEqual([
			[-33.75, -33.75],
			[-33.75, 33.75],
			[33.75, -33.75],
			[33.75, 33.75]
		]);
	});

	it('keeps inner fillets printable', () => {
		expect(innerFillet(1.2)).toBeCloseTo(2.55, 6);
		expect(innerFillet(10)).toBe(0.2);
	});
});
