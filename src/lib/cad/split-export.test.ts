import { describe, expect, it } from 'vitest';
import { combinedGridPlacements, gridExportName } from './split-export';

describe('split export helpers', () => {
	it('formats row/column part names as one-based indices', () => {
		expect(gridExportName('tile', { row: 0, col: 1 })).toBe('tile_r1c2.stl');
		expect(gridExportName('piece', { row: 2, col: 0 })).toBe('piece_r3c1.stl');
	});

	it('places combined export items by max column width and row length', () => {
		const items = [
			{ id: 'a', col: 0, row: 0, w: 40, l: 20 },
			{ id: 'b', col: 1, row: 0, w: 30, l: 50 },
			{ id: 'c', col: 0, row: 1, w: 80, l: 10 }
		];

		expect(combinedGridPlacements(items, 12)).toEqual([
			{ item: items[0], x: 20, y: 10 },
			{ item: items[1], x: 107, y: 25 },
			{ item: items[2], x: 40, y: 67 }
		]);
	});
});
