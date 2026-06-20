import { describe, it, expect } from 'vitest';
import { hexCells, hexPolygon, HEX_RADIUS } from './hex-lattice';

describe('hex lattice', () => {
	it('returns no cells for a panel too small for one hex', () => {
		expect(hexCells(10, 10)).toEqual([]);
		expect(hexCells(200, 5)).toEqual([]);
	});

	it('fills a large panel with cells inside the margin', () => {
		const faceW = 120, faceH = 80;
		const cells = hexCells(faceW, faceH);
		expect(cells.length).toBeGreaterThan(10);
		for (const { u, v } of cells) {
			expect(Math.abs(u)).toBeLessThanOrEqual(faceW / 2 - HEX_RADIUS);
			expect(Math.abs(v)).toBeLessThanOrEqual(faceH / 2 - HEX_RADIUS);
		}
	});

	it('staggers alternating columns (more than one column offset)', () => {
		const cells = hexCells(120, 80);
		const us = new Set(cells.map((c) => Math.round(c.u * 100)));
		expect(us.size).toBeGreaterThan(1);
	});

	it('hexPolygon is a flat-top hexagon at the circumradius', () => {
		const pts = hexPolygon();
		expect(pts).toHaveLength(6);
		for (const [x, y] of pts) expect(Math.hypot(x, y)).toBeCloseTo(HEX_RADIUS, 6);
		// flat-top means a horizontal top edge — two distinct vertices share the max Y
		// (printability hinges on this orientation, so guard it).
		const maxY = Math.max(...pts.map(([, y]) => y));
		expect(pts.filter(([, y]) => Math.abs(y - maxY) < 1e-9)).toHaveLength(2);
	});
});
