// Single source for the lightweight hex lattice shared across every variant — the
// bin dividers (manifold-bin.ts STL + gridfinity.ts STEP) and the Skadis walls
// (skadis-manifold.ts + skadis-occt.ts). Engine-free pure math (same role as
// baseplate-layout.ts / skadis-layout.ts): it emits the hexagon outline + the cell
// centers, and each geometry path turns those into engine-specific cutters.
//
// Flat-top hexagons: a flat-top hole in a vertical wall has ~30°-from-vertical upper
// edges and closes with only a short top bridge, so it prints without supports — a
// pointy-top hole's 60° overhang does not. The tessellation interlocks columns at the
// 1.5R pitch and stacks rows at the √3R pitch, dropping alternate columns half a row.

export const HEX_RADIUS = 6;
const HEX_WEB = 2; // wall left between adjacent hexes
const HEX_MARGIN = 3; // solid border kept around each panel
// Oversize cutters past both wall faces so a coincident face never leaves the wall
// uncut (the OCCT boolean is especially sensitive to this).
export const HEX_CUT_OVERSHOOT = 0.1;

export interface HexCell {
	u: number; // in-plane horizontal offset from the panel center
	v: number; // vertical offset from the panel center
}

export type HexPanelAxis = 'X' | 'Y' | 'Z';

export interface HexPanelCutter {
	axis: HexPanelAxis;
	x: number;
	y: number;
	z: number;
	cutDepth: number;
}

// Flat-top hexagon vertices centered at the origin (circumradius HEX_RADIUS): a flat
// edge top and bottom, points left and right. `drawPolysides(HEX_RADIUS, 6)` (no
// rotation) produces the same hexagon for the replicad paths.
export function hexPolygon(): [number, number][] {
	const pts: [number, number][] = [];
	for (let i = 0; i < 6; i++) {
		const a = (60 * i * Math.PI) / 180;
		pts.push([HEX_RADIUS * Math.cos(a), HEX_RADIUS * Math.sin(a)]);
	}
	return pts;
}

// Staggered flat-top hex grid over a faceW×faceH panel (minus margins); returns the
// in-plane center of each hex. Empty when the panel is too small for even one hex —
// every geometry path consumes this so the cutouts stay identical.
export function hexCells(faceW: number, faceH: number): HexCell[] {
	const usableW = faceW - 2 * HEX_MARGIN;
	const usableH = faceH - 2 * HEX_MARGIN;
	if (usableW < 2 * HEX_RADIUS || usableH < 2 * HEX_RADIUS) return [];
	const colSpacing = 1.5 * HEX_RADIUS + HEX_WEB;
	const rowSpacing = Math.sqrt(3) * HEX_RADIUS + HEX_WEB;
	const cols = Math.floor(usableW / colSpacing);
	const rows = Math.floor(usableH / rowSpacing);
	if (cols < 1 || rows < 1) return [];
	const gridW = (cols - 1) * colSpacing;
	const gridH = (rows - 1) * rowSpacing;
	const cells: HexCell[] = [];
	for (let col = 0; col < cols; col++) {
		const isOdd = col % 2 === 1;
		const maxRows = isOdd ? rows - 1 : rows;
		const colOffset = isOdd ? rowSpacing / 2 : 0;
		for (let row = 0; row < maxRows; row++) {
			cells.push({ u: -gridW / 2 + col * colSpacing, v: -gridH / 2 + row * rowSpacing + colOffset });
		}
	}
	return cells;
}

export function hexPanelCutters(
	axis: HexPanelAxis,
	faceW: number,
	faceH: number,
	thickness: number,
	cx: number,
	cy: number,
	cz: number
): HexPanelCutter[] {
	const cutDepth = thickness + 2 * HEX_CUT_OVERSHOOT;
	return hexCells(faceW, faceH).map(({ u, v }) => {
		if (axis === 'X') return { axis, x: cx - cutDepth / 2, y: cy + u, z: cz + v, cutDepth };
		if (axis === 'Y') return { axis, x: cx + u, y: cy - cutDepth / 2, z: cz + v, cutDepth };
		return { axis, x: cx + u, y: cy + v, z: cz - cutDepth / 2, cutDepth };
	});
}
