import { drawCircle, drawRoundedRectangle, type Solid, type Sketch } from 'replicad';
import type { BinParams } from '$lib/stores/params';

// Gridfinity spec (from kennetek/gridfinity-rebuilt-openscad)
const GRID_UNIT = 42;
const HEIGHT_UNIT = 7;
const TOLERANCE = 0.5;

// Base profile cross-section (from center outward):
// z=0.0, r_offset=0.00 (35.6mm, r=0.80)
// z=0.8, r_offset=0.80 (37.2mm, r=1.60) — 45° chamfer
// z=2.6, r_offset=0.80 (37.2mm, r=1.60) — vertical
// z=4.75, r_offset=2.95 (41.5mm, r=3.75) — 45° chamfer
const BASE_PROFILE_HEIGHT = 4.75;
const BASE_TOP_RADIUS = 3.75;
const CORNER_FILLET_RADIUS = 3.75;
const INNER_FILLET_RADIUS = 2.8;
const WALL_THICKNESS = 0.95;

// Magnet/screw holes — 4 per grid unit at corners
const MAGNET_HOLE_DIAMETER = 6.5;
const MAGNET_HOLE_DEPTH = 2.4;
const SCREW_HOLE_DIAMETER = 3;
const SCREW_HOLE_DEPTH = 6;
const HOLE_DISTANCE_FROM_EDGE = 8; // mm from each side

function bodySize(units: number): number {
	return units * GRID_UNIT - TOLERANCE;
}

function buildUnitBase(): Solid {
	const unitBody = GRID_UNIT - TOLERANCE; // 41.5

	// 4 Z-levels with (size, radius) at each:
	const levels = [
		{ z: 0, size: 35.6, r: 0.8 },
		{ z: 0.8, size: 37.2, r: 1.6 },
		{ z: 2.6, size: 37.2, r: 1.6 },
		{ z: 4.75, size: unitBody, r: BASE_TOP_RADIUS }
	];

	function sketchAt(idx: number): Sketch {
		const l = levels[idx];
		return drawRoundedRectangle(l.size, l.size, l.r).sketchOnPlane('XY', l.z) as Sketch;
	}

	// Loft section 1: z=0 → z=0.8 (bottom 45° chamfer)
	const chamfer1 = sketchAt(0).loftWith(sketchAt(1), { ruled: true }) as Solid;

	// Extrude section 2: z=0.8 → z=2.6 (vertical walls, constant size)
	const vertical = (
		drawRoundedRectangle(levels[1].size, levels[1].size, levels[1].r)
			.sketchOnPlane('XY', levels[1].z) as Sketch
	).extrude(levels[2].z - levels[1].z) as Solid;

	// Loft section 3: z=2.6 → z=4.75 (top 45° chamfer)
	const chamfer2 = sketchAt(2).loftWith(sketchAt(3), { ruled: true }) as Solid;

	return chamfer1.fuse(vertical).fuse(chamfer2) as Solid;
}

function buildHoles(
	p: BinParams,
	gridOffsetX: number,
	gridOffsetY: number
): Solid | null {
	const unitBody = GRID_UNIT - TOLERANCE;
	const holeOffset = unitBody / 2 - HOLE_DISTANCE_FROM_EDGE; // 12.75

	const offsets = [
		[holeOffset, holeOffset],
		[-holeOffset, holeOffset],
		[holeOffset, -holeOffset],
		[-holeOffset, -holeOffset]
	];

	let holes: Solid | null = null;

	for (let x = 0; x < p.width; x++) {
		for (let y = 0; y < p.length; y++) {
			const cx = x * GRID_UNIT - gridOffsetX;
			const cy = y * GRID_UNIT - gridOffsetY;

			for (const [ox, oy] of offsets) {
				if (p.magnetHoles) {
					const magnet = (
						drawCircle(MAGNET_HOLE_DIAMETER / 2).sketchOnPlane('XY') as Sketch
					).extrude(MAGNET_HOLE_DEPTH) as Solid;
					const positioned = magnet.translate(cx + ox, cy + oy, 0) as Solid;
					holes = holes ? (holes.fuse(positioned) as Solid) : positioned;
				}
				if (p.screwHoles) {
					const screw = (
						drawCircle(SCREW_HOLE_DIAMETER / 2).sketchOnPlane('XY') as Sketch
					).extrude(SCREW_HOLE_DEPTH) as Solid;
					const positioned = screw.translate(cx + ox, cy + oy, 0) as Solid;
					holes = holes ? (holes.fuse(positioned) as Solid) : positioned;
				}
			}
		}
	}

	return holes;
}

export function buildBin(p: BinParams): Solid {
	const h = p.height * HEIGHT_UNIT;
	const bodyW = bodySize(p.width);
	const bodyL = bodySize(p.length);

	const gridOffsetX = ((p.width - 1) * GRID_UNIT) / 2;
	const gridOffsetY = ((p.length - 1) * GRID_UNIT) / 2;

	// 1. Grid of unit bases
	let base: Solid | null = null;
	for (let x = 0; x < p.width; x++) {
		for (let y = 0; y < p.length; y++) {
			const cx = x * GRID_UNIT - gridOffsetX;
			const cy = y * GRID_UNIT - gridOffsetY;
			const unit = buildUnitBase().translate(cx, cy, 0) as Solid;
			base = base ? (base.fuse(unit) as Solid) : unit;
		}
	}

	// 2. Floor connecting all bases at BASE_PROFILE_HEIGHT
	const floorThickness = 2.25;
	const floor = drawRoundedRectangle(bodyW, bodyL, CORNER_FILLET_RADIUS)
		.sketchOnPlane('XY', BASE_PROFILE_HEIGHT)
		.extrude(floorThickness) as Solid;

	let bin = base!.fuse(floor) as Solid;

	// 2b. Magnet/screw holes cut from bottom
	if (p.magnetHoles || p.screwHoles) {
		const holes = buildHoles(p, gridOffsetX, gridOffsetY);
		if (holes) {
			bin = bin.cut(holes) as Solid;
		}
	}

	// 3. Outer walls above base+floor
	const wallBottom = BASE_PROFILE_HEIGHT + floorThickness;
	const wallHeight = h - wallBottom;

	if (wallHeight <= 0) return bin;

	const outerWalls = drawRoundedRectangle(bodyW, bodyL, CORNER_FILLET_RADIUS)
		.sketchOnPlane('XY', wallBottom)
		.extrude(wallHeight) as Solid;

	// 4. Inner cavity
	const innerW = bodyW - 2 * WALL_THICKNESS;
	const innerL = bodyL - 2 * WALL_THICKNESS;
	const cavity = drawRoundedRectangle(innerW, innerL, INNER_FILLET_RADIUS)
		.sketchOnPlane('XY', wallBottom)
		.extrude(wallHeight) as Solid;

	const hollowWalls = outerWalls.cut(cavity) as Solid;
	return bin.fuse(hollowWalls) as Solid;
}
