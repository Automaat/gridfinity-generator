import {
	draw,
	drawCircle,
	drawPolysides,
	drawRoundedRectangle,
	makeCompound,
	type Solid,
	type Sketch
} from 'replicad';
import type { BinParams } from '$lib/stores/params';
import { dividerCoords, compartmentEdges } from './divider-layout';
import { HEX_RADIUS, HEX_CUT_OVERSHOOT, hexCells } from './hex-lattice';
import {
	BASE_PROFILE_HEIGHT,
	BASE_PROFILE_LEVELS,
	CORNER_FILLET_RADIUS,
	FLOOR_THICKNESS,
	GRID_UNIT,
	HEIGHT_UNIT,
	HOLE_OFFSETS,
	LABEL_TAB_DEPTH,
	LABEL_TAB_HEIGHT,
	MAGNET_HOLE_DEPTH,
	MAGNET_HOLE_DIAMETER,
	SCREW_HOLE_DEPTH,
	SCREW_HOLE_DIAMETER,
	bodySize,
	cellCenter,
	gridOffset,
	innerFillet,
	isOuterGridCorner,
	lipProfileHeight,
	lipProtrusion,
	profileSections,
	reducedLipCavityLevels,
	standardLipCavityLevels,
	type RectProfileLevel,
	type SquareProfileLevel
} from './gridfinity-spec';

function squareProfileSketch(level: SquareProfileLevel): Sketch {
	const l = level;
	return drawRoundedRectangle(l.size, l.size, l.r).sketchOnPlane('XY', l.z) as Sketch;
}

function rectProfileSketch(level: RectProfileLevel): Sketch {
	return drawRoundedRectangle(level.w, level.l, level.r).sketchOnPlane('XY', level.z) as Sketch;
}

export function buildUnitBase(): Solid {
	const sections = profileSections(BASE_PROFILE_LEVELS);
	const [lowerStart, lowerEnd] = sections.lowerChamfer;
	const [verticalStart, verticalEnd] = sections.vertical;
	const [upperStart, upperEnd] = sections.upperChamfer;

	// Loft section 1: z=0 → z=0.8 (bottom 45° chamfer)
	const chamfer1 = squareProfileSketch(lowerStart).loftWith(squareProfileSketch(lowerEnd), { ruled: true }) as Solid;

	// Extrude section 2: z=0.8 → z=2.6 (vertical walls, constant size)
	const vertical = squareProfileSketch(verticalStart).extrude(verticalEnd.z - verticalStart.z) as Solid;

	// Loft section 3: z=2.6 → z=4.75 (top 45° chamfer)
	const chamfer2 = squareProfileSketch(upperStart).loftWith(squareProfileSketch(upperEnd), { ruled: true }) as Solid;

	return chamfer1.fuse(vertical).fuse(chamfer2) as Solid;
}

