// Native manifold-3d bin geometry — the fast preview/STL path. Mirrors the spec
// math in gridfinity.ts (the OCCT path kept for STEP export) but builds with
// manifold mesh CSG: ~3-5× faster rebuilds and a ~0.2MB engine vs OCCT's 4.6MB.
//
// Parity with gridfinity.ts is verified by volume + bounding box (manifold-parity
// harness). Shared Gridfinity spec values live in gridfinity-spec.ts.
import type { BinParams } from '$lib/stores/params';
import type { ManifoldToplevel, Manifold } from 'manifold-3d';
import {
	dividerCoords,
	holeLayouts,
	interiorBox,
	labelTabLayouts,
	scoopLayouts,
	scoopPrimitiveLayout,
	type HolePart,
	type ScoopLayout,
	wallCutLayout
} from './divider-layout';
import { hexPanelCutters, hexPolygon, type HexPanelCutter } from './hex-lattice';
import { ensureCounterClockwise } from './polygon';
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
	type ProfilePair,
	type RectProfileLevel,
	type SquareProfileLevel
} from './gridfinity-spec';

export {
	BASE_PROFILE_HEIGHT,
	CORNER_FILLET_RADIUS,
	GRID_UNIT,
	HOLE_DISTANCE_FROM_EDGE,
	MAGNET_HOLE_DEPTH,
	MAGNET_HOLE_DIAMETER,
	SCREW_HOLE_DEPTH,
	SCREW_HOLE_DIAMETER,
	TOLERANCE
} from './gridfinity-spec';

// Circle/arc tessellation. 32 segments keeps holes and corner fillets smooth at
// screen scale for the preview; exports pass a higher count via buildBinManifold.
const PREVIEW_SEGMENTS = 32;
let circleSegments = PREVIEW_SEGMENTS;

let M: ManifoldToplevel | null = null;
export function setBinManifold(m: ManifoldToplevel): void {
	M = m;
}
export function oc(): ManifoldToplevel {
	if (!M) throw new Error('manifold engine not initialized — call setBinManifold first');
	return M;
}

// Tessellation count for circles/arcs is shared module state (read by roundedRectCS,
// cylinders, etc). The baseplate builder sets it the same way the bin builder does.
export function setSegments(n: number): void {
	circleSegments = n;
}

// A rounded rectangle cross-section centered at the origin (w×l, corner radius r).
// Built by shrinking the rect by r then offsetting outward with round joins, so
// the final outer dimensions are exactly w×l (matches replicad drawRoundedRectangle).
function roundedRectCS(w: number, l: number, r: number) {
	const { CrossSection } = oc();
	if (r <= 0) return CrossSection.square([w, l], true);
	const quarter = Math.max(1, Math.round(circleSegments / 4));
	return CrossSection.square([w - 2 * r, l - 2 * r], true).offset(r, 'Round', 2, quarter * 4);
}

// Rounded-rectangle prism, base resting at z.
export function roundedPrism(w: number, l: number, r: number, height: number, z: number): Manifold {
	return oc().Manifold.extrude(roundedRectCS(w, l, r), height).translate([0, 0, z]);
}

// Ruled loft between two stacked rounded rects = convex hull of two thin slabs.
// Both cross-sections are convex, so the hull is exactly the ruled transition
// that replicad's loftWith({ ruled: true }) produces.
function chamfer(
	wA: number, lA: number, rA: number, zA: number,
	wB: number, lB: number, rB: number, zB: number
): Manifold {
	const eps = 0.001;
	const a = roundedPrism(wA, lA, rA, eps, zA);
	const b = roundedPrism(wB, lB, rB, eps, zB - eps);
	return oc().Manifold.hull([a, b]);
}

// Axis-aligned box centered in X/Y at (cx, cy), bottom resting at zBase.
export function box(w: number, l: number, h: number, cx: number, cy: number, zBase: number): Manifold {
	return oc().Manifold.cube([w, l, h]).translate([cx - w / 2, cy - l / 2, zBase]);
}

