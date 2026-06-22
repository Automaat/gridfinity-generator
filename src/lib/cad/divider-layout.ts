// Divider positioning math — pure, dependency-free, the single source of truth
// shared by the worker geometry builders (gridfinity.ts / manifold-bin.ts) and
// the main-thread drag gizmos (DividerGizmos.svelte). Keeping it in one place
// guarantees the interactive handles land exactly where the kernel cuts walls.
//
// Positions are stored as fractions in (0..1) across the interior span, measured
// from the low wall (left for X, back for Y). Fractions stay correct when the bin
// is resized; the geometry converts them to centered model coordinates.
import type { BinParams } from '$lib/stores/params';
import {
	LABEL_TAB_DEPTH,
	LABEL_TAB_HEIGHT,
	WALL_BOTTOM,
	bodySize,
	gridHoleSites,
	nominalHeight
} from './gridfinity-spec';

export {
	BASE_PROFILE_HEIGHT,
	FLOOR_THICKNESS,
	GRID_UNIT,
	HEIGHT_UNIT,
	TOLERANCE
} from './gridfinity-spec';

export function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

// The fractional positions of `count` dividers. When `fractions` matches the
// count it is honored (sorted, clamped); otherwise dividers fall back to even
// spacing — which is also the default when a user has never dragged.
export function resolveFractions(count: number, fractions?: number[] | null): number[] {
	const n = Math.max(0, Math.round(count));
	if (n === 0) return [];
	if (fractions && fractions.length === n) {
		return fractions.map((f) => clamp(f, 0, 1)).toSorted((a, b) => a - b);
	}
	return Array.from({ length: n }, (_, i) => (i + 1) / (n + 1));
}

// Centered model-space coordinates of each divider along an axis of length `inner`.
export function dividerCoords(count: number, fractions: number[] | null | undefined, inner: number): number[] {
	return resolveFractions(count, fractions).map((f) => -inner / 2 + f * inner);
}

// Compartment boundaries: the two interior walls plus every divider, sorted.
// `coords` must be the centered divider coordinates (from dividerCoords).
export function compartmentEdges(coords: number[], inner: number): number[] {
	return [-inner / 2, ...coords, inner / 2];
}

// Pin compartment `k` to `value` mm and rescale the rest so all gaps still sum to
// `inner`, preserving the others' relative proportions with a `minGap` floor on
// every compartment. Used when a divider position is set by typing a size.
export function redistributeGaps(
	gaps: number[],
	k: number,
	value: number,
	inner: number,
	minGap: number
): number[] {
	const n = gaps.length;
	const result = gaps.slice();
	result[k] = clamp(value, minGap, inner - (n - 1) * minGap);
	let pool = inner - result[k];
	let active = result.map((_, i) => i).filter((i) => i !== k);
	const weight = (i: number) => Math.max(gaps[i]!, 1e-6);
	// Water-fill: allocate proportionally, but freeze any compartment that would
	// fall below minGap and re-share the remainder among the rest.
	while (active.length > 0) {
		const wsum = active.reduce((s, i) => s + weight(i), 0);
		const tooSmall = active.find((i) => (pool * weight(i)) / wsum < minGap);
		if (tooSmall === undefined) {
			for (const i of active) result[i] = (pool * weight(i)) / wsum;
			break;
		}
		result[tooSmall] = minGap;
		pool -= minGap;
		active = active.filter((i) => i !== tooSmall);
	}
	return result;
}

export interface InteriorBox {
	bodyW: number;
	bodyL: number;
	innerW: number;
	innerL: number;
	wallBottom: number;
	wallHeight: number;
	topZ: number;
}

// Interior dimensions in model space, matching the CAD builders. Used by the
// gizmos to place drag handles and dimension lines on the rim.
export function interiorBox(p: BinParams): InteriorBox {
	const bodyW = bodySize(p.width);
	const bodyL = bodySize(p.length);
	const heightMm = nominalHeight(p.height);
	const wallBottom = WALL_BOTTOM;
	const wallHeight = Math.max(0, heightMm - wallBottom);
	return {
		bodyW,
		bodyL,
		innerW: bodyW - 2 * p.wallThickness,
		innerL: bodyL - 2 * p.wallThickness,
		wallBottom,
		wallHeight,
		topZ: wallBottom + wallHeight
	};
}

export type HolePart = 'magnet' | 'screw';

export interface HoleLayout {
	x: number;
	y: number;
	parts: HolePart[];
}