function buildHoles(p: BinParams, gridOffsetX: number, gridOffsetY: number): Solid | null {
	// Each corner's magnet + screw holes are concentric (they overlap), so they
	// must be fused before cutting — cutting unfused overlapping tools leaves
	// artifacts. Corners never overlap each other, so the per-corner cutters are
	// gathered into one compound and removed in a single boolean: far cheaper
	// than fusing every cylinder pairwise (6×6 magnet+screw: ~2900ms → ~525ms).
	const cutters: Solid[] = [];

	for (let x = 0; x < p.width; x++) {
		for (let y = 0; y < p.length; y++) {
			const cx = x * GRID_UNIT - gridOffsetX;
			const cy = y * GRID_UNIT - gridOffsetY;

			for (const [ox, oy] of HOLE_OFFSETS) {
				let cutter: Solid | null = null;
				if (p.magnetHoles && (!p.magnetCornersOnly || isOuterGridCorner(p.width, p.length, x, y, ox, oy))) {
					const magnet = (
						drawCircle(MAGNET_HOLE_DIAMETER / 2).sketchOnPlane('XY') as Sketch
					).extrude(MAGNET_HOLE_DEPTH) as Solid;
					cutter = magnet.translate(cx + ox, cy + oy, 0) as Solid;
				}
				if (p.screwHoles) {
					const screw = (
						drawCircle(SCREW_HOLE_DIAMETER / 2).sketchOnPlane('XY') as Sketch
					).extrude(SCREW_HOLE_DEPTH) as Solid;
					const positioned = screw.translate(cx + ox, cy + oy, 0) as Solid;
					cutter = cutter ? (cutter.fuse(positioned) as Solid) : positioned;
				}
				if (cutter) cutters.push(cutter);
			}
		}
	}

	if (cutters.length === 0) return null;
	return makeCompound(cutters) as Solid;
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
		const sections = profileSections(standardLipCavityLevels(bodyW, bodyL, topZ));
		const [lowerStart, lowerEnd] = sections.lowerChamfer;
		const [verticalStart, verticalEnd] = sections.vertical;
		const [upperStart, upperEnd] = sections.upperChamfer;

		// Build cavity as 3 sections matching base profile construction
		const c1 = rectProfileSketch(lowerStart).loftWith(rectProfileSketch(lowerEnd), { ruled: true }) as Solid;
		const c2 = rectProfileSketch(verticalStart).extrude(verticalEnd.z - verticalStart.z) as Solid;
		const c3 = rectProfileSketch(upperStart).loftWith(rectProfileSketch(upperEnd), { ruled: true }) as Solid;

		const cavity = c1.fuse(c2).fuse(c3) as Solid;
		return outer.cut(cavity) as Solid;
	} else {
		// Reduced lip — single chamfer section
		const [bottomLevel, topLevel] = reducedLipCavityLevels(bodyW, bodyL, topZ, lipHeight);
		const bottomSketch = rectProfileSketch(bottomLevel);
		const topSketch = rectProfileSketch(topLevel);

		const cavity = bottomSketch.loftWith(topSketch, { ruled: true }) as Solid;
		return outer.cut(cavity) as Solid;
	}
}

// Punch the shared flat-top hex lattice through a divider wall. `drawPolysides(R, 6)`
// without rotation is the flat-top hexagon matching hex-lattice's hexPolygon().
function cutHexPattern(
	wall: Solid,
	faceWidth: number,
	faceHeight: number,
	wallThickness: number,
	plane: 'YZ' | 'XZ',
	wallBottom: number
): Solid {
	const cells = hexCells(faceWidth, faceHeight);
	if (cells.length === 0) return wall;

	// Oversize the cutter past both wall faces — coincident faces make the
	// OCCT boolean leave the wall uncut (no through-hole forms).
	const cutDepth = wallThickness + 2 * HEX_CUT_OVERSHOOT;

	const cutters = cells.map(({ u, v }) => {
		const zCenter = wallBottom + faceHeight / 2 + v;
		const hex = (drawPolysides(HEX_RADIUS, 6).sketchOnPlane(plane, -cutDepth / 2) as Sketch).extrude(cutDepth) as Solid;
		return plane === 'YZ' ? (hex.translate(0, u, zCenter) as Solid) : (hex.translate(u, 0, zCenter) as Solid);
	});

	// Single compound cut instead of fusing every hex first.
	return wall.cut(makeCompound(cutters) as Solid) as Solid;
}

