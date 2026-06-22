import { describe, it, expect } from 'vitest';
import { defaultParams, type BinParams } from '$lib/stores/params';
import {
	resolveFractions,
	dividerCoords,
	compartmentEdges,
	redistributeGaps,
	interiorBox,
	holeLayouts,
	labelTabLayouts,
	scoopLayouts,
	scoopPrimitiveLayout,
	wallCutLayout
} from './divider-layout';

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const expectPoint = (actual: [number, number], expected: [number, number]) => {
	expect(actual[0]).toBeCloseTo(expected[0], 5);
	expect(actual[1]).toBeCloseTo(expected[1], 5);
};

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
		const gaps = edges.slice(1).map((e, i) => e - edges[i]!);
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

describe('holeLayouts', () => {
	it('returns no layouts when bottom holes are disabled', () => {
		expect(holeLayouts(defaultParams)).toEqual([]);
	});

	it('includes screw-only layouts for every grid hole site', () => {
		const layouts = holeLayouts({ ...defaultParams, width: 2, length: 1, screwHoles: true });

		expect(layouts).toHaveLength(8);
		expect(layouts.every((layout) => layout.parts.join(',') === 'screw')).toBe(true);
	});

	it('filters magnets to the four outer corners when requested', () => {
		const layouts = holeLayouts({
			...defaultParams,
			width: 2,
			length: 2,
			magnetHoles: true,
			magnetCornersOnly: true
		});
		const cornerSigns = layouts.map(({ x, y }) => `${Math.sign(x)},${Math.sign(y)}`).toSorted();

		expect(layouts).toHaveLength(4);
		expect(layouts.every((layout) => layout.parts.join(',') === 'magnet')).toBe(true);
		expect(cornerSigns).toEqual(['-1,-1', '-1,1', '1,-1', '1,1']);
	});

	it('combines magnet and screw parts at enabled sites in stable order', () => {
		const [layout] = holeLayouts({ ...defaultParams, magnetHoles: true, screwHoles: true });

		expect(layout?.parts).toEqual(['magnet', 'screw']);
	});
});

describe('scoopLayouts', () => {
	const box = interiorBox(defaultParams);

	it('returns no layouts when the resolved radius is too small', () => {
		expect(
			scoopLayouts({ ...defaultParams, scoopWalls: ['back'], scoopRadius: 0 }, box.innerW, box.innerL, 3)
		).toEqual([]);
	});

	it('maps each selected wall to a backend-neutral scoop layout', () => {
		const layouts = scoopLayouts(
			{ ...defaultParams, scoopWalls: ['back', 'front', 'left', 'right'] },
			box.innerW,
			box.innerL,
			box.wallHeight
		);

		expect(layouts).toHaveLength(4);
		expect(layouts[0]).toEqual({
			radius: 7,
			extrudeLen: box.innerW,
			wallPos: -box.innerL / 2,
			extrudeStart: -box.innerW / 2,
			axis: 'X',
			flip: false
		});
		expect(layouts[1]).toEqual({
			radius: 7,
			extrudeLen: box.innerW,
			wallPos: box.innerL / 2,
			extrudeStart: -box.innerW / 2,
			axis: 'X',
			flip: true
		});
		expect(layouts[2]).toEqual({
			radius: 7,
			extrudeLen: box.innerL,
			wallPos: -box.innerW / 2,
			extrudeStart: -box.innerL / 2,
			axis: 'Y',
			flip: false
		});
		expect(layouts[3]).toEqual({
			radius: 7,
			extrudeLen: box.innerL,
			wallPos: box.innerW / 2,
			extrudeStart: -box.innerL / 2,
			axis: 'Y',
			flip: true
		});
	});

	it('expands across divider compartments and caps custom radius to wall height', () => {
		const layouts = scoopLayouts(
			{ ...defaultParams, dividersX: 1, dividersY: 1, scoopWalls: ['back'], scoopRadius: 20 },
			box.innerW,
			box.innerL,
			box.wallHeight
		);

		expect(layouts).toHaveLength(4);
		expect(layouts.every((layout) => layout.radius === box.wallHeight)).toBe(true);
		expect(layouts[0]?.extrudeLen).toBeCloseTo(box.innerW / 2, 5);
		expect(layouts[0]?.wallPos).toBeCloseTo(-box.innerL / 2, 5);
		expect(layouts[3]?.extrudeStart).toBeCloseTo(0, 5);
		expect(layouts[3]?.wallPos).toBeCloseTo(0, 5);
	});

	it('computes X-axis primitive placement for back/front scoops', () => {
		const [layout] = scoopLayouts(
			{ ...defaultParams, scoopWalls: ['back'] },
			box.innerW,
			box.innerL,
			box.wallHeight
		);
		const primitive = scoopPrimitiveLayout(layout!, box.wallBottom);

		expect(primitive.axis).toBe('X');
		expect(primitive.blockW).toBeCloseTo(box.innerW, 5);
		expect(primitive.blockL).toBe(7);
		expect(primitive.blockX).toBeCloseTo(0, 5);
		expect(primitive.blockY).toBeCloseTo(-box.innerL / 2 + 3.5, 5);
		expect(primitive.cylinderPlane).toBe('YZ');
		expect(primitive.cylinderAlongStart).toBeCloseTo(-box.innerW / 2, 5);
		expect(primitive.cylinderCrossPos).toBeCloseTo(-box.innerL / 2 + 7, 5);
		expect(primitive.cylinderZ).toBe(14);
	});

	it('computes Y-axis primitive placement for left/right scoops', () => {
		const [layout] = scoopLayouts(
			{ ...defaultParams, scoopWalls: ['right'] },
			box.innerW,
			box.innerL,
			box.wallHeight
		);
		const primitive = scoopPrimitiveLayout(layout!, box.wallBottom);

		expect(primitive.axis).toBe('Y');
		expect(primitive.blockW).toBe(7);
		expect(primitive.blockL).toBeCloseTo(box.innerL, 5);
		expect(primitive.blockX).toBeCloseTo(box.innerW / 2 - 3.5, 5);
		expect(primitive.blockY).toBeCloseTo(0, 5);
		expect(primitive.cylinderPlane).toBe('XZ');
		expect(primitive.cylinderAlongStart).toBeCloseTo(-box.innerL / 2, 5);
		expect(primitive.cylinderCrossPos).toBeCloseTo(box.innerW / 2 - 7, 5);
		expect(primitive.cylinderZ).toBe(14);
	});
});