// A prism whose cross-section lies in a world plane, extruded along world X or Y.
// Both use proper rotations (no mirroring) so the section shape is preserved, and
// each spans its axis [0, length]. `ptsYZ`/`ptsXZ` are world-plane points.
//   X: section→(-Z, Y) then rotate([0,90,0]) ⇒ extrude→+X
//   Y: section→(X, Z) then rotate([90,0,0])+shift ⇒ extrude→+Y
export function prismAlongX(ptsYZ: [number, number][], length: number): Manifold {
	const cs = new (oc().CrossSection)(ensureCounterClockwise(ptsYZ.map(([y, z]) => [-z, y])));
	return oc().Manifold.extrude(cs, length).rotate([0, 90, 0]);
}
export function prismAlongY(ptsXZ: [number, number][], length: number): Manifold {
	const cs = new (oc().CrossSection)(ensureCounterClockwise(ptsXZ.map(([x, z]) => [x, z])));
	return oc().Manifold.extrude(cs, length).rotate([90, 0, 0]).translate([0, length, 0]);
}
function cylinderAlongX(radius: number, length: number): Manifold {
	return oc().Manifold.cylinder(length, radius, radius, circleSegments).rotate([0, 90, 0]);
}
function cylinderAlongY(radius: number, length: number): Manifold {
	return oc().Manifold.cylinder(length, radius, radius, circleSegments).rotate([-90, 0, 0]);
}

function squareChamfer([a, b]: ProfilePair<SquareProfileLevel>): Manifold {
	return chamfer(a.size, a.size, a.r, a.z, b.size, b.size, b.r, b.z);
}

function squareVertical([a, b]: ProfilePair<SquareProfileLevel>): Manifold {
	return roundedPrism(a.size, a.size, a.r, b.z - a.z, a.z);
}

function rectChamfer([a, b]: ProfilePair<RectProfileLevel>): Manifold {
	return chamfer(a.w, a.l, a.r, a.z, b.w, b.l, b.r, b.z);
}

function rectVertical([a, b]: ProfilePair<RectProfileLevel>): Manifold {
	return roundedPrism(a.w, a.l, a.r, b.z - a.z, a.z);
}

export function unitBase(): Manifold {
	// levels: (z0,35.6,0.8)(z0.8,37.2,1.6)(z2.6,37.2,1.6)(z4.75,41.5,3.75)
	const sections = profileSections(BASE_PROFILE_LEVELS);
	const c1 = squareChamfer(sections.lowerChamfer);
	const vertical = squareVertical(sections.vertical);
	const c2 = squareChamfer(sections.upperChamfer);
	return oc().Manifold.union([c1, vertical, c2]);
}

function buildHolePart(ManifoldCtor: ManifoldToplevel['Manifold'], part: HolePart): Manifold {
	const radius = part === 'magnet' ? MAGNET_HOLE_DIAMETER / 2 : SCREW_HOLE_DIAMETER / 2;
	const depth = part === 'magnet' ? MAGNET_HOLE_DEPTH : SCREW_HOLE_DEPTH;
	return ManifoldCtor.cylinder(depth, radius, radius, circleSegments);
}

function buildHoles(p: BinParams): Manifold | null {
	const { Manifold } = oc();
	const cutters = holeLayouts(p).map((layout) => {
		const parts = layout.parts.map((part) => buildHolePart(Manifold, part));
		const cutter = (parts.length === 1 ? parts[0]! : Manifold.union(parts));
		return cutter.translate([layout.x, layout.y, 0]);
	});
	if (cutters.length === 0) return null;
	return Manifold.union(cutters);
}

function buildStackingLip(bodyW: number, bodyL: number, topZ: number, lipHeight: number): Manifold {
	const { Manifold } = oc();
	const outer = roundedPrism(bodyW, bodyL, CORNER_FILLET_RADIUS, lipHeight, topZ);

	if (lipHeight >= BASE_PROFILE_HEIGHT) {
		const sections = profileSections(standardLipCavityLevels(bodyW, bodyL, topZ));
		const c1 = rectChamfer(sections.lowerChamfer);
		const c2 = rectVertical(sections.vertical);
		const c3 = rectChamfer(sections.upperChamfer);
		return outer.subtract(Manifold.union([c1, c2, c3]));
	}
	const [bottom, top] = reducedLipCavityLevels(bodyW, bodyL, topZ, lipHeight);
	const cavity = rectChamfer([bottom, top]);
	return outer.subtract(cavity);
}

