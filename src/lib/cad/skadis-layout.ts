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
const HOOK_REACH_BELOW = 10; // hook lip drops ~8mm below the row center — keep the lowest row clear of the floor

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
