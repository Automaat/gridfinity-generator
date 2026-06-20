// Pure baseplate tiling math — no geometry engine, so it is fully unit-testable
// (same role divider-layout.ts plays for bins). Turns a drawer footprint + bed
// size into a grid of printer-bed-sized tiles, the dovetail snap-tabs that join
// them, the receiving-socket centers, and per-side skirt padding.
//
// Coordinate frame: the assembled plate is centered on the origin (matches the
// bin builder). All positions returned here are in that assembled mm space; the
// geometry builder localizes each tile for per-tile export.
import type { Align, BaseplateParams } from '$lib/stores/params';
import { GRID_UNIT } from './gridfinity-spec';

export const PITCH = GRID_UNIT;

export interface Span {
	start: number; // first cell index (inclusive)
	count: number; // number of cells
}

// A seam shared by two adjacent tiles. The geometry builder turns each seam into
// the chosen connector (dovetail snap-tabs or screw-together bolt holes). `axis`
// is the seam normal — 'x' = vertical seam, 'y' = horizontal. `bodyDir` points
// from the seam into THIS tile's body; `male` marks the lead tile (dovetail tail
// / bolt-head side), so the abutting tile is its complement.
export interface Seam {
	axis: 'x' | 'y';
	pos: number; // seam coordinate (assembled mm)
	min: number; // span start along the seam
	max: number; // span end along the seam
	bodyDir: number; // +1 / -1
	male: boolean;
}

export interface BaseplateTile {
	col: number; // tile index within the tile grid (not cell index)
	row: number;
	x0: number; // low corner (assembled mm)
	y0: number;
	w: number; // footprint incl. any outer skirt on edge tiles
	l: number;
	cx: number; // center (assembled mm)
	cy: number;
	cells: { x: number; y: number }[]; // socket centers this tile owns
	seams: Seam[]; // shared edges that carry a connector
}

// Connector positions along a seam: one per shared cell, at the cell centers.
export function seamCellCenters(seam: Seam): number[] {
	const out: number[] = [];
	for (let c = seam.min + PITCH / 2; c < seam.max; c += PITCH) out.push(c);
	return out;
}

export interface BaseplateLayout {
	cols: number; // cells across the whole plate
	rows: number;
	outerW: number; // full plate footprint (= drawer mm)
	outerL: number;
	skirt: { x: number; y: number }; // leftover margin (mm) on each axis
	tilesX: number;
	tilesY: number;
	tiles: BaseplateTile[];
	multiTile: boolean;
}

// Split `total` cells into bed-sized runs. `incremental` packs each tile to the
// max and leaves the remainder on the last tile; `ideal` balances tiles so none
// is a tiny sliver.
export function tileSpans(total: number, perTile: number, algo: 'ideal' | 'incremental'): Span[] {
	const cap = Math.max(1, Math.min(perTile, total));
	const nTiles = Math.ceil(total / cap);
	const spans: Span[] = [];
	if (algo === 'incremental') {
		for (let start = 0; start < total; start += cap) {
			spans.push({ start, count: Math.min(cap, total - start) });
		}
		return spans;
	}
	// ideal: distribute as evenly as possible across nTiles.
	const base = Math.floor(total / nTiles);
	const rem = total % nTiles;
	let start = 0;
	for (let t = 0; t < nTiles; t++) {
		const count = base + (t < rem ? 1 : 0);
		spans.push({ start, count });
		start += count;
	}
	return spans;
}

// Distribute leftover skirt mm to the [low, high] sides per alignment. 'low'
// aligns the grid to the min side (margin on the high side) and vice versa.
function splitSkirt(skirt: number, align: Align): [number, number] {
	if (align === 'low') return [0, skirt];
	if (align === 'high') return [skirt, 0];
	return [skirt / 2, skirt / 2];
}