function buildDividers(
	p: BinParams,
	innerW: number,
	innerL: number,
	wallBottom: number,
	wallHeight: number
): Solid | null {
	let dividers: Solid | null = null;

	// X dividers: walls parallel to Y axis, at each resolved position across width
	for (const xPos of dividerCoords(p.dividersX, p.dividerPosX, innerW)) {
		let wall = (
			drawRoundedRectangle(p.wallThickness, innerL, 0).sketchOnPlane('XY', wallBottom) as Sketch
		).extrude(wallHeight) as Solid;
		if (p.lightweightDividers) {
			wall = cutHexPattern(wall, innerL, wallHeight, p.wallThickness, 'YZ', wallBottom);
		}
		const positioned = wall.translate(xPos, 0, 0) as Solid;
		dividers = dividers ? (dividers.fuse(positioned) as Solid) : positioned;
	}

	// Y dividers: walls parallel to X axis, at each resolved position across length
	for (const yPos of dividerCoords(p.dividersY, p.dividerPosY, innerL)) {
		let wall = (
			drawRoundedRectangle(innerW, p.wallThickness, 0).sketchOnPlane('XY', wallBottom) as Sketch
		).extrude(wallHeight) as Solid;
		if (p.lightweightDividers) {
			wall = cutHexPattern(wall, innerW, wallHeight, p.wallThickness, 'XZ', wallBottom);
		}
		const positioned = wall.translate(0, yPos, 0) as Solid;
		dividers = dividers ? (dividers.fuse(positioned) as Solid) : positioned;
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
	// One tab per compartment, spanning between consecutive walls/dividers.
	const edges = compartmentEdges(dividerCoords(p.dividersX, p.dividerPosX, innerW), innerW);
	const frontY = innerL / 2; // front face (+Y side)

	let tabs: Solid | null = null;

	for (let i = 0; i < edges.length - 1; i++) {
		const e0 = edges[i]!;
		const e1 = edges[i + 1]!;
		const cx = (e0 + e1) / 2;
		const tabW = e1 - e0 - (i > 0 ? p.wallThickness : 0);
		if (tabW < 1) continue; // compartment too narrow for a usable tab

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
	const xEdges = compartmentEdges(dividerCoords(p.dividersX, p.dividerPosX, innerW), innerW);
	const yEdges = compartmentEdges(dividerCoords(p.dividersY, p.dividerPosY, innerL), innerL);

	const autoR = wallHeight / 2;
	const R = p.scoopRadius > 0 ? Math.min(p.scoopRadius, wallHeight) : autoR;
	if (R < 2) return null;

	let scoops: Solid | null = null;

	for (let ix = 0; ix < xEdges.length - 1; ix++) {
		for (let iy = 0; iy < yEdges.length - 1; iy++) {
			const xStart = xEdges[ix]!;
			const yStart = yEdges[iy]!;
			const compartmentW = xEdges[ix + 1]! - xStart;
			const compartmentL = yEdges[iy + 1]! - yStart;

			for (const wall of p.scoopWalls) {
				let ramp: Solid;
				switch (wall) {
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
				}
				scoops = scoops ? (scoops.fuse(ramp!) as Solid) : ramp!;
			}
		}
	}

	return scoops;
}

function buildWallCut(
	p: BinParams,
	bodyW: number,
	bodyL: number,
	wallBottom: number,
	wallHeight: number,
	lipExtension: number
): Solid {
	// Diagonal planar cut: walls/dividers stay full height on one side and
	// slope down to `wallCutLowFraction` of wall height on the opposite side.
	const margin = 1; // overshoot footprint so outer walls cut cleanly through
	const topMostZ = wallBottom + wallHeight + lipExtension;
	const ceilingZ = topMostZ + 5;
	const lowZ = wallBottom + wallHeight * p.wallCutLowFraction;

	const axis: 'Y' | 'X' =
		p.wallCutSide === 'front' || p.wallCutSide === 'back' ? 'Y' : 'X';
	// Slope descends toward the selected side; opposite side keeps full height.
	const lowAtPositive = p.wallCutSide === 'front' || p.wallCutSide === 'right';

	const spanHalf = (axis === 'Y' ? bodyL : bodyW) / 2 + margin;
	const crossHalf = (axis === 'Y' ? bodyW : bodyL) / 2 + margin;
	const lowS = lowAtPositive ? spanHalf : -spanHalf;
	const highS = lowAtPositive ? -spanHalf : spanHalf;
	const plane = axis === 'Y' ? 'YZ' : 'XZ';

	// Slope descends over `wallCutRun` of the span from the high side, then runs
	// flat at lowZ to the low edge (base-only beyond the slope when lowZ is the
	// floor). Polygon = everything above that profile, capped at the ceiling.
	const slopeEndS = highS + p.wallCutRun * (lowS - highS);

	const pen = draw([highS, topMostZ]).lineTo([slopeEndS, lowZ]);
	const withFlat = p.wallCutRun < 1 ? pen.lineTo([lowS, lowZ]) : pen;

	return withFlat
		.lineTo([lowS, ceilingZ])
		.lineTo([highS, ceilingZ])
		.close()
		.sketchOnPlane(plane, -crossHalf)
		.extrude(2 * crossHalf) as Solid;
}

export function buildBin(p: BinParams): Solid {
	const h = p.height * HEIGHT_UNIT;
	const bodyW = bodySize(p.width);
	const bodyL = bodySize(p.length);
	const cavityFillet = innerFillet(p.wallThickness);

	const gridOffsetX = gridOffset(p.width);
	const gridOffsetY = gridOffset(p.length);

	// 1. Grid of unit bases. Every cell is the same lofted foot, so build it once
	// and clone+translate per cell — reconstructing the loft per cell costs
	// ~50-65% more on multi-unit grids (4×4 base: 1377ms → 521ms).
	let base: Solid | null = null;
	const unitProto = buildUnitBase();
	for (let x = 0; x < p.width; x++) {
		for (let y = 0; y < p.length; y++) {
			const cx = cellCenter(x, p.width);
			const cy = cellCenter(y, p.length);
			const unit = (unitProto.clone() as Solid).translate(cx, cy, 0) as Solid;
			base = base ? (base.fuse(unit) as Solid) : unit;
		}
	}

	// 2. Floor connecting all bases at BASE_PROFILE_HEIGHT
	const floor = drawRoundedRectangle(bodyW, bodyL, CORNER_FILLET_RADIUS)
		.sketchOnPlane('XY', BASE_PROFILE_HEIGHT)
		.extrude(FLOOR_THICKNESS) as Solid;

	let bin = base!.fuse(floor) as Solid;

	// 2b. Magnet/screw holes cut from bottom
	if (p.magnetHoles || p.screwHoles) {
		const holes = buildHoles(p, gridOffsetX, gridOffsetY);
		if (holes) {
			bin = bin.cut(holes) as Solid;
		}
	}

	// 3. Lip + wall dimensions. Walls fill the full nominal height; the stacking
	// lip protrudes above it (gridfinity-rebuilt convention), so a lipped bin's
	// total height is units×7 + lipProtrusion.
	const lipHeight = lipProfileHeight(p.stackingLip);
	const protrusion = lipProtrusion(p.stackingLip);

	const wallBottom = BASE_PROFILE_HEIGHT + FLOOR_THICKNESS;
	const wallHeight = h - wallBottom;

	if (wallHeight <= 0) return bin;

	// 4. Outer walls + inner cavity → hollow walls
	const outerWalls = drawRoundedRectangle(bodyW, bodyL, CORNER_FILLET_RADIUS)
		.sketchOnPlane('XY', wallBottom)
		.extrude(wallHeight) as Solid;

	const innerW = bodyW - 2 * p.wallThickness;
	const innerL = bodyL - 2 * p.wallThickness;
	const cavity = drawRoundedRectangle(innerW, innerL, cavityFillet)
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
	if (p.scoopWalls.length > 0 && wallHeight > 2) {
		const scoops = buildScoops(p, innerW, innerL, wallBottom, wallHeight);
		if (scoops) bin = bin.fuse(scoops) as Solid;
	}

	// 6. Label tabs
	if (p.labelTab && wallHeight >= LABEL_TAB_HEIGHT / 2) {
		const tabs = buildLabelTabs(p, innerW, innerL, wallBottom, wallHeight);
		if (tabs) bin = bin.fuse(tabs) as Solid;
	}

	// 7. Stacking lip — protrudes above the wall; its base overlaps the rim as a support.
	if (lipHeight > 0) {
		const lipBaseZ = h + protrusion - lipHeight;
		const lip = buildStackingLip(bodyW, bodyL, lipBaseZ, lipHeight);
		bin = bin.fuse(lip) as Solid;
	}

	// 8. Diagonal wall cut (slope walls/dividers down toward one side)
	if (p.wallCut) {
		const cut = buildWallCut(p, bodyW, bodyL, wallBottom, wallHeight, protrusion);
		bin = bin.cut(cut) as Solid;
	}

	return bin;
}
