// Divider positioning math — pure, dependency-free, the single source of truth
// shared by the worker geometry builders (gridfinity.ts / manifold-bin.ts) and
// the main-thread drag gizmos (DividerGizmos.svelte). Keeping it in one place
// guarantees the interactive handles land exactly where the kernel cuts walls.
//
// Positions are stored as fractions in (0..1) across the interior span, measured
// from the low wall (left for X, back for Y). Fractions stay correct when the bin
// is resized; the geometry converts them to centered model coordinates.
import type { BinParams } from '$lib/stores/params';
import { WALL_BOTTOM, bodySize, nominalHeight } from './gridfinity-spec';

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