// Punch the shared flat-top hex lattice through a divider wall (built at the origin,
// cut along its thickness axis before it is translated into position).
function buildHexCutter(axis: 'X' | 'Y', hex: [number, number][], cutter: HexPanelCutter): Manifold {
	if (axis === 'X') return prismAlongX(hex, cutter.cutDepth).translate([cutter.x, cutter.y, cutter.z]);
	return prismAlongY(hex, cutter.cutDepth).translate([cutter.x, cutter.y, cutter.z]);
}

function cutHexPattern(
	wall: Manifold, faceWidth: number, faceHeight: number, wallThickness: number,
	axis: 'X' | 'Y', wallBottom: number
): Manifold {
	const cutterSpecs = hexPanelCutters(axis, faceWidth, faceHeight, wallThickness, 0, 0, wallBottom + faceHeight / 2);
	if (cutterSpecs.length === 0) return wall;
	const { Manifold } = oc();
	const hex = hexPolygon();
	const cutters = cutterSpecs.map((cutter) => buildHexCutter(axis, hex, cutter));
	return wall.subtract(Manifold.union(cutters));
}

function buildDividers(
	p: BinParams, innerW: number, innerL: number, wallBottom: number, wallHeight: number
): Manifold | null {
	const { Manifold } = oc();
	const walls: Manifold[] = [];
	for (const xPos of dividerCoords(p.dividersX, p.dividerPosX, innerW)) {
		let wall = roundedPrism(p.wallThickness, innerL, 0, wallHeight, wallBottom);
		if (p.lightweightDividers) wall = cutHexPattern(wall, innerL, wallHeight, p.wallThickness, 'X', wallBottom);
		walls.push(wall.translate([xPos, 0, 0]));
	}
	for (const yPos of dividerCoords(p.dividersY, p.dividerPosY, innerL)) {
		let wall = roundedPrism(innerW, p.wallThickness, 0, wallHeight, wallBottom);
		if (p.lightweightDividers) wall = cutHexPattern(wall, innerW, wallHeight, p.wallThickness, 'Y', wallBottom);
		walls.push(wall.translate([0, yPos, 0]));
	}
	if (walls.length === 0) return null;
	return walls.length === 1 ? walls[0]! : Manifold.union(walls);
}

function buildLabelTabs(
	p: BinParams, innerW: number, innerL: number, wallBottom: number, wallHeight: number
): Manifold | null {
	const { Manifold } = oc();
	const tabs = labelTabLayouts(p, innerW, innerL, wallBottom, wallHeight).map((layout) => {
		const profile = layout.profile.map(
			([dy, dz]): [number, number] => [layout.frontY + dy, layout.topZ + dz]
		);
		return prismAlongX(profile, layout.width).translate([layout.xStart, 0, 0]);
	});
	if (tabs.length === 0) return null;
	return tabs.length === 1 ? tabs[0]! : Manifold.union(tabs);
}

function buildSingleScoop(
	layout: ScoopLayout,
	wallBottom: number
): Manifold {
	const primitive = scoopPrimitiveLayout(layout, wallBottom);
	const block = box(
		primitive.blockW,
		primitive.blockL,
		primitive.radius,
		primitive.blockX,
		primitive.blockY,
		primitive.blockZ
	);
	const cyl =
		primitive.axis === 'X'
			? cylinderAlongX(primitive.radius, primitive.extrudeLen).translate([
					primitive.cylinderAlongStart,
					primitive.cylinderCrossPos,
					primitive.cylinderZ
				])
			: cylinderAlongY(primitive.radius, primitive.extrudeLen).translate([
					primitive.cylinderCrossPos,
					primitive.cylinderAlongStart,
					primitive.cylinderZ
				]);
	return block.subtract(cyl);
}

