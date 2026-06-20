// Pure bin-split math — no geometry engine, so it is fully unit-testable (same
// role baseplate-layout.ts plays for baseplates). Turns a bin's grid footprint +
// printer-bed size into a set of bed-sized pieces cut along internal grid lines.
//
// Only X/Y can exceed a bed: bins cap at 6 units (≈252mm) wide/deep but ≤10 units
// (≤73.5mm incl. lip) tall, well within any bed's Z — so pieces are never split in
// height. Cuts land on cell boundaries (multiples of 42mm) where the cross-section
// is clean. Pieces are flush; the geometry builder glues/exports them as-is.
//
// Coordinate frame matches the bin builder: the assembled bin is centered on the
// origin, cell i center at i·42 − gridOffset.
import { PITCH, tileSpans } from './baseplate-layout';

const TOLERANCE = 0.5; // matches manifold-bin TOLERANCE — bodySize = units·42 − 0.5

// One printable piece of a split bin, in assembled (centered) mm. [x0,x1]×[y0,y1]
// is the clip region; cx/cy is its center (used to localize the piece for export).
export interface BinPiece {
	col: number; // piece index within the piece grid (not cell index)
	row: number;
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	w: number;
	l: number;
	cx: number;
	cy: number;
}

export interface BinSplitPlan {
	tilesX: number; // pieces across
	tilesY: number;
	pieces: BinPiece[];
	multiTile: boolean; // false => the bin fits one piece, no split needed
}

// Split a bin's `width`×`length` cell grid into bed-sized pieces. Mirrors the
// baseplate tiler but has no skirt (the footprint is exactly the grid), so an
// edge piece is just the body extent up to the first interior grid line.
export function planBinSplit(
	width: number,
	length: number,
	bedWidth: number,
	bedDepth: number,
	algo: 'ideal' | 'incremental'
): BinSplitPlan {
	const bodyW = width * PITCH - TOLERANCE;
	const bodyL = length * PITCH - TOLERANCE;
	const gridOffsetX = ((width - 1) * PITCH) / 2;
	const gridOffsetY = ((length - 1) * PITCH) / 2;
	// Internal grid line before cell i (assembled mm); i in 1..units-1.
	const lineX = (i: number) => i * PITCH - PITCH / 2 - gridOffsetX;
	const lineY = (j: number) => j * PITCH - PITCH / 2 - gridOffsetY;

	// Whole grid cells that fit the bed (no skirt to reserve, unlike a baseplate).
	const cellsPerX = Math.max(1, Math.floor(bedWidth / PITCH));
	const cellsPerY = Math.max(1, Math.floor(bedDepth / PITCH));
	const colSpans = tileSpans(width, cellsPerX, algo);
	const rowSpans = tileSpans(length, cellsPerY, algo);
	const tilesX = colSpans.length;
	const tilesY = rowSpans.length;

	const pieces: BinPiece[] = [];
	for (let tc = 0; tc < tilesX; tc++) {
		const cs = colSpans[tc]!;
		const x0 = tc === 0 ? -bodyW / 2 : lineX(cs.start);
		const x1 = tc === tilesX - 1 ? bodyW / 2 : lineX(cs.start + cs.count);
		for (let tr = 0; tr < tilesY; tr++) {
			const rs = rowSpans[tr]!;
			const y0 = tr === 0 ? -bodyL / 2 : lineY(rs.start);
			const y1 = tr === tilesY - 1 ? bodyL / 2 : lineY(rs.start + rs.count);
			pieces.push({
				col: tc,
				row: tr,
				x0,
				x1,
				y0,
				y1,
				w: x1 - x0,
				l: y1 - y0,
				cx: (x0 + x1) / 2,
				cy: (y0 + y1) / 2
			});
		}
	}

	return { tilesX, tilesY, pieces, multiTile: tilesX * tilesY > 1 };
}
