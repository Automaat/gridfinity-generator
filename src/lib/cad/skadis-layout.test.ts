import { describe, it, expect } from 'vitest';
import type { SkadisParams } from '$lib/stores/params';
import { planSkadis, hexCells, hexPolygon, HEX_RADIUS, SKADIS_PITCH } from './skadis-layout';

function makeSk(overrides: Partial<SkadisParams> = {}): SkadisParams {
	return { width: 120, height: 80, depth: 50, wallThickness: 2, hookRows: 1, openFront: false, lightweightWalls: false, ...overrides };
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
});

describe('hex lattice', () => {
	it('returns no cells for a panel too small for one hex', () => {
		expect(hexCells(10, 10)).toEqual([]);
		expect(hexCells(200, 5)).toEqual([]);
	});

	it('fills a large panel with staggered cells inside the margin', () => {
		const faceW = 120, faceH = 80;
		const cells = hexCells(faceW, faceH);
		expect(cells.length).toBeGreaterThan(10);
		for (const { u, v } of cells) {
			expect(Math.abs(u)).toBeLessThanOrEqual(faceW / 2 - HEX_RADIUS);
			expect(Math.abs(v)).toBeLessThanOrEqual(faceH / 2 - HEX_RADIUS);
		}
	});

	it('staggers alternating rows (two distinct column offsets)', () => {
		const cells = hexCells(120, 80);
		const us = new Set(cells.map((c) => Math.round(c.u * 100)));
		expect(us.size).toBeGreaterThan(1);
	});

	it('hexPolygon has six vertices at the circumradius', () => {
		const pts = hexPolygon();
		expect(pts).toHaveLength(6);
		for (const [x, y] of pts) expect(Math.hypot(x, y)).toBeCloseTo(HEX_RADIUS, 6);
	});
});