function buildScoops(
	p: BinParams, innerW: number, innerL: number, wallBottom: number, wallHeight: number
): Manifold | null {
	const { Manifold } = oc();
	const scoops = scoopLayouts(p, innerW, innerL, wallHeight).map((layout) =>
		buildSingleScoop(layout, wallBottom)
	);
	if (scoops.length === 0) return null;
	return scoops.length === 1 ? scoops[0]! : Manifold.union(scoops);
}

function buildWallCut(
	p: BinParams, bodyW: number, bodyL: number, wallBottom: number, wallHeight: number, lipExtension: number
): Manifold {
	const { axis, crossHalf, points } = wallCutLayout(p, bodyW, bodyL, wallBottom, wallHeight, lipExtension);

	// Extrude the (s, z) profile across the full cross-axis.
	return axis === 'Y'
		? prismAlongX(points, 2 * crossHalf).translate([-crossHalf, 0, 0])
		: prismAlongY(points, 2 * crossHalf).translate([0, -crossHalf, 0]);
}

export function buildBinManifold(p: BinParams, { segments = PREVIEW_SEGMENTS }: { segments?: number } = {}): Manifold {
	circleSegments = segments;
	const { Manifold } = oc();
	const { bodyW, bodyL, innerW, innerL, wallBottom, wallHeight, topZ } = interiorBox(p);
	const cavityFillet = innerFillet(p.wallThickness);

	// 1. Grid of unit bases (build once, translate copies)
	const proto = unitBase();
	const bases: Manifold[] = [];
	for (let x = 0; x < p.width; x++) {
		for (let y = 0; y < p.length; y++) {
			bases.push(proto.translate([cellCenter(x, p.width), cellCenter(y, p.length), 0]));
		}
	}

	// 2. Floor slab connecting the bases
	const floor = roundedPrism(bodyW, bodyL, CORNER_FILLET_RADIUS, FLOOR_THICKNESS, BASE_PROFILE_HEIGHT);
	let bin = Manifold.union([...bases, floor]);

	// 2b. Magnet/screw holes
	if (p.magnetHoles || p.screwHoles) {
		const holes = buildHoles(p);
		if (holes) bin = bin.subtract(holes);
	}

	// 3. Lip + wall dimensions. Walls fill the full nominal height; the stacking
	// lip protrudes above it (gridfinity-rebuilt convention), so a lipped bin's
	// total height is units×7 + lipProtrusion.
	const lipHeight = lipProfileHeight(p.stackingLip);
	const protrusion = lipProtrusion(p.stackingLip);

	if (wallHeight <= 0) return bin;

	// 4. Hollow walls
	const outerWalls = roundedPrism(bodyW, bodyL, CORNER_FILLET_RADIUS, wallHeight, wallBottom);
	const cavity = roundedPrism(innerW, innerL, cavityFillet, wallHeight, wallBottom);
	bin = bin.add(outerWalls.subtract(cavity));

	// 5. Dividers
	if (p.dividersX > 0 || p.dividersY > 0) {
		const dividers = buildDividers(p, innerW, innerL, wallBottom, wallHeight);
		if (dividers) bin = bin.add(dividers);
	}

	// 5b. Bottom scoops
	if (p.scoopWalls.length > 0 && wallHeight > 2) {
		const scoops = buildScoops(p, innerW, innerL, wallBottom, wallHeight);
		if (scoops) bin = bin.add(scoops);
	}

	// 6. Label tabs
	if (p.labelTab && wallHeight >= LABEL_TAB_HEIGHT / 2) {
		const tabs = buildLabelTabs(p, innerW, innerL, wallBottom, wallHeight);
		if (tabs) bin = bin.add(tabs);
	}

	// 7. Stacking lip — protrudes above the wall; its base overlaps the rim as a support.
	if (lipHeight > 0) {
		bin = bin.add(buildStackingLip(bodyW, bodyL, topZ + protrusion - lipHeight, lipHeight));
	}

	// 8. Diagonal wall cut
	if (p.wallCut) {
		bin = bin.subtract(buildWallCut(p, bodyW, bodyL, wallBottom, wallHeight, protrusion));
	}

	return bin;
}
