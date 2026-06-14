// Native manifold-3d bin geometry — the fast preview/STL path. Mirrors the spec
// math in gridfinity.ts (the OCCT path kept for STEP export) but builds with
// manifold mesh CSG: ~3-5× faster rebuilds and a ~0.2MB engine vs OCCT's 4.6MB.
//
// Parity with gridfinity.ts is verified by volume + bounding box (manifold-parity
// harness). Constants below MUST match gridfinity.ts.
import type { BinParams } from '$lib/stores/params';
import type { ManifoldToplevel, Manifold } from 'manifold-3d';

const GRID_UNIT = 42;
const HEIGHT_UNIT = 7;
const TOLERANCE = 0.5;
const BASE_PROFILE_HEIGHT = 4.75;
const CORNER_FILLET_RADIUS = 3.75;
const MAGNET_HOLE_DIAMETER = 6.5;
const MAGNET_HOLE_DEPTH = 2.4;
const SCREW_HOLE_DIAMETER = 3;
const SCREW_HOLE_DEPTH = 6;
const HOLE_DISTANCE_FROM_EDGE = 8;
const LIP_OFFSET_BOTTOM = 2.95;
const LIP_OFFSET_MID = 0.8;
const FLOOR_THICKNESS = 2.25;

// Circle/arc tessellation for the preview. ~32 segments keeps holes and corner
// fillets smooth at screen scale without inflating triangle count.
const CIRCLE_SEGMENTS = 32;

let M: ManifoldToplevel | null = null;
export function setBinManifold(m: ManifoldToplevel): void {
	M = m;
}
function oc(): ManifoldToplevel {
	if (!M) throw new Error('manifold engine not initialized — call setBinManifold first');
	return M;
}

function bodySize(units: number): number {
	return units * GRID_UNIT - TOLERANCE;
}

// A rounded rectangle cross-section centered at the origin (w×l, corner radius r).
// Built by shrinking the rect by r then offsetting outward with round joins, so
// the final outer dimensions are exactly w×l (matches replicad drawRoundedRectangle).
function roundedRectCS(w: number, l: number, r: number) {
	const { CrossSection } = oc();
	if (r <= 0) return CrossSection.square([w, l], true);
	const quarter = Math.max(1, Math.round(CIRCLE_SEGMENTS / 4));
	return CrossSection.square([w - 2 * r, l - 2 * r], true).offset(r, 'Round', 2, quarter * 4);
}