describe('labelTabLayouts', () => {
	const box = interiorBox(defaultParams);

	it('builds one front-wall tab for a bin without X dividers', () => {
		const layouts = labelTabLayouts(defaultParams, box.innerW, box.innerL, box.wallBottom, box.wallHeight);

		expect(layouts).toHaveLength(1);
		expect(layouts[0]).toEqual({
			xStart: -box.innerW / 2,
			width: box.innerW,
			frontY: box.innerL / 2,
			topZ: box.topZ,
			profile: [[0, 0], [-4.5, 0], [0, -14]]
		});
	});

	it('subtracts divider thickness from tabs after the first compartment', () => {
		const layouts = labelTabLayouts(
			{ ...defaultParams, dividersX: 2 },
			box.innerW,
			box.innerL,
			box.wallBottom,
			box.wallHeight
		);

		expect(layouts).toHaveLength(3);
		expect(layouts[0]?.width).toBeCloseTo(box.innerW / 3, 5);
		expect(layouts[1]?.width).toBeCloseTo(box.innerW / 3 - defaultParams.wallThickness, 5);
		expect(layouts[1]?.xStart).toBeCloseTo(-box.innerW / 6 + defaultParams.wallThickness / 2, 5);
	});

	it('returns independent profile tuples for each tab', () => {
		const layouts = labelTabLayouts(
			{ ...defaultParams, dividersX: 1 },
			box.innerW,
			box.innerL,
			box.wallBottom,
			box.wallHeight
		);

		expect(layouts).toHaveLength(2);
		expect(layouts[0]?.profile).not.toBe(layouts[1]?.profile);
		expect(layouts[0]?.profile[1]).not.toBe(layouts[1]?.profile[1]);
	});

	it('skips compartments too narrow for a usable tab and caps profile depth', () => {
		const layouts = labelTabLayouts(
			{ ...defaultParams, dividersX: 2, wallThickness: 1.2 },
			2,
			4,
			box.wallBottom,
			10
		);

		expect(layouts).toEqual([]);

		const [layout] = labelTabLayouts(defaultParams, box.innerW, 4, box.wallBottom, 10);
		expect(layout?.profile).toEqual([[0, 0], [-3, 0], [0, -10]]);
	});
});

describe('wallCutLayout', () => {
	const box = interiorBox(defaultParams);

	it('builds a front-facing partial-run cut profile', () => {
		const layout = wallCutLayout(
			{ ...defaultParams, wallCutSide: 'front', wallCutLowFraction: 0.25, wallCutRun: 0.5 },
			box.bodyW,
			box.bodyL,
			box.wallBottom,
			box.wallHeight,
			0
		);

		expect(layout.axis).toBe('Y');
		expect(layout.crossHalf).toBeCloseTo(box.bodyW / 2 + 1, 5);
		expect(layout.points).toHaveLength(5);

		const spanHalf = box.bodyL / 2 + 1;
		const lowZ = box.wallBottom + box.wallHeight * 0.25;
		expectPoint(layout.points[0]!, [-spanHalf, box.topZ]);
		expectPoint(layout.points[1]!, [0, lowZ]);
		expectPoint(layout.points[2]!, [spanHalf, lowZ]);
		expectPoint(layout.points[3]!, [spanHalf, box.topZ + 5]);
		expectPoint(layout.points[4]!, [-spanHalf, box.topZ + 5]);
	});

	it('omits the low flat segment for full-run cuts', () => {
		const layout = wallCutLayout(
			{ ...defaultParams, wallCutSide: 'back', wallCutLowFraction: 0.5, wallCutRun: 1 },
			box.bodyW,
			box.bodyL,
			box.wallBottom,
			box.wallHeight,
			2
		);

		const spanHalf = box.bodyL / 2 + 1;
		const lowZ = box.wallBottom + box.wallHeight * 0.5;
		expect(layout.axis).toBe('Y');
		expect(layout.points).toHaveLength(4);
		expectPoint(layout.points[0]!, [spanHalf, box.topZ + 2]);
		expectPoint(layout.points[1]!, [-spanHalf, lowZ]);
	});

	it('uses the X span for left and right cuts', () => {
		for (const [side, expectedLow] of [
			['left', -1],
			['right', 1]
		] as const) {
			const layout = wallCutLayout(
				{ ...defaultParams, wallCutSide: side },
				box.bodyW,
				box.bodyL,
				box.wallBottom,
				box.wallHeight,
				0
			);
			const spanHalf = box.bodyW / 2 + 1;
			expect(layout.axis).toBe('X');
			expect(layout.crossHalf).toBeCloseTo(box.bodyL / 2 + 1, 5);
			expect(layout.points[1]![0]).toBeCloseTo(expectedLow * spanHalf, 5);
		}
	});
});