// Bottom hole placement and enabled cutter parts. Geometry backends create the
// actual cylinders, but the feature selection is shared.
export function holeLayouts(p: BinParams): HoleLayout[] {
	const layouts: HoleLayout[] = [];

	for (const site of gridHoleSites(p.width, p.length)) {
		const parts: HolePart[] = [];
		if (p.magnetHoles && (!p.magnetCornersOnly || site.outerCorner)) {
			parts.push('magnet');
		}
		if (p.screwHoles) {
			parts.push('screw');
		}
		if (parts.length > 0) layouts.push({ x: site.x, y: site.y, parts });
	}

	return layouts;
}

export type DividerWallAxis = 'X' | 'Y';

export interface DividerWallLayout {
	axis: DividerWallAxis;
	width: number;
	length: number;
	height: number;
	x: number;
	y: number;
	z: number;
}

// Divider wall placement and dimensions. Builders turn these layouts into
// backend-specific wall solids and optional lightweight hex cuts.
export function dividerWallLayouts(
	p: BinParams,
	innerW: number,
	innerL: number,
	wallBottom: number,
	wallHeight: number
): DividerWallLayout[] {
	const layouts: DividerWallLayout[] = [];

	for (const xPos of dividerCoords(p.dividersX, p.dividerPosX, innerW)) {
		layouts.push({
			axis: 'X',
			width: p.wallThickness,
			length: innerL,
			height: wallHeight,
			x: xPos,
			y: 0,
			z: wallBottom
		});
	}

	for (const yPos of dividerCoords(p.dividersY, p.dividerPosY, innerL)) {
		layouts.push({
			axis: 'Y',
			width: innerW,
			length: p.wallThickness,
			height: wallHeight,
			x: 0,
			y: yPos,
			z: wallBottom
		});
	}

	return layouts;
}

export function dividerWallThickness(layout: DividerWallLayout): number {
	return layout.axis === 'X' ? layout.width : layout.length;
}

export function dividerWallFaceWidth(layout: DividerWallLayout): number {
	return layout.axis === 'X' ? layout.length : layout.width;
}

export type ScoopAxis = 'X' | 'Y';

export interface ScoopLayout {
	radius: number;
	extrudeLen: number;
	wallPos: number;
	extrudeStart: number;
	axis: ScoopAxis;
	flip: boolean;
}

// Bottom scoop placement for every selected wall in every compartment. Builders
// turn each layout into a quarter-cylinder ramp with their own CAD backend.
export function scoopLayouts(
	p: BinParams,
	innerW: number,
	innerL: number,
	wallHeight: number
): ScoopLayout[] {
	const radius = p.scoopRadius > 0 ? Math.min(p.scoopRadius, wallHeight) : wallHeight / 2;
	if (radius < 2) return [];

	const xEdges = compartmentEdges(dividerCoords(p.dividersX, p.dividerPosX, innerW), innerW);
	const yEdges = compartmentEdges(dividerCoords(p.dividersY, p.dividerPosY, innerL), innerL);
	const layouts: ScoopLayout[] = [];

	for (let ix = 0; ix < xEdges.length - 1; ix++) {
		for (let iy = 0; iy < yEdges.length - 1; iy++) {
			const xStart = xEdges[ix]!;
			const yStart = yEdges[iy]!;
			const compartmentW = xEdges[ix + 1]! - xStart;
			const compartmentL = yEdges[iy + 1]! - yStart;

			for (const wall of p.scoopWalls) {
				switch (wall) {
					case 'back':
						layouts.push({
							radius,
							extrudeLen: compartmentW,
							wallPos: yStart,
							extrudeStart: xStart,
							axis: 'X',
							flip: false
						});
						break;
					case 'front':
						layouts.push({
							radius,
							extrudeLen: compartmentW,
							wallPos: yStart + compartmentL,
							extrudeStart: xStart,
							axis: 'X',
							flip: true
						});
						break;
					case 'left':
						layouts.push({
							radius,
							extrudeLen: compartmentL,
							wallPos: xStart,
							extrudeStart: yStart,
							axis: 'Y',
							flip: false
						});
						break;
					case 'right':
						layouts.push({
							radius,
							extrudeLen: compartmentL,
							wallPos: xStart + compartmentW,
							extrudeStart: yStart,
							axis: 'Y',
							flip: true
						});
						break;
				}
			}
		}
	}

	return layouts;
}

