import { describe, it, expect } from 'vitest';
import type { BaseplateParams } from '$lib/stores/params';
import { planBaseplate, tileSpans, PITCH } from './baseplate-layout';

function makeBp(overrides: Partial<BaseplateParams> = {}): BaseplateParams {
	return {
		drawerWidth: 252, drawerDepth: 210, alignX: 'center', alignY: 'center',
		style: 'simple', screwHoles: false, bedWidth: 256, bedDepth: 256,
		splitAlgorithm: 'ideal', dovetails: true, exportLayout: 'zip', ...overrides
	};
}

const dtKey = (d: { x: number; y: number; axis: string }) => `${d.axis}:${d.x.toFixed(3)}:${d.y.toFixed(3)}`;
const firstCellX = (l: ReturnType<typeof planBaseplate>) => Math.min(...l.tiles.flatMap((t) => t.cells.map((c) => c.x)));

describe('tileSpans', () => {
	it('keeps everything in one span when it fits', () => {
		expect(tileSpans(6, 6, 'ideal')).toEqual([{ start: 0, count: 6 }]);
		expect(tileSpans(5, 8, 'incremental')).toEqual([{ start: 0, count: 5 }]);
	});

	it('incremental packs to the cap and leaves the remainder last', () => {
		expect(tileSpans(8, 5, 'incremental')).toEqual([
			{ start: 0, count: 5 },
			{ start: 5, count: 3 }
		]);
	});

	it('ideal balances tiles so none is a sliver', () => {
		// 8 cells, cap 5 -> 2 tiles -> balanced 4+4 (not 5+3)
		expect(tileSpans(8, 5, 'ideal')).toEqual([
			{ start: 0, count: 4 },
			{ start: 4, count: 4 }
		]);
	});

	it('spans always cover every cell exactly once', () => {
		for (const algo of ['ideal', 'incremental'] as const) {
			for (const total of [1, 7, 13, 20]) {
				for (const cap of [1, 3, 5, 6]) {
					const spans = tileSpans(total, cap, algo);
					const covered = spans.flatMap((s) => Array.from({ length: s.count }, (_, k) => s.start + k));
					expect(covered).toEqual(Array.from({ length: total }, (_, i) => i));
					expect(spans.every((s) => s.count <= cap)).toBe(true);
				}
			}
		}
	});
});

describe('planBaseplate', () => {
	it('derives cell grid from drawer mm (floor)', () => {
		const l = planBaseplate(makeBp({ drawerWidth: 252, drawerDepth: 210 }));
		expect(l.cols).toBe(6);
		expect(l.rows).toBe(5);
		expect(l.skirt).toEqual({ x: 0, y: 0 });
	});

	it('fits in one bed -> single tile, no dovetails', () => {
		const l = planBaseplate(makeBp({ drawerWidth: 252, drawerDepth: 210, bedWidth: 256, bedDepth: 256 }));
		expect(l.tilesX).toBe(1);
		expect(l.tilesY).toBe(1);
		expect(l.multiTile).toBe(false);
		expect(l.tiles).toHaveLength(1);
		expect(l.tiles[0]!.males).toHaveLength(0);
		expect(l.tiles[0]!.females).toHaveLength(0);
	});

	it('splits a large drawer into a tile grid', () => {
		const l = planBaseplate(makeBp({ drawerWidth: 8 * PITCH, drawerDepth: 6 * PITCH, bedWidth: 220, bedDepth: 220 }));
		// floor((220-0)/42) = 5 cells/tile -> 8 cols => 2 tiles, 6 rows => 2 tiles
		expect(l.cols).toBe(8);
		expect(l.rows).toBe(6);
		expect(l.tilesX).toBe(2);
		expect(l.tilesY).toBe(2);
		expect(l.tiles).toHaveLength(4);
	});

	it('tiles cover the full drawer footprint with no gaps or overlap', () => {
		const l = planBaseplate(makeBp({ drawerWidth: 360, drawerDepth: 280, bedWidth: 180, bedDepth: 180 }));
		const area = l.tiles.reduce((sum, t) => sum + t.w * t.l, 0);
		expect(area).toBeCloseTo(l.outerW * l.outerL, 3);
		// outer bounds equal the drawer footprint, centered on origin
		const minX = Math.min(...l.tiles.map((t) => t.x0));
		const maxX = Math.max(...l.tiles.map((t) => t.x0 + t.w));
		expect(minX).toBeCloseTo(-l.outerW / 2, 6);
		expect(maxX).toBeCloseTo(l.outerW / 2, 6);
	});

	it('owns every cell exactly once across all tiles', () => {
		const l = planBaseplate(makeBp({ drawerWidth: 8 * PITCH, drawerDepth: 6 * PITCH, bedWidth: 180, bedDepth: 180 }));
		const total = l.tiles.reduce((n, t) => n + t.cells.length, 0);
		expect(total).toBe(l.cols * l.rows);
	});

	it('pairs every male tab with a matching female on the neighbor', () => {
		const l = planBaseplate(makeBp({ drawerWidth: 8 * PITCH, drawerDepth: 6 * PITCH, bedWidth: 180, bedDepth: 180 }));
		const males = l.tiles.flatMap((t) => t.males);
		const females = l.tiles.flatMap((t) => t.females);
		expect(males.length).toBeGreaterThan(0);
		expect(males.length).toBe(females.length);
		expect(new Set(males.map(dtKey))).toEqual(new Set(females.map(dtKey)));
	});

	it('distributes skirt by alignment', () => {
		const drawerWidth = 6 * PITCH + 10; // 10mm skirt
		const low = planBaseplate(makeBp({ drawerWidth, alignX: 'low' }));
		const high = planBaseplate(makeBp({ drawerWidth, alignX: 'high' }));
		const center = planBaseplate(makeBp({ drawerWidth, alignX: 'center' }));
		expect(low.skirt.x).toBeCloseTo(10, 6);
		// align low => grid flush to low edge => first cell center at low edge + 21
		expect(firstCellX(low)).toBeCloseTo(-drawerWidth / 2 + PITCH / 2, 6);
		expect(firstCellX(high)).toBeCloseTo(-drawerWidth / 2 + 10 + PITCH / 2, 6);
		expect(firstCellX(center)).toBeCloseTo(-drawerWidth / 2 + 5 + PITCH / 2, 6);
	});

	it('keeps every tile within the printer bed', () => {
		const l = planBaseplate(makeBp({ drawerWidth: 500, drawerDepth: 400, bedWidth: 200, bedDepth: 200 }));
		for (const t of l.tiles) {
			expect(t.w).toBeLessThanOrEqual(200 + 1e-6);
			expect(t.l).toBeLessThanOrEqual(200 + 1e-6);
		}
	});
});
