// Native manifold-3d bin geometry — the fast preview/STL path. Mirrors the spec
// math in gridfinity.ts (the OCCT path kept for STEP export) but builds with
// manifold mesh CSG: ~3-5× faster rebuilds and a ~0.2MB engine vs OCCT's 4.6MB.
//
// Parity with gridfinity.ts is verified by volume + bounding box (manifold-parity
// harness). Shared Gridfinity spec values live in gridfinity-spec.ts.
import type { BinParams } from '$lib/stores/params';
import type { ManifoldToplevel, Manifold } from 'manifold-3d';
import { dividerCoords, compartmentEdges } from './divider-layout';
import { hexPolygon, hexCells, HEX_CUT_OVERSHOOT } from './hex-lattice';
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
	reducedLipCavityLevels,
	standardLipCavityLevels
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

// CrossSection treats a clockwise contour as a hole, so normalize to CCW (the
// source polygons flip orientation depending on bin side / slope direction).
function ensureCCW(pts: [number, number][]): [number, number][] {
	let area = 0;
	for (let i = 0; i < pts.length; i++) {
		const [x1, y1] = pts[i]!;
		const [x2, y2] = pts[(i + 1) % pts.length]!;
		area += x1 * y2 - x2 * y1;
	}
	return area < 0 ? pts.toReversed() : pts;
}

// A prism whose cross-section lies in a world plane, extruded along world X or Y.
// Both use proper rotations (no mirroring) so the section shape is preserved, and
// each spans its axis [0, length]. `ptsYZ`/`ptsXZ` are world-plane points.
//   X: section→(-Z, Y) then rotate([0,90,0]) ⇒ extrude→+X
//   Y: section→(X, Z) then rotate([90,0,0])+shift ⇒ extrude→+Y
export function prismAlongX(ptsYZ: [number, number][], length: number): Manifold {
	const cs = new (oc().CrossSection)(ensureCCW(ptsYZ.map(([y, z]) => [-z, y])));
	return oc().Manifold.extrude(cs, length).rotate([0, 90, 0]);
}
export function prismAlongY(ptsXZ: [number, number][], length: number): Manifold {
	const cs = new (oc().CrossSection)(ensureCCW(ptsXZ.map(([x, z]) => [x, z])));
	return oc().Manifold.extrude(cs, length).rotate([90, 0, 0]).translate([0, length, 0]);
}
function cylinderAlongX(radius: number, length: number): Manifold {
	return oc().Manifold.cylinder(length, radius, radius, circleSegments).rotate([0, 90, 0]);
}
function cylinderAlongY(radius: number, length: number): Manifold {
	return oc().Manifold.cylinder(length, radius, radius, circleSegments).rotate([-90, 0, 0]);
}

export function unitBase(): Manifold {
	// levels: (z0,35.6,0.8)(z0.8,37.2,1.6)(z2.6,37.2,1.6)(z4.75,41.5,3.75)
	const b0 = BASE_PROFILE_LEVELS[0]!;
	const b1 = BASE_PROFILE_LEVELS[1]!;
	const b2 = BASE_PROFILE_LEVELS[2]!;
	const b3 = BASE_PROFILE_LEVELS[3]!;
	const c1 = chamfer(b0.size, b0.size, b0.r, b0.z, b1.size, b1.size, b1.r, b1.z);
	const vertical = roundedPrism(b1.size, b1.size, b1.r, b2.z - b1.z, b1.z);
	const c2 = chamfer(b2.size, b2.size, b2.r, b2.z, b3.size, b3.size, b3.r, b3.z);
	return oc().Manifold.union([c1, vertical, c2]);
}

function buildHoles(p: BinParams, gridOffsetX: number, gridOffsetY: number): Manifold | null {
	const { Manifold } = oc();
	const cutters: Manifold[] = [];
	for (let x = 0; x < p.width; x++) {
		for (let y = 0; y < p.length; y++) {
			const cx = x * GRID_UNIT - gridOffsetX;
			const cy = y * GRID_UNIT - gridOffsetY;
			for (const [ox, oy] of HOLE_OFFSETS) {
				const parts: Manifold[] = [];
				if (p.magnetHoles && (!p.magnetCornersOnly || isOuterGridCorner(p.width, p.length, x, y, ox, oy))) {
					parts.push(Manifold.cylinder(MAGNET_HOLE_DEPTH, MAGNET_HOLE_DIAMETER / 2, MAGNET_HOLE_DIAMETER / 2, circleSegments));
				}
				if (p.screwHoles) {
					parts.push(Manifold.cylinder(SCREW_HOLE_DEPTH, SCREW_HOLE_DIAMETER / 2, SCREW_HOLE_DIAMETER / 2, circleSegments));
				}
				if (parts.length === 0) continue;
				const cutter = (parts.length === 1 ? parts[0]! : Manifold.union(parts));
				cutters.push(cutter.translate([cx + ox, cy + oy, 0]));
			}
		}
	}
	if (cutters.length === 0) return null;
	return Manifold.union(cutters);
}

