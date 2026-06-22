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
import {
	dividerWallLayouts,
	holeLayouts,
	interiorBox,
	labelTabLayouts,
	scoopLayouts,
	scoopPrimitiveLayout,
	type DividerWallAxis,
	type HolePart,
	type ScoopLayout,
	wallCutLayout
} from './divider-layout';
import { HEX_RADIUS, hexPanelCutters, type HexPanelAxis, type HexPanelCutter } from './hex-lattice';
import {
	BASE_PROFILE_HEIGHT,
	BASE_PROFILE_LEVELS,
	CORNER_FILLET_RADIUS,
	FLOOR_THICKNESS,
	LABEL_TAB_HEIGHT,
	MAGNET_HOLE_DEPTH,
	MAGNET_HOLE_DIAMETER,
	SCREW_HOLE_DEPTH,
	SCREW_HOLE_DIAMETER,
	cellCenter,
	innerFillet,
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

function buildHolePart(part: HolePart): Solid {
	const radius = part === 'magnet' ? MAGNET_HOLE_DIAMETER / 2 : SCREW_HOLE_DIAMETER / 2;
	const depth = part === 'magnet' ? MAGNET_HOLE_DEPTH : SCREW_HOLE_DEPTH;
	return (drawCircle(radius).sketchOnPlane('XY') as Sketch).extrude(depth) as Solid;
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

function buildHoles(p: BinParams): Solid | null {
	// Each corner's magnet + screw holes are concentric (they overlap), so they
	// must be fused before cutting — cutting unfused overlapping tools leaves
	// artifacts. Corners never overlap each other, so the per-corner cutters are
	// gathered into one compound and removed in a single boolean: far cheaper
	// than fusing every cylinder pairwise (6×6 magnet+screw: ~2900ms → ~525ms).
	const cutters: Solid[] = [];

	for (const layout of holeLayouts(p)) {
		let cutter: Solid | null = null;
		for (const part of layout.parts) {
			const positioned = buildHolePart(part).translate(layout.x, layout.y, 0) as Solid;
			cutter = cutter ? (cutter.fuse(positioned) as Solid) : positioned;
		}
		if (cutter) cutters.push(cutter);
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
function buildHexCutter(axis: HexPanelAxis, cutter: HexPanelCutter): Solid {
	if (axis === 'X') {
		const hex = (drawPolysides(HEX_RADIUS, 6).sketchOnPlane('YZ', cutter.x) as Sketch).extrude(cutter.cutDepth) as Solid;
		return hex.translate(0, cutter.y, cutter.z) as Solid;
	}
	const hex = (drawPolysides(HEX_RADIUS, 6).sketchOnPlane('XZ', cutter.y) as Sketch).extrude(cutter.cutDepth) as Solid;
	return hex.translate(cutter.x, 0, cutter.z) as Solid;
}

function cutHexPattern(
	wall: Solid,
	faceWidth: number,
	faceHeight: number,
	wallThickness: number,
	axis: DividerWallAxis,
	wallBottom: number
): Solid {
	const cutters = hexPanelCutters(axis, faceWidth, faceHeight, wallThickness, 0, 0, wallBottom + faceHeight / 2).map((cutter) => buildHexCutter(axis, cutter));
	if (cutters.length === 0) return wall;

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

	for (const layout of dividerWallLayouts(p, innerW, innerL, wallBottom, wallHeight)) {
		let wall = (
			drawRoundedRectangle(layout.width, layout.length, 0).sketchOnPlane('XY', layout.z) as Sketch
		).extrude(layout.height) as Solid;
		if (p.lightweightDividers) {
			wall = cutHexPattern(wall, layout.faceWidth, layout.height, layout.thickness, layout.axis, layout.z);
		}
		const positioned = wall.translate(layout.x, layout.y, 0) as Solid;
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
	const layouts = labelTabLayouts(p, innerW, innerL, wallBottom, wallHeight);
	let tabs: Solid | null = null;

	for (const layout of layouts) {
		const [start, ...rest] = layout.profile;
		let drawing = draw(start);
		for (const point of rest) {
			drawing = drawing.lineTo(point);
		}
		const profile = drawing.close().sketchOnPlane('YZ', layout.xStart) as Sketch;
		const tab = profile.extrude(layout.width) as Solid;
		const positioned = tab.translate(0, layout.frontY, layout.topZ) as Solid;
		tabs = tabs ? (tabs.fuse(positioned) as Solid) : positioned;
	}

	return tabs;
}

function buildSingleScoop(
	layout: ScoopLayout,
	wallBottom: number
): Solid {
	// Quarter-circle ramp: block in floor-wall corner, cylinder subtracted.
	// axis='X': scoop along a Y-wall (back/front), extrude in X
	// axis='Y': scoop along an X-wall (left/right), extrude in Y
	// flip=false: ramp extends from wallPos toward +axis (back/left)
	// flip=true: ramp extends from wallPos toward -axis (front/right)
	const primitive = scoopPrimitiveLayout(layout, wallBottom);

	const block = (
		drawRoundedRectangle(primitive.blockW, primitive.blockL, 0).sketchOnPlane('XY', primitive.blockZ) as Sketch
	).extrude(primitive.radius) as Solid;

	const blockPos = block.translate(primitive.blockX, primitive.blockY, 0) as Solid;

	const cyl = (
		drawCircle(primitive.radius).sketchOnPlane(primitive.cylinderPlane, primitive.cylinderAlongStart) as Sketch
	).extrude(primitive.extrudeLen) as Solid;
	const cylPos =
		primitive.axis === 'X'
			? (cyl.translate(0, primitive.cylinderCrossPos, primitive.cylinderZ) as Solid)
			: (cyl.translate(primitive.cylinderCrossPos, 0, primitive.cylinderZ) as Solid);

	return blockPos.cut(cylPos) as Solid;
}

function buildScoops(
	p: BinParams,
	innerW: number,
	innerL: number,
	wallBottom: number,
	wallHeight: number
): Solid | null {
	const layouts = scoopLayouts(p, innerW, innerL, wallHeight);
	if (layouts.length === 0) return null;

	let scoops: Solid | null = null;

	for (const layout of layouts) {
		const ramp = buildSingleScoop(layout, wallBottom);
		scoops = scoops ? (scoops.fuse(ramp) as Solid) : ramp;
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
	const { axis, crossHalf, points } = wallCutLayout(p, bodyW, bodyL, wallBottom, wallHeight, lipExtension);
	const plane = axis === 'Y' ? 'YZ' : 'XZ';

	const start = points[0];
	/* v8 ignore next */
	if (!start) throw new Error('wall cut layout must include at least one profile point');
	let cutter = draw(start);
	for (const point of points.slice(1)) {
		cutter = cutter.lineTo(point);
	}

	return cutter
		.close()
		.sketchOnPlane(plane, -crossHalf)
		.extrude(2 * crossHalf) as Solid;
}

export function buildBin(p: BinParams): Solid {
	const { bodyW, bodyL, innerW, innerL, wallBottom, wallHeight, topZ } = interiorBox(p);
	const cavityFillet = innerFillet(p.wallThickness);

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
		const holes = buildHoles(p);
		if (holes) {
			bin = bin.cut(holes) as Solid;
		}
	}

	// 3. Lip + wall dimensions. Walls fill the full nominal height; the stacking
	// lip protrudes above it (gridfinity-rebuilt convention), so a lipped bin's
	// total height is units×7 + lipProtrusion.
	const lipHeight = lipProfileHeight(p.stackingLip);
	const protrusion = lipProtrusion(p.stackingLip);

	if (wallHeight <= 0) return bin;

	// 4. Outer walls + inner cavity → hollow walls
	const outerWalls = drawRoundedRectangle(bodyW, bodyL, CORNER_FILLET_RADIUS)
		.sketchOnPlane('XY', wallBottom)
		.extrude(wallHeight) as Solid;

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
		const lipBaseZ = topZ + protrusion - lipHeight;
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