export interface ScoopPrimitiveLayout {
	radius: number;
	extrudeLen: number;
	axis: ScoopAxis;
	blockW: number;
	blockL: number;
	blockX: number;
	blockY: number;
	blockZ: number;
	cylinderPlane: 'YZ' | 'XZ';
	cylinderAlongStart: number;
	cylinderCrossPos: number;
	cylinderZ: number;
}

// Shared primitive placement for a scoop ramp. Builders still create the block
// and cylinder using their own CAD primitives, but the dimensions and offsets
// stay identical between backends.
export function scoopPrimitiveLayout(layout: ScoopLayout, wallBottom: number): ScoopPrimitiveLayout {
	const { radius, extrudeLen, wallPos, extrudeStart, axis, flip } = layout;
	const dir = flip ? -1 : 1;
	return {
		radius,
		extrudeLen,
		axis,
		blockW: axis === 'X' ? extrudeLen : radius,
		blockL: axis === 'X' ? radius : extrudeLen,
		blockX: axis === 'X' ? extrudeStart + extrudeLen / 2 : wallPos + (dir * radius) / 2,
		blockY: axis === 'X' ? wallPos + (dir * radius) / 2 : extrudeStart + extrudeLen / 2,
		blockZ: wallBottom,
		cylinderPlane: axis === 'X' ? 'YZ' : 'XZ',
		cylinderAlongStart: extrudeStart,
		cylinderCrossPos: wallPos + dir * radius,
		cylinderZ: wallBottom + radius
	};
}

export type LabelTabProfile = [[number, number], [number, number], [number, number]];

export interface LabelTabLayout {
	xStart: number;
	width: number;
	frontY: number;
	topZ: number;
	profile: LabelTabProfile;
}

// Label tabs span each X compartment along the front wall. The profile is local
// to (frontY, topZ) in the YZ plane so CAD backends can place it directly.
export function labelTabLayouts(
	p: BinParams,
	innerW: number,
	innerL: number,
	wallBottom: number,
	wallHeight: number
): LabelTabLayout[] {
	const topZ = wallBottom + wallHeight;
	const tabHeight = Math.min(LABEL_TAB_HEIGHT, wallHeight);
	const tabDepth = Math.min(LABEL_TAB_DEPTH, innerL - 1);
	const edges = compartmentEdges(dividerCoords(p.dividersX, p.dividerPosX, innerW), innerW);
	const frontY = innerL / 2;
	const layouts: LabelTabLayout[] = [];

	for (let i = 0; i < edges.length - 1; i++) {
		const e0 = edges[i]!;
		const e1 = edges[i + 1]!;
		const width = e1 - e0 - (i > 0 ? p.wallThickness : 0);
		if (width < 1) continue;
		const cx = (e0 + e1) / 2;
		const profile: LabelTabProfile = [[0, 0], [-tabDepth, 0], [0, -tabHeight]];
		layouts.push({ xStart: cx - width / 2, width, frontY, topZ, profile });
	}

	return layouts;
}

export type WallCutAxis = 'X' | 'Y';

export interface WallCutLayout {
	axis: WallCutAxis;
	crossHalf: number;
	points: [number, number][];
}

// Diagonal wall cut profile in (span, z) space. Builders extrude this polygon
// across the cross-axis using their own CAD backend.
export function wallCutLayout(
	p: BinParams,
	bodyW: number,
	bodyL: number,
	wallBottom: number,
	wallHeight: number,
	lipExtension: number
): WallCutLayout {
	const margin = 1; // overshoot footprint so outer walls cut cleanly through
	const topMostZ = wallBottom + wallHeight + lipExtension;
	const ceilingZ = topMostZ + 5;
	const lowZ = wallBottom + wallHeight * p.wallCutLowFraction;

	const axis: WallCutAxis =
		p.wallCutSide === 'front' || p.wallCutSide === 'back' ? 'Y' : 'X';
	const lowAtPositive = p.wallCutSide === 'front' || p.wallCutSide === 'right';

	const spanHalf = (axis === 'Y' ? bodyL : bodyW) / 2 + margin;
	const crossHalf = (axis === 'Y' ? bodyW : bodyL) / 2 + margin;
	const lowS = lowAtPositive ? spanHalf : -spanHalf;
	const highS = lowAtPositive ? -spanHalf : spanHalf;
	const slopeEndS = highS + p.wallCutRun * (lowS - highS);

	const points: [number, number][] = [[highS, topMostZ], [slopeEndS, lowZ]];
	if (p.wallCutRun < 1) points.push([lowS, lowZ]);
	points.push([lowS, ceilingZ], [highS, ceilingZ]);

	return { axis, crossHalf, points };
}