function buildStackingLip(bodyW: number, bodyL: number, topZ: number, lipHeight: number): Manifold {
	const { Manifold } = oc();
	const outer = roundedPrism(bodyW, bodyL, CORNER_FILLET_RADIUS, lipHeight, topZ);

	if (lipHeight >= BASE_PROFILE_HEIGHT) {
		const lv = standardLipCavityLevels(bodyW, bodyL, topZ);
		const c1 = chamfer(lv[0]!.w, lv[0]!.l, lv[0]!.r, lv[0]!.z, lv[1]!.w, lv[1]!.l, lv[1]!.r, lv[1]!.z);
		const c2 = roundedPrism(lv[1]!.w, lv[1]!.l, lv[1]!.r, lv[2]!.z - lv[1]!.z, lv[1]!.z);
		const c3 = chamfer(lv[2]!.w, lv[2]!.l, lv[2]!.r, lv[2]!.z, lv[3]!.w, lv[3]!.l, lv[3]!.r, lv[3]!.z);
		return outer.subtract(Manifold.union([c1, c2, c3]));
	}
	const [bottom, top] = reducedLipCavityLevels(bodyW, bodyL, topZ, lipHeight);
	const cavity = chamfer(
		bottom.w, bottom.l, bottom.r, bottom.z,
		top.w, top.l, top.r, top.z
	);
	return outer.subtract(cavity);
}

// Punch the shared flat-top hex lattice through a divider wall (built at the origin,
// cut along its thickness axis before it is translated into position).
function cutHexPattern(
	wall: Manifold, faceWidth: number, faceHeight: number, wallThickness: number,
	axis: 'X' | 'Y', wallBottom: number
): Manifold {
	const cells = hexCells(faceWidth, faceHeight);
	if (cells.length === 0) return wall;
	const { Manifold } = oc();
	const cutDepth = wallThickness + 2 * HEX_CUT_OVERSHOOT;
	const hex = hexPolygon();
	const cutters = cells.map(({ u, v }) => {
		const zCenter = wallBottom + faceHeight / 2 + v;
		return axis === 'X'
			? prismAlongX(hex, cutDepth).translate([-cutDepth / 2, u, zCenter])
			: prismAlongY(hex, cutDepth).translate([u, -cutDepth / 2, zCenter]);
	});
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
	const topZ = wallBottom + wallHeight;
	const tabHeight = Math.min(LABEL_TAB_HEIGHT, wallHeight);
	const tabDepth = Math.min(LABEL_TAB_DEPTH, innerL - 1);
	const edges = compartmentEdges(dividerCoords(p.dividersX, p.dividerPosX, innerW), innerW);
	const frontY = innerL / 2;
	const tabs: Manifold[] = [];
	for (let i = 0; i < edges.length - 1; i++) {
		const cx = (edges[i]! + edges[i + 1]!) / 2;
		const tabW = edges[i + 1]! - edges[i]! - (i > 0 ? p.wallThickness : 0);
		if (tabW < 1) continue; // compartment too narrow for a usable tab
		// Right-triangle ledge in the Y-Z plane, extruded along X by the tab width.
		const tri: [number, number][] = [
			[frontY, topZ], [frontY - tabDepth, topZ], [frontY, topZ - tabHeight]
		];
		tabs.push(prismAlongX(tri, tabW).translate([cx - tabW / 2, 0, 0]));
	}
	if (tabs.length === 0) return null;
	return tabs.length === 1 ? tabs[0]! : Manifold.union(tabs);
}

function buildSingleScoop(
	R: number, extrudeLen: number, wallPos: number, wallBottom: number,
	extrudeStart: number, axis: 'X' | 'Y', flip: boolean
): Manifold {
	const dir = flip ? -1 : 1;
	const blockW = axis === 'X' ? extrudeLen : R;
	const blockL = axis === 'X' ? R : extrudeLen;
	const blockX = axis === 'X' ? extrudeStart + extrudeLen / 2 : wallPos + (dir * R) / 2;
	const blockY = axis === 'X' ? wallPos + (dir * R) / 2 : extrudeStart + extrudeLen / 2;
	const block = box(blockW, blockL, R, blockX, blockY, wallBottom);
	const cyl =
		axis === 'X'
			? cylinderAlongX(R, extrudeLen).translate([extrudeStart, wallPos + dir * R, wallBottom + R])
			: cylinderAlongY(R, extrudeLen).translate([wallPos + dir * R, extrudeStart, wallBottom + R]);
	return block.subtract(cyl);
}

