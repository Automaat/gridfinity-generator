// Pure Skadis hook-placement math — no geometry engine, so it is fully unit-
// testable (same role baseplate-layout.ts plays for baseplates). Turns a box
// footprint into the grid of snap-hook centers that engage an IKEA Skadis
// pegboard. Both geometry paths (skadis-manifold.ts STL/preview + skadis-occt.ts
// STEP) consume this single source of truth.
//
// Skadis spec: 5×15mm oval slots on a 40mm grid in both axes, board ~5mm thick.
// All hooks on a box must land in real slots at once, so columns AND rows are
// spaced exactly one pitch apart; the box is the free dimension.
import type { SkadisParams } from '$lib/stores/params';

export const SKADIS_PITCH = 40;
export const BOARD_THICKNESS = 5;
export const SLOT_W = 5;
export const SLOT_H = 15;

// Placement margins (mm).
const COL_EDGE_MARGIN = 6; // keep the outer columns inside the box width
const TOP_MARGIN = 8; // drop of the top hook row below the box top edge
const HOOK_REACH_BELOW = 6; // arm half-height + barb drop the lowest row needs above the floor

export interface SkadisHook {
	x: number; // column center (box centered on X)
	z: number; // row center (box bottom at Z=0)
}

export interface SkadisLayout {
	cols: number;
	rows: number;
	spanX: number; // (cols-1) * pitch — total width covered by the columns
	hooks: SkadisHook[];
}

export interface OuterDims {
	outerW: number; // X
	outerD: number; // Y (projection from the board)
	outerH: number; // Z
}

// The box width/height/depth are INTERIOR (usable) sizes; the printed envelope
// adds a wall on each side and a floor below. Hooks and geometry both work in this
// outer space, so this is the single conversion both consume.
export function outerDims(p: SkadisParams): OuterDims {
	const t = p.wallThickness;
	return { outerW: p.width + 2 * t, outerD: p.depth + 2 * t, outerH: p.height + t };
}

function clampInt(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Math.round(v)));
}

// Absolute Z (world) an opened wall is cut down to. Floored to a printable minimum
// and capped at the box top (a value ≥ outerH leaves the wall full height, i.e. a
// no-op cut); a non-finite height falls back to the floor so NaN/Infinity can't
// propagate into the cutters. Both geometry paths consume these so the cuts match.
const MIN_WALL_CUT_Z = 5;
function wallCutZ(height: number, outerH: number): number {
	if (!Number.isFinite(height)) return MIN_WALL_CUT_Z;
	return Math.min(outerH, Math.max(MIN_WALL_CUT_Z, height));
}
export function frontWallCutZ(p: SkadisParams): number {
	return wallCutZ(p.frontWallHeight, outerDims(p).outerH);
}
export function sideWallCutZ(p: SkadisParams): number {
	return wallCutZ(p.sideWallHeight, outerDims(p).outerH);
}

// Hex lattice (lightweight walls) — matches the bin divider lattice in
// manifold-bin.ts so the look is consistent across the app.
export const HEX_RADIUS = 6;
const HEX_WEB = 2; // wall left between adjacent hexes
const HEX_MARGIN = 3; // solid border kept around each wall panel

export interface HexCell {
	u: number; // in-plane horizontal offset from the panel center
	v: number; // vertical offset from the panel center
}

// Pointy-top hexagon vertices centered at the origin (circumradius HEX_RADIUS).
export function hexPolygon(): [number, number][] {
	const pts: [number, number][] = [];
	for (let i = 0; i < 6; i++) {
		const a = ((30 + 60 * i) * Math.PI) / 180;
		pts.push([HEX_RADIUS * Math.cos(a), HEX_RADIUS * Math.sin(a)]);
	}
	return pts;
}

// Staggered hex grid over a faceW×faceH panel (minus margins); returns the in-plane
// center of each hex. Empty when the panel is too small for even one hex — both
// geometry paths consume this so the cutouts stay identical.
export function hexCells(faceW: number, faceH: number): HexCell[] {
	const usableW = faceW - 2 * HEX_MARGIN;
	const usableH = faceH - 2 * HEX_MARGIN;
	if (usableW < 2 * HEX_RADIUS || usableH < 2 * HEX_RADIUS) return [];
	const colSpacing = Math.sqrt(3) * HEX_RADIUS + HEX_WEB;
	const rowSpacing = 1.5 * HEX_RADIUS + HEX_WEB;
	const cols = Math.floor(usableW / colSpacing);
	const rows = Math.floor(usableH / rowSpacing);
	if (cols < 1 || rows < 1) return [];
	const gridW = (cols - 1) * colSpacing;
	const gridH = (rows - 1) * rowSpacing;
	const cells: HexCell[] = [];
	for (let row = 0; row < rows; row++) {
		const isOdd = row % 2 === 1;
		const maxCols = isOdd ? cols - 1 : cols;
		const rowOffset = isOdd ? colSpacing / 2 : 0;
		for (let col = 0; col < maxCols; col++) {
			cells.push({ u: -gridW / 2 + col * colSpacing + rowOffset, v: -gridH / 2 + row * rowSpacing });
		}
	}
	return cells;
}

// Columns are spaced exactly one pitch apart and centered across the outer width;
// rows hang from the top down. `hookRows` is capped to what physically fits.
export function planSkadis(p: SkadisParams): SkadisLayout {
	const { outerW, outerH } = outerDims(p);
	const cols = Math.max(1, Math.floor((outerW - 2 * COL_EDGE_MARGIN) / SKADIS_PITCH) + 1);
	const spanX = (cols - 1) * SKADIS_PITCH;

	const topZ = outerH - TOP_MARGIN;
	// How many 40mm-spaced rows fit between the top row and the floor clearance.
	const rowsFit = Math.max(1, Math.floor((topZ - HOOK_REACH_BELOW) / SKADIS_PITCH) + 1);
	const rows = clampInt(p.hookRows, 1, Math.min(2, rowsFit));

	const hooks: SkadisHook[] = [];
	for (let r = 0; r < rows; r++) {
		const z = topZ - r * SKADIS_PITCH;
		for (let c = 0; c < cols; c++) {
			hooks.push({ x: -spanX / 2 + c * SKADIS_PITCH, z });
		}
	}
	return { cols, rows, spanX, hooks };
}
