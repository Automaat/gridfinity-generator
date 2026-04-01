import { draw, drawCircle, drawRoundedRectangle, type Solid, type Sketch } from 'replicad';
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

// Magnet/screw holes — 4 per grid unit at corners
const MAGNET_HOLE_DIAMETER = 6.5;
const MAGNET_HOLE_DEPTH = 2.4;
const SCREW_HOLE_DIAMETER = 3;
const SCREW_HOLE_DEPTH = 6;
const HOLE_DISTANCE_FROM_EDGE = 8; // mm from each side

// Stacking lip profile offsets (from body edge, per side)
// These mirror the base profile to create a mating female cavity
const LIP_OFFSET_BOTTOM = 2.95; // at lip bottom: body shrinks by 2.95 per side
const LIP_OFFSET_MID = 0.8; // at mid levels: body shrinks by 0.8 per side
// at lip top: offset 0 (flush with body)

// Label tab dimensions
const LABEL_TAB_HEIGHT = 14;
const LABEL_TAB_DEPTH = 4.5;

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
		drawRoundedRectangle(levels[1].size, levels[1].size, levels[1].r).sketchOnPlane(
			'XY',
			levels[1].z
		) as Sketch
	).extrude(levels[2].z - levels[1].z) as Solid;

	// Loft section 3: z=2.6 → z=4.75 (top 45° chamfer)
	const chamfer2 = sketchAt(2).loftWith(sketchAt(3), { ruled: true }) as Solid;

	return chamfer1.fuse(vertical).fuse(chamfer2) as Solid;
}