function buildScoops(
	p: BinParams, innerW: number, innerL: number, wallBottom: number, wallHeight: number
): Manifold | null {
	const { Manifold } = oc();
	const xEdges = compartmentEdges(dividerCoords(p.dividersX, p.dividerPosX, innerW), innerW);
	const yEdges = compartmentEdges(dividerCoords(p.dividersY, p.dividerPosY, innerL), innerL);
	const R = p.scoopRadius > 0 ? Math.min(p.scoopRadius, wallHeight) : wallHeight / 2;
	if (R < 2) return null;

	const scoops: Manifold[] = [];
	for (let ix = 0; ix < xEdges.length - 1; ix++) {
		for (let iy = 0; iy < yEdges.length - 1; iy++) {
			const xStart = xEdges[ix]!;
			const yStart = yEdges[iy]!;
			const compartmentW = xEdges[ix + 1]! - xEdges[ix]!;
			const compartmentL = yEdges[iy + 1]! - yEdges[iy]!;
			for (const wall of p.scoopWalls) {
				switch (wall) {
					case 'back':
						scoops.push(buildSingleScoop(R, compartmentW, yStart, wallBottom, xStart, 'X', false));
						break;
					case 'front':
						scoops.push(buildSingleScoop(R, compartmentW, yStart + compartmentL, wallBottom, xStart, 'X', true));
						break;
					case 'left':
						scoops.push(buildSingleScoop(R, compartmentL, xStart, wallBottom, yStart, 'Y', false));
						break;
					case 'right':
						scoops.push(buildSingleScoop(R, compartmentL, xStart + compartmentW, wallBottom, yStart, 'Y', true));
						break;
				}
			}
		}
	}
	if (scoops.length === 0) return null;
	return scoops.length === 1 ? scoops[0]! : Manifold.union(scoops);
}

function buildWallCut(
	p: BinParams, bodyW: number, bodyL: number, wallBottom: number, wallHeight: number, lipExtension: number
): Manifold {
	const margin = 1;
	const topMostZ = wallBottom + wallHeight + lipExtension;
	const ceilingZ = topMostZ + 5;
	const lowZ = wallBottom + wallHeight * p.wallCutLowFraction;
	const axis: 'X' | 'Y' = p.wallCutSide === 'front' || p.wallCutSide === 'back' ? 'Y' : 'X';
	const lowAtPositive = p.wallCutSide === 'front' || p.wallCutSide === 'right';
	const spanHalf = (axis === 'Y' ? bodyL : bodyW) / 2 + margin;
	const crossHalf = (axis === 'Y' ? bodyW : bodyL) / 2 + margin;
	const lowS = lowAtPositive ? spanHalf : -spanHalf;
	const highS = lowAtPositive ? -spanHalf : spanHalf;
	const slopeEndS = highS + p.wallCutRun * (lowS - highS);

	// Polygon = everything above the sloped profile, capped at the ceiling.
	const pts: [number, number][] = [[highS, topMostZ], [slopeEndS, lowZ]];
	if (p.wallCutRun < 1) pts.push([lowS, lowZ]);
	pts.push([lowS, ceilingZ], [highS, ceilingZ]);

	// Extrude the (s, z) profile across the full cross-axis.
	return axis === 'Y'
		? prismAlongX(pts, 2 * crossHalf).translate([-crossHalf, 0, 0])
		: prismAlongY(pts, 2 * crossHalf).translate([0, -crossHalf, 0]);
}

export function buildBinManifold(p: BinParams, { segments = PREVIEW_SEGMENTS }: { segments?: number } = {}): Manifold {
	circleSegments = segments;
	const { Manifold } = oc();
	const h = p.height * HEIGHT_UNIT;
	const bodyW = bodySize(p.width);
	const bodyL = bodySize(p.length);
	const cavityFillet = innerFillet(p.wallThickness);
	const gridOffsetX = gridOffset(p.width);
	const gridOffsetY = gridOffset(p.length);

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
		const holes = buildHoles(p, gridOffsetX, gridOffsetY);
		if (holes) bin = bin.subtract(holes);
	}

	// 3. Lip + wall dimensions. Walls fill the full nominal height; the stacking
	// lip protrudes above it (gridfinity-rebuilt convention), so a lipped bin's
	// total height is units×7 + lipProtrusion.
	const lipHeight = lipProfileHeight(p.stackingLip);
	const protrusion = lipProtrusion(p.stackingLip);
	const wallBottom = BASE_PROFILE_HEIGHT + FLOOR_THICKNESS;
	const wallHeight = h - wallBottom;

	if (wallHeight <= 0) return bin;

	// 4. Hollow walls
	const outerWalls = roundedPrism(bodyW, bodyL, CORNER_FILLET_RADIUS, wallHeight, wallBottom);
	const innerW = bodyW - 2 * p.wallThickness;
	const innerL = bodyL - 2 * p.wallThickness;
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
		bin = bin.add(buildStackingLip(bodyW, bodyL, h + protrusion - lipHeight, lipHeight));
	}

	// 8. Diagonal wall cut
	if (p.wallCut) {
		bin = bin.subtract(buildWallCut(p, bodyW, bodyL, wallBottom, wallHeight, protrusion));
	}

	return bin;
}
