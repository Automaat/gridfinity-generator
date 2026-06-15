// Pure baseplate tiling math — no geometry engine, so it is fully unit-testable
// (same role divider-layout.ts plays for bins). Turns a drawer footprint + bed
// size into a grid of printer-bed-sized tiles, the dovetail snap-tabs that join
// them, the receiving-socket centers, and per-side skirt padding.
//
// Coordinate frame: the assembled plate is centered on the origin (matches the
// bin builder). All positions returned here are in that assembled mm space; the
// geometry builder localizes each tile for per-tile export.
import type { Align, BaseplateParams } from '$lib/stores/params';

export const PITCH = 42;

// In-plane dovetail snap-tab (jigsaw style): a trapezoid through the full plate
// thickness, narrow at the seam mouth and wider at the tip so a pressed-together
// joint resists pulling apart (PLA flexes on assembly). One tab per cell of seam.
export const DT_DEPTH = 8; // mm the tail reaches past the seam
export const DT_NECK = 8; // mm tab width at the seam mouth
export const DT_TIP = 12; // mm tab width at the tip (must exceed neck to lock)
export const DT_ANCHOR = 2; // mm the tab roots back into its own tile body
export const DT_CLEARANCE = 0.15; // mm added to the female socket per side

export interface Span {
	start: number; // first cell index (inclusive)
	count: number; // number of cells
}

// A dovetail tab shared by two tiles: male on one, female on the other. `axis`
// is the seam normal — 'x' = vertical seam (tab reaches along ±x), 'y' = horizontal.
export interface Dovetail {
	x: number;
	y: number;
	axis: 'x' | 'y';
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
	males: Dovetail[]; // tabs that protrude from this tile
	females: Dovetail[]; // sockets cut into this tile
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
				cells, males: [], females: []
			};
		}
	}

	if (bp.dovetails) {
		// Vertical seams: male on the left (lower-index) tile, one tab per shared cell row.
		for (let tc = 0; tc < tilesX - 1; tc++) {
			const cs = colSpans[tc]!;
			const seamX = edgeX(cs.start + cs.count);
			for (let tr = 0; tr < tilesY; tr++) {
				const rs = rowSpans[tr]!;
				const a = grid[tc]![tr]!;
				const b = grid[tc + 1]![tr]!;
				for (let j = rs.start; j < rs.start + rs.count; j++) {
					const dt: Dovetail = { x: seamX, y: edgeY(j) + PITCH / 2, axis: 'x' };
					a.males.push(dt);
					b.females.push(dt);
				}
			}
		}
		// Horizontal seams: male on the bottom (lower-index) tile.
		for (let tr = 0; tr < tilesY - 1; tr++) {
			const rs = rowSpans[tr]!;
			const seamY = edgeY(rs.start + rs.count);
			for (let tc = 0; tc < tilesX; tc++) {
				const cs = colSpans[tc]!;
				const a = grid[tc]![tr]!;
				const b = grid[tc]![tr + 1]!;
				for (let i = cs.start; i < cs.start + cs.count; i++) {
					const dt: Dovetail = { x: edgeX(i) + PITCH / 2, y: seamY, axis: 'y' };
					a.males.push(dt);
					b.females.push(dt);
				}
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