function buildHoles(p: BinParams, gridOffsetX: number, gridOffsetY: number): Solid | null {
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

function buildStackingLip(
	bodyW: number,
	bodyL: number,
	topZ: number,
	lipHeight: number
): Solid {
	// Outer shell = full bin footprint
	const outer = drawRoundedRectangle(bodyW, bodyL, CORNER_FILLET_RADIUS)
		.sketchOnPlane('XY', topZ)
		.extrude(lipHeight) as Solid;

	// Inner cavity mirrors the base profile (female mate)
	// Offsets from body edge at each level:
	// lip bottom (topZ): 2.95mm inward per side
	// topZ + 0.8: 0.8mm inward (45° chamfer transition)
	// topZ + 2.6: 0.8mm inward (vertical section)
	// lip top (topZ + 4.75): 0mm (flush with body)
	//
	// For reduced lip (2.15mm), only the top chamfer portion:
	// topZ: 0.8mm inward
	// topZ + 2.15: 0mm (flush)

	if (lipHeight >= BASE_PROFILE_HEIGHT) {
		// Standard full lip
		const cavityLevels = [
			{
				z: topZ,
				w: bodyW - 2 * LIP_OFFSET_BOTTOM,
				l: bodyL - 2 * LIP_OFFSET_BOTTOM,
				r: Math.max(0.2, CORNER_FILLET_RADIUS - LIP_OFFSET_BOTTOM)
			},
			{
				z: topZ + 0.8,
				w: bodyW - 2 * LIP_OFFSET_MID,
				l: bodyL - 2 * LIP_OFFSET_MID,
				r: Math.max(0.2, CORNER_FILLET_RADIUS - LIP_OFFSET_MID)
			},
			{
				z: topZ + 2.6,
				w: bodyW - 2 * LIP_OFFSET_MID,
				l: bodyL - 2 * LIP_OFFSET_MID,
				r: Math.max(0.2, CORNER_FILLET_RADIUS - LIP_OFFSET_MID)
			},
			{ z: topZ + BASE_PROFILE_HEIGHT, w: bodyW, l: bodyL, r: CORNER_FILLET_RADIUS }
		];

		function cavitySketchAt(idx: number): Sketch {
			const l = cavityLevels[idx];
			return drawRoundedRectangle(l.w, l.l, l.r).sketchOnPlane('XY', l.z) as Sketch;
		}

		// Build cavity as 3 sections matching base profile construction
		const c1 = cavitySketchAt(0).loftWith(cavitySketchAt(1), { ruled: true }) as Solid;
		const c2 = (
			drawRoundedRectangle(
				cavityLevels[1].w,
				cavityLevels[1].l,
				cavityLevels[1].r
			).sketchOnPlane('XY', cavityLevels[1].z) as Sketch
		).extrude(cavityLevels[2].z - cavityLevels[1].z) as Solid;
		const c3 = cavitySketchAt(2).loftWith(cavitySketchAt(3), { ruled: true }) as Solid;

		const cavity = c1.fuse(c2).fuse(c3) as Solid;
		return outer.cut(cavity) as Solid;
	} else {
		// Reduced lip — single chamfer section
		const bottomLevel = {
			w: bodyW - 2 * LIP_OFFSET_MID,
			l: bodyL - 2 * LIP_OFFSET_MID,
			r: Math.max(0.2, CORNER_FILLET_RADIUS - LIP_OFFSET_MID)
		};
		const bottomSketch = drawRoundedRectangle(
			bottomLevel.w,
			bottomLevel.l,
			bottomLevel.r
		).sketchOnPlane('XY', topZ) as Sketch;
		const topSketch = drawRoundedRectangle(bodyW, bodyL, CORNER_FILLET_RADIUS).sketchOnPlane(
			'XY',
			topZ + lipHeight
		) as Sketch;

		const cavity = bottomSketch.loftWith(topSketch, { ruled: true }) as Solid;
		return outer.cut(cavity) as Solid;
	}
}

function buildDividers(
	p: BinParams,
	innerW: number,
	innerL: number,
	wallBottom: number,
	wallHeight: number
): Solid | null {
	let dividers: Solid | null = null;

	// X dividers: walls parallel to Y axis, evenly spaced across inner width
	if (p.dividersX > 0) {
		const spacing = innerW / (p.dividersX + 1);
		for (let i = 1; i <= p.dividersX; i++) {
			const xPos = -innerW / 2 + i * spacing;
			const wall = (
				drawRoundedRectangle(p.wallThickness, innerL, 0).sketchOnPlane(
					'XY',
					wallBottom
				) as Sketch
			).extrude(wallHeight) as Solid;
			const positioned = wall.translate(xPos, 0, 0) as Solid;
			dividers = dividers ? (dividers.fuse(positioned) as Solid) : positioned;
		}
	}

	// Y dividers: walls parallel to X axis, evenly spaced across inner length
	if (p.dividersY > 0) {
		const spacing = innerL / (p.dividersY + 1);
		for (let i = 1; i <= p.dividersY; i++) {
			const yPos = -innerL / 2 + i * spacing;
			const wall = (
				drawRoundedRectangle(innerW, p.wallThickness, 0).sketchOnPlane(
					'XY',
					wallBottom
				) as Sketch
			).extrude(wallHeight) as Solid;
			const positioned = wall.translate(0, yPos, 0) as Solid;
			dividers = dividers ? (dividers.fuse(positioned) as Solid) : positioned;
		}
	}

	return dividers;
}

function buildLabelTabs(
	p: BinParams,
	innerW: number,
	innerL: number,
	wallBottom: number,
	wallHeight: number
): Solid | null {
	const topZ = wallBottom + wallHeight;
	const tabHeight = Math.min(LABEL_TAB_HEIGHT, wallHeight);
	const tabDepth = Math.min(LABEL_TAB_DEPTH, innerL - 1);
	const numCompartments = p.dividersX + 1;
	const compartmentW = innerW / numCompartments;
	const frontY = innerL / 2; // front face (+Y side)

	let tabs: Solid | null = null;

	for (let i = 0; i < numCompartments; i++) {
		const cx = -innerW / 2 + compartmentW / 2 + i * compartmentW;
		const tabW = compartmentW - (i > 0 ? p.wallThickness : 0);

		// Triangle cross-section in YZ plane: right triangle
		// top-front corner → top-back (inward) → bottom-front → close
		const profile = draw([0, 0])
			.lineTo([-tabDepth, 0])
			.lineTo([0, -tabHeight])
			.close()
			.sketchOnPlane('YZ', cx - tabW / 2) as Sketch;

		const tab = profile.extrude(tabW) as Solid;
		const positioned = tab.translate(0, frontY, topZ) as Solid;
		tabs = tabs ? (tabs.fuse(positioned) as Solid) : positioned;
	}

	return tabs;
}

function buildSingleScoop(
	R: number,
	extrudeLen: number,
	wallPos: number,
	wallBottom: number,
	extrudeStart: number,
	axis: 'X' | 'Y',
	flip: boolean
): Solid {
	// Quarter-circle ramp: block in floor-wall corner, cylinder subtracted.
	// axis='X': scoop along a Y-wall (back/front), extrude in X
	// axis='Y': scoop along an X-wall (left/right), extrude in Y
	// flip=false: ramp extends from wallPos toward +axis (back/left)
	// flip=true: ramp extends from wallPos toward -axis (front/right)
	const dir = flip ? -1 : 1;
	const blockW = axis === 'X' ? extrudeLen : R;
	const blockL = axis === 'X' ? R : extrudeLen;

	const block = (
		drawRoundedRectangle(blockW, blockL, 0).sketchOnPlane('XY', wallBottom) as Sketch
	).extrude(R) as Solid;

	const blockX = axis === 'X' ? extrudeStart + extrudeLen / 2 : wallPos + (dir * R) / 2;
	const blockY = axis === 'X' ? wallPos + (dir * R) / 2 : extrudeStart + extrudeLen / 2;
	const blockPos = block.translate(blockX, blockY, 0) as Solid;

	const plane = axis === 'X' ? 'YZ' : 'XZ';
	const cyl = (
		drawCircle(R).sketchOnPlane(plane, extrudeStart) as Sketch
	).extrude(extrudeLen) as Solid;

	const cylX = axis === 'X' ? 0 : wallPos + dir * R;
	const cylY = axis === 'X' ? wallPos + dir * R : 0;
	const cylPos = cyl.translate(cylX, cylY, wallBottom + R) as Solid;

	return blockPos.cut(cylPos) as Solid;
}

function buildScoops(
	p: BinParams,
	innerW: number,
	innerL: number,
	wallBottom: number,
	wallHeight: number
): Solid | null {
	const numX = p.dividersX + 1;
	const numY = p.dividersY + 1;
	const compartmentW = innerW / numX;
	const compartmentL = innerL / numY;

	const autoR = wallHeight / 2;
	const R = p.scoopRadius > 0 ? Math.min(p.scoopRadius, wallHeight) : autoR;
	if (R < 2) return null;

	let scoops: Solid | null = null;

	for (let ix = 0; ix < numX; ix++) {
		for (let iy = 0; iy < numY; iy++) {
			const xStart = -innerW / 2 + ix * compartmentW;
			const yStart = -innerL / 2 + iy * compartmentL;
			let ramp: Solid;

			switch (p.scoopWall) {
				case 'back':
					ramp = buildSingleScoop(R, compartmentW, yStart, wallBottom, xStart, 'X', false);
					break;
				case 'front':
					ramp = buildSingleScoop(R, compartmentW, yStart + compartmentL, wallBottom, xStart, 'X', true);
					break;
				case 'left':
					ramp = buildSingleScoop(R, compartmentL, xStart, wallBottom, yStart, 'Y', false);
					break;
				case 'right':
					ramp = buildSingleScoop(R, compartmentL, xStart + compartmentW, wallBottom, yStart, 'Y', true);
					break;
				default:
					return null;
			}

			scoops = scoops ? (scoops.fuse(ramp) as Solid) : ramp;
		}
	}

	return scoops;
}

export function buildBin(p: BinParams): Solid {
	const h = p.height * HEIGHT_UNIT;
	const bodyW = bodySize(p.width);
	const bodyL = bodySize(p.length);
	const innerFillet = Math.max(0.2, CORNER_FILLET_RADIUS - p.wallThickness);

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

	// 3. Compute lip height and wall dimensions
	const lipHeight =
		p.stackingLip === 'standard'
			? BASE_PROFILE_HEIGHT
			: p.stackingLip === 'reduced'
				? 2.15
				: 0;

	const wallBottom = BASE_PROFILE_HEIGHT + floorThickness;
	const wallHeight = h - wallBottom - lipHeight;

	if (wallHeight <= 0) return bin;

	// 4. Outer walls + inner cavity → hollow walls
	const outerWalls = drawRoundedRectangle(bodyW, bodyL, CORNER_FILLET_RADIUS)
		.sketchOnPlane('XY', wallBottom)
		.extrude(wallHeight) as Solid;

	const innerW = bodyW - 2 * p.wallThickness;
	const innerL = bodyL - 2 * p.wallThickness;
	const cavity = drawRoundedRectangle(innerW, innerL, innerFillet)
		.sketchOnPlane('XY', wallBottom)
		.extrude(wallHeight) as Solid;

	const hollowWalls = outerWalls.cut(cavity) as Solid;
	bin = bin.fuse(hollowWalls) as Solid;

	// 5. Compartment dividers
	if (p.dividersX > 0 || p.dividersY > 0) {
		const dividers = buildDividers(p, innerW, innerL, wallBottom, wallHeight);
		if (dividers) bin = bin.fuse(dividers) as Solid;
	}

	// 5b. Bottom scoops (fuse ramp into bin)
	if (p.scoopWall !== 'none' && wallHeight > 2) {
		const scoops = buildScoops(p, innerW, innerL, wallBottom, wallHeight);
		if (scoops) bin = bin.fuse(scoops) as Solid;
	}

	// 6. Label tabs
	if (p.labelTab && wallHeight >= LABEL_TAB_HEIGHT / 2) {
		const tabs = buildLabelTabs(p, innerW, innerL, wallBottom, wallHeight);
		if (tabs) bin = bin.fuse(tabs) as Solid;
	}

	// 7. Stacking lip
	if (lipHeight > 0) {
		const lipTopZ = wallBottom + wallHeight;
		const lip = buildStackingLip(bodyW, bodyL, lipTopZ, lipHeight);
		bin = bin.fuse(lip) as Solid;
	}

	return bin;
}
