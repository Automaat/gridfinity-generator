import { describe, it, expect } from 'vitest';
import { defaultSkadis, type SkadisParams } from '$lib/stores/params';
import { planSkadis, frontWallCutZ, sideWallCutZ, skadisAccessCutBoxes, SKADIS_PITCH } from './skadis-layout';

function makeSk(overrides: Partial<SkadisParams> = {}): SkadisParams {
	return { ...defaultSkadis, ...overrides };
}

describe('planSkadis', () => {
	it('spaces columns one pitch apart, centered on the width', () => {
		const l = planSkadis(makeSk({ width: 120 }));
		expect(l.cols).toBe(3);
		expect(l.spanX).toBe(2 * SKADIS_PITCH);
		const xs = [...new Set(l.hooks.map((h) => h.x))].toSorted((a, b) => a - b);
		expect(xs).toEqual([-SKADIS_PITCH, 0, SKADIS_PITCH]);
	});

	it('falls back to a single centered column when the box is too narrow for two', () => {
		const l = planSkadis(makeSk({ width: 30 }));
		expect(l.cols).toBe(1);
		expect(l.spanX).toBe(0);
		expect(l.hooks.map((h) => h.x)).toEqual([0]);
	});

	it('keeps every hook inside the box footprint', () => {
		const l = planSkadis(makeSk({ width: 200, height: 150, hookRows: 2 }));
		for (const h of l.hooks) {
			expect(Math.abs(h.x)).toBeLessThanOrEqual(l.spanX / 2);
			expect(Math.abs(h.x)).toBeLessThanOrEqual(200 / 2);
			expect(h.z).toBeGreaterThan(0);
			expect(h.z).toBeLessThan(150);
		}
	});

	it('stacks a second hook row exactly one pitch below the top row', () => {
		const l = planSkadis(makeSk({ height: 150, hookRows: 2 }));
		expect(l.rows).toBe(2);
		const zs = [...new Set(l.hooks.map((h) => h.z))].toSorted((a, b) => b - a);
		expect(zs).toHaveLength(2);
		expect(zs[0]! - zs[1]!).toBeCloseTo(SKADIS_PITCH, 6);
	});

	it('caps hook rows to what fits a short box', () => {
		const l = planSkadis(makeSk({ height: 40, hookRows: 2 }));
		expect(l.rows).toBe(1);
		expect(l.hooks.every((h) => h.z > 0)).toBe(true);
	});

	it('clamps an out-of-range row count to at least one row', () => {
		expect(planSkadis(makeSk({ hookRows: 0 })).rows).toBe(1);
		expect(planSkadis(makeSk({ hookRows: 5, height: 300 })).rows).toBe(2);
	});

	it('emits cols × rows hooks', () => {
		const l = planSkadis(makeSk({ width: 160, height: 200, hookRows: 2 }));
		expect(l.hooks).toHaveLength(l.cols * l.rows);
	});

	it('places mounts on the same grid regardless of mount type (hooks vs screws)', () => {
		const hooks = planSkadis(makeSk({ width: 160, height: 120, hookRows: 2, mountType: 'hook' }));
		const screws = planSkadis(makeSk({ width: 160, height: 120, hookRows: 2, mountType: 'screw' }));
		expect(screws.hooks).toEqual(hooks.hooks);
	});
});

describe('wall cut height', () => {
	it('floors at 5mm and caps at the box top', () => {
		expect(frontWallCutZ(makeSk({ frontWallHeight: 1 }))).toBe(5);
		expect(sideWallCutZ(makeSk({ sideWallHeight: 1 }))).toBe(5);
		// outerH = height + wall = 80 + 2; an over-tall value caps to outerH (no-op cut).
		expect(frontWallCutZ(makeSk({ height: 80, wallThickness: 2, frontWallHeight: 999 }))).toBe(82);
		expect(sideWallCutZ(makeSk({ height: 80, wallThickness: 2, sideWallHeight: 999 }))).toBe(82);
	});

	it('falls back to the floor for non-finite heights (no NaN/Infinity leak)', () => {
		for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
			expect(frontWallCutZ(makeSk({ frontWallHeight: bad }))).toBe(5);
			expect(sideWallCutZ(makeSk({ sideWallHeight: bad }))).toBe(5);
		}
	});
});

describe('skadisAccessCutBoxes', () => {
	it('returns no cuts for a closed box', () => {
		expect(skadisAccessCutBoxes(makeSk())).toEqual([]);
	});

	it('describes the front access cut', () => {
		expect(skadisAccessCutBoxes(makeSk({ openFront: true, frontWallHeight: 30 }))).toEqual([
			{
				name: 'front',
				width: 120,
				depth: 4,
				height: 82,
				x: 0,
				y: 53,
				z: 30
			}
		]);
	});

	it('describes side access cuts', () => {
		const cuts = skadisAccessCutBoxes(makeSk({ openSides: true, sideWallHeight: 25 }));

		expect(cuts).toEqual([
			{
				name: 'left',
				width: 4,
				depth: 50,
				height: 82,
				x: -61,
				y: 27,
				z: 25
			},
			{
				name: 'right',
				width: 4,
				depth: 50,
				height: 82,
				x: 61,
				y: 27,
				z: 25
			}
		]);
	});

	it('adds front corner cuts when front and sides are open', () => {
		const cuts = skadisAccessCutBoxes(
			makeSk({ openFront: true, frontWallHeight: 30, openSides: true, sideWallHeight: 25 })
		);

		expect(cuts.map((cut) => cut.name)).toEqual(['front', 'left', 'right', 'front-left-corner', 'front-right-corner']);
		expect(cuts.find((cut) => cut.name === 'front-left-corner')).toEqual({
			name: 'front-left-corner',
			width: 4,
			depth: 4,
			height: 82,
			x: -61,
			y: 53,
			z: 30
		});
		expect(cuts.find((cut) => cut.name === 'front-right-corner')?.z).toBe(30);
	});
});