// Rounded-rectangle prism, base resting at z.
function roundedPrism(w: number, l: number, r: number, height: number, z: number): Manifold {
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

function unitBase(): Manifold {
	const ub = GRID_UNIT - TOLERANCE; // 41.5
	// levels: (z0,35.6,0.8)(z0.8,37.2,1.6)(z2.6,37.2,1.6)(z4.75,41.5,3.75)
	const c1 = chamfer(35.6, 35.6, 0.8, 0, 37.2, 37.2, 1.6, 0.8);
	const vertical = roundedPrism(37.2, 37.2, 1.6, 2.6 - 0.8, 0.8);
	const c2 = chamfer(37.2, 37.2, 1.6, 2.6, ub, ub, CORNER_FILLET_RADIUS, BASE_PROFILE_HEIGHT);
	return oc().Manifold.union([c1, vertical, c2]);
}

function buildHoles(p: BinParams, gridOffsetX: number, gridOffsetY: number): Manifold | null {
	const { Manifold } = oc();
	const unitBody = GRID_UNIT - TOLERANCE;
	const holeOffset = unitBody / 2 - HOLE_DISTANCE_FROM_EDGE;
	const offsets = [
		[holeOffset, holeOffset], [-holeOffset, holeOffset],
		[holeOffset, -holeOffset], [-holeOffset, -holeOffset]
	];
	const cutters: Manifold[] = [];
	for (let x = 0; x < p.width; x++) {
		for (let y = 0; y < p.length; y++) {
			const cx = x * GRID_UNIT - gridOffsetX;
			const cy = y * GRID_UNIT - gridOffsetY;
			for (const [ox, oy] of offsets) {
				const parts: Manifold[] = [];
				if (p.magnetHoles) {
					parts.push(Manifold.cylinder(MAGNET_HOLE_DEPTH, MAGNET_HOLE_DIAMETER / 2, MAGNET_HOLE_DIAMETER / 2, CIRCLE_SEGMENTS));
				}
				if (p.screwHoles) {
					parts.push(Manifold.cylinder(SCREW_HOLE_DEPTH, SCREW_HOLE_DIAMETER / 2, SCREW_HOLE_DIAMETER / 2, CIRCLE_SEGMENTS));
				}
				if (parts.length === 0) continue;
				const cutter = (parts.length === 1 ? parts[0] : Manifold.union(parts));
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
		const lv = [
			{ z: topZ, w: bodyW - 2 * LIP_OFFSET_BOTTOM, l: bodyL - 2 * LIP_OFFSET_BOTTOM, r: Math.max(0.2, CORNER_FILLET_RADIUS - LIP_OFFSET_BOTTOM) },
			{ z: topZ + 0.8, w: bodyW - 2 * LIP_OFFSET_MID, l: bodyL - 2 * LIP_OFFSET_MID, r: Math.max(0.2, CORNER_FILLET_RADIUS - LIP_OFFSET_MID) },
			{ z: topZ + 2.6, w: bodyW - 2 * LIP_OFFSET_MID, l: bodyL - 2 * LIP_OFFSET_MID, r: Math.max(0.2, CORNER_FILLET_RADIUS - LIP_OFFSET_MID) },
			{ z: topZ + BASE_PROFILE_HEIGHT, w: bodyW, l: bodyL, r: CORNER_FILLET_RADIUS }
		];
		const c1 = chamfer(lv[0].w, lv[0].l, lv[0].r, lv[0].z, lv[1].w, lv[1].l, lv[1].r, lv[1].z);
		const c2 = roundedPrism(lv[1].w, lv[1].l, lv[1].r, lv[2].z - lv[1].z, lv[1].z);
		const c3 = chamfer(lv[2].w, lv[2].l, lv[2].r, lv[2].z, lv[3].w, lv[3].l, lv[3].r, lv[3].z);
		return outer.subtract(Manifold.union([c1, c2, c3]));
	}
	const bottomR = Math.max(0.2, CORNER_FILLET_RADIUS - LIP_OFFSET_MID);
	const cavity = chamfer(
		bodyW - 2 * LIP_OFFSET_MID, bodyL - 2 * LIP_OFFSET_MID, bottomR, topZ,
		bodyW, bodyL, CORNER_FILLET_RADIUS, topZ + lipHeight
	);
	return outer.subtract(cavity);
}

function buildDividers(
	p: BinParams, innerW: number, innerL: number, wallBottom: number, wallHeight: number
): Manifold | null {
	const { Manifold } = oc();
	const walls: Manifold[] = [];
	if (p.dividersX > 0) {
		const spacing = innerW / (p.dividersX + 1);
		for (let i = 1; i <= p.dividersX; i++) {
			const xPos = -innerW / 2 + i * spacing;
			walls.push(roundedPrism(p.wallThickness, innerL, 0, wallHeight, wallBottom).translate([xPos, 0, 0]));
		}
	}
	if (p.dividersY > 0) {
		const spacing = innerL / (p.dividersY + 1);
		for (let i = 1; i <= p.dividersY; i++) {
			const yPos = -innerL / 2 + i * spacing;
			walls.push(roundedPrism(innerW, p.wallThickness, 0, wallHeight, wallBottom).translate([0, yPos, 0]));
		}
	}
	if (walls.length === 0) return null;
	return walls.length === 1 ? walls[0] : Manifold.union(walls);
}

export function buildBinManifold(p: BinParams): Manifold {
	const { Manifold } = oc();
	const h = p.height * HEIGHT_UNIT;
	const bodyW = bodySize(p.width);
	const bodyL = bodySize(p.length);
	const innerFillet = Math.max(0.2, CORNER_FILLET_RADIUS - p.wallThickness);
	const gridOffsetX = ((p.width - 1) * GRID_UNIT) / 2;
	const gridOffsetY = ((p.length - 1) * GRID_UNIT) / 2;

	// 1. Grid of unit bases (build once, translate copies)
	const proto = unitBase();
	const bases: Manifold[] = [];
	for (let x = 0; x < p.width; x++) {
		for (let y = 0; y < p.length; y++) {
			bases.push(proto.translate([x * GRID_UNIT - gridOffsetX, y * GRID_UNIT - gridOffsetY, 0]));
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

	// 3. Lip + wall dimensions
	const lipHeight = p.stackingLip === 'standard' ? BASE_PROFILE_HEIGHT : p.stackingLip === 'reduced' ? 2.15 : 0;
	const wallBottom = BASE_PROFILE_HEIGHT + FLOOR_THICKNESS;
	const wallHeight = h - wallBottom - lipHeight;

	if (wallHeight <= 0) return bin;

	// 4. Hollow walls
	const outerWalls = roundedPrism(bodyW, bodyL, CORNER_FILLET_RADIUS, wallHeight, wallBottom);
	const innerW = bodyW - 2 * p.wallThickness;
	const innerL = bodyL - 2 * p.wallThickness;
	const cavity = roundedPrism(innerW, innerL, innerFillet, wallHeight, wallBottom);
	bin = bin.add(outerWalls.subtract(cavity));

	// 5. Dividers
	if (p.dividersX > 0 || p.dividersY > 0) {
		const dividers = buildDividers(p, innerW, innerL, wallBottom, wallHeight);
		if (dividers) bin = bin.add(dividers);
	}

	// 7. Stacking lip
	if (lipHeight > 0) {
		bin = bin.add(buildStackingLip(bodyW, bodyL, wallBottom + wallHeight, lipHeight));
	}

	return bin;
}