export function planBaseplate(bp: BaseplateParams): BaseplateLayout {
	const cols = Math.max(1, Math.floor(bp.drawerWidth / PITCH));
	const rows = Math.max(1, Math.floor(bp.drawerDepth / PITCH));
	const skirtX = bp.drawerWidth - cols * PITCH;
	const skirtY = bp.drawerDepth - rows * PITCH;
	const [skLowX] = splitSkirt(skirtX, bp.alignX);
	const [skLowY] = splitSkirt(skirtY, bp.alignY);
	const [, skHighX] = splitSkirt(skirtX, bp.alignX);
	const [, skHighY] = splitSkirt(skirtY, bp.alignY);

	const outerW = bp.drawerWidth;
	const outerL = bp.drawerDepth;
	// Low edge of cell 0 in assembled coords (outer plate centered on origin).
	const gx0 = -outerW / 2 + skLowX;
	const gy0 = -outerL / 2 + skLowY;
	const edgeX = (i: number) => gx0 + i * PITCH;
	const edgeY = (j: number) => gy0 + j * PITCH;

	// Reserve the whole skirt when sizing tiles so even the edge tile that carries
	// it still fits the bed (skirt < PITCH, so this drops at most one cell).
	const cptX = Math.max(1, Math.floor((bp.bedWidth - skirtX) / PITCH));
	const cptY = Math.max(1, Math.floor((bp.bedDepth - skirtY) / PITCH));
	const colSpans = tileSpans(cols, cptX, bp.splitAlgorithm);
	const rowSpans = tileSpans(rows, cptY, bp.splitAlgorithm);
	const tilesX = colSpans.length;
	const tilesY = rowSpans.length;

	const grid: BaseplateTile[][] = [];
	for (let tc = 0; tc < tilesX; tc++) {
		grid[tc] = [];
		const cs = colSpans[tc]!;
		const xLow = edgeX(cs.start) - (tc === 0 ? skLowX : 0);
		const xHigh = edgeX(cs.start + cs.count) + (tc === tilesX - 1 ? skHighX : 0);
		for (let tr = 0; tr < tilesY; tr++) {
			const rs = rowSpans[tr]!;
			const yLow = edgeY(rs.start) - (tr === 0 ? skLowY : 0);
			const yHigh = edgeY(rs.start + rs.count) + (tr === tilesY - 1 ? skHighY : 0);
			const cells: { x: number; y: number }[] = [];
			for (let i = cs.start; i < cs.start + cs.count; i++) {
				for (let j = rs.start; j < rs.start + rs.count; j++) {
					cells.push({ x: edgeX(i) + PITCH / 2, y: edgeY(j) + PITCH / 2 });
				}
			}
			grid[tc]![tr] = {
				col: tc, row: tr,
				x0: xLow, y0: yLow, w: xHigh - xLow, l: yHigh - yLow,
				cx: (xLow + xHigh) / 2, cy: (yLow + yHigh) / 2,
				cells, seams: []
			};
		}
	}

	if (bp.connector !== 'none') {
		// Vertical seams: male on the left (lower-index) tile.
		for (let tc = 0; tc < tilesX - 1; tc++) {
			const cs = colSpans[tc]!;
			const seamX = edgeX(cs.start + cs.count);
			for (let tr = 0; tr < tilesY; tr++) {
				const rs = rowSpans[tr]!;
				const min = edgeY(rs.start);
				const max = edgeY(rs.start + rs.count);
				grid[tc]![tr]!.seams.push({ axis: 'x', pos: seamX, min, max, bodyDir: -1, male: true });
				grid[tc + 1]![tr]!.seams.push({ axis: 'x', pos: seamX, min, max, bodyDir: 1, male: false });
			}
		}
		// Horizontal seams: male on the bottom (lower-index) tile.
		for (let tr = 0; tr < tilesY - 1; tr++) {
			const rs = rowSpans[tr]!;
			const seamY = edgeY(rs.start + rs.count);
			for (let tc = 0; tc < tilesX; tc++) {
				const cs = colSpans[tc]!;
				const min = edgeX(cs.start);
				const max = edgeX(cs.start + cs.count);
				grid[tc]![tr]!.seams.push({ axis: 'y', pos: seamY, min, max, bodyDir: -1, male: true });
				grid[tc]![tr + 1]!.seams.push({ axis: 'y', pos: seamY, min, max, bodyDir: 1, male: false });
			}
		}
	}

	const tiles: BaseplateTile[] = [];
	for (let tc = 0; tc < tilesX; tc++) {
		for (let tr = 0; tr < tilesY; tr++) tiles.push(grid[tc]![tr]!);
	}

	return {
		cols, rows, outerW, outerL,
		skirt: { x: skirtX, y: skirtY },
		tilesX, tilesY, tiles,
		multiTile: tilesX * tilesY > 1
	};
}
