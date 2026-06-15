import { describe, it, expect } from 'vitest';
import { defaultParams, type BinParams } from '$lib/stores/params';
import {
	resolveFractions,
	dividerCoords,
	compartmentEdges,
	redistributeGaps,
	interiorBox
} from './divider-layout';

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

describe('resolveFractions', () => {
	it('returns empty for zero count', () => {
		expect(resolveFractions(0)).toEqual([]);
		expect(resolveFractions(0, [0.5])).toEqual([]);
	});

	it('spaces evenly when no fractions given', () => {
		expect(resolveFractions(1)).toEqual([0.5]);
		expect(resolveFractions(3)).toEqual([0.25, 0.5, 0.75]);
	});

	it('falls back to even spacing when length mismatches count', () => {
		expect(resolveFractions(2, [0.5])).toEqual([1 / 3, 2 / 3]);
		expect(resolveFractions(1, [0.2, 0.8])).toEqual([0.5]);
	});

	it('honors and sorts custom fractions matching the count', () => {
		expect(resolveFractions(3, [0.8, 0.2, 0.5])).toEqual([0.2, 0.5, 0.8]);
	});

	it('clamps fractions into [0,1]', () => {
		expect(resolveFractions(2, [-0.3, 1.7])).toEqual([0, 1]);
	});
});

describe('dividerCoords', () => {
	it('maps fractions to centered model coordinates', () => {
		// inner=100 -> evenly spaced single divider sits at center (0)
		expect(dividerCoords(1, undefined, 100)).toEqual([0]);
		// two even dividers -> -100/2 + (1/3|2/3)*100 (same arithmetic to avoid fp drift)
		expect(dividerCoords(2, undefined, 100)).toEqual([-50 + (1 / 3) * 100, -50 + (2 / 3) * 100]);
	});

	it('honors a custom fraction', () => {
		// fraction 0.25 of inner 80 -> -40 + 20 = -20
		expect(dividerCoords(1, [0.25], 80)).toEqual([-20]);
	});
});

describe('compartmentEdges', () => {
	it('wraps coords with the two interior walls', () => {
		expect(compartmentEdges([0], 100)).toEqual([-50, 0, 50]);
		expect(compartmentEdges([], 80)).toEqual([-40, 40]);
	});

	it('gap widths reproduce even spacing', () => {
		const inner = 90;
		const edges = compartmentEdges(dividerCoords(2, undefined, inner), inner);
		const gaps = edges.slice(1).map((e, i) => e - edges[i]);
		expect(gaps).toEqual([30, 30, 30]);
	});
});

describe('redistributeGaps', () => {
	it('pins one compartment and rescales equal others equally', () => {
		const r = redistributeGaps([40, 40, 40, 40], 0, 80, 160, 2);
		expect(r[0]).toBe(80);
		expect(r[1]).toBeCloseTo(80 / 3, 5);
		expect(r[2]).toBeCloseTo(80 / 3, 5);
		expect(sum(r)).toBeCloseTo(160, 5);
	});

	it('preserves the relative proportions of the other compartments', () => {
		// others were 60:30 (2:1) -> after pinning index 0 to 60, remaining 60 splits 40:20
		const r = redistributeGaps([30, 60, 30], 0, 60, 120, 2);
		expect(r).toEqual([60, 40, 20]);
	});

	it('clamps an over-large value, leaving every other at the floor', () => {
		const r = redistributeGaps([40, 40, 40, 40], 0, 1000, 160, 2);
		expect(r[0]).toBe(160 - 3 * 2); // 154
		expect(r.slice(1)).toEqual([2, 2, 2]);
		expect(sum(r)).toBeCloseTo(160, 5);
	});

	it('water-fills: freezes compartments at the floor and re-shares the rest', () => {
		const r = redistributeGaps([2, 8, 90], 2, 80, 100, 5);
		expect(r[2]).toBe(80);
		expect(r[0]).toBe(5); // would have been 4 (<5) -> floored
		expect(r[1]).toBeCloseTo(15, 5); // absorbs the remainder
		expect(sum(r)).toBeCloseTo(100, 5);
	});

	it('always conserves the total span', () => {
		for (const v of [1, 25, 55, 500]) {
			expect(sum(redistributeGaps([55, 55, 55], 1, v, 165, 2.2))).toBeCloseTo(165, 4);
		}
	});
});

describe('interiorBox', () => {
	it('computes interior dims for the default bin', () => {
		const box = interiorBox(defaultParams);
		// 2x1 grid, wt 1.2: bodyW=84-0.5=83.5, innerW=83.5-2.4=81.1
		expect(box.bodyW).toBeCloseTo(83.5, 5);
		expect(box.innerW).toBeCloseTo(81.1, 5);
		expect(box.innerL).toBeCloseTo(39.1, 5);
		// height 3 -> 21mm; wallBottom 7; wallHeight 14; topZ 21
		expect(box.wallBottom).toBe(7);
		expect(box.wallHeight).toBe(14);
		expect(box.topZ).toBe(21);
	});

	it('clamps wall height to zero for collapsed bins', () => {
		const p: BinParams = { ...defaultParams, height: 1 }; // 7mm <= wallBottom 7
		expect(interiorBox(p).wallHeight).toBe(0);
	});
});
