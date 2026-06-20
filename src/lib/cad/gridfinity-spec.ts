// Shared Gridfinity dimensions and derived profile math. This module is engine-
// free so the OCCT, Manifold, layout, and estimation paths all consume the same
// source of truth.

export const GRID_UNIT = 42;
export const HEIGHT_UNIT = 7;
export const TOLERANCE = 0.5;

export const BASE_PROFILE_HEIGHT = 4.75;
export const BASE_TOP_RADIUS = 3.75;
export const CORNER_FILLET_RADIUS = BASE_TOP_RADIUS;
export const FLOOR_THICKNESS = 2.25;
export const WALL_BOTTOM = BASE_PROFILE_HEIGHT + FLOOR_THICKNESS;

export const MAGNET_HOLE_DIAMETER = 6.5;
export const MAGNET_HOLE_DEPTH = 2.4;
export const SCREW_HOLE_DIAMETER = 3;
export const SCREW_HOLE_DEPTH = 6;
export const HOLE_DISTANCE_FROM_EDGE = 8;

export const LIP_OFFSET_BOTTOM = 2.95;
export const LIP_OFFSET_MID = 0.8;
export const STACKING_LIP_PROTRUSION = 3.551;
export const REDUCED_LIP_PROTRUSION = 2.15;

export const LABEL_TAB_HEIGHT = 14;
export const LABEL_TAB_DEPTH = 4.5;

export type StackingLip = 'standard' | 'none' | 'reduced';

export interface SquareProfileLevel {
	z: number;
	size: number;
	r: number;
}

export interface RectProfileLevel {
	z: number;
	w: number;
	l: number;
	r: number;
}

export type ProfilePair<TLevel> = readonly [TLevel, TLevel];
export type FourLevelProfile<TLevel> = readonly [TLevel, TLevel, TLevel, TLevel];

export interface ProfileSections<TLevel> {
	lowerChamfer: ProfilePair<TLevel>;
	vertical: ProfilePair<TLevel>;
	upperChamfer: ProfilePair<TLevel>;
}

export interface GridHoleSite {
	cellX: number;
	cellY: number;
	x: number;
	y: number;
	offsetX: number;
	offsetY: number;
	outerCorner: boolean;
}

export function bodySize(units: number): number {
	return units * GRID_UNIT - TOLERANCE;
}

export function nominalHeight(units: number): number {
	return units * HEIGHT_UNIT;
}

export function gridOffset(units: number): number {
	return ((units - 1) * GRID_UNIT) / 2;
}

export function cellCenter(index: number, units: number): number {
	return index * GRID_UNIT - gridOffset(units);
}

export function innerFillet(wallThickness: number): number {
	return Math.max(0.2, CORNER_FILLET_RADIUS - wallThickness);
}

export const BASE_PROFILE_LEVELS: FourLevelProfile<SquareProfileLevel> = [
	{ z: 0, size: 35.6, r: 0.8 },
	{ z: 0.8, size: 37.2, r: 1.6 },
	{ z: 2.6, size: 37.2, r: 1.6 },
	{ z: BASE_PROFILE_HEIGHT, size: bodySize(1), r: BASE_TOP_RADIUS }
];

export function profileSections<TLevel>(levels: FourLevelProfile<TLevel>): ProfileSections<TLevel> {
	return {
		lowerChamfer: [levels[0], levels[1]],
		vertical: [levels[1], levels[2]],
		upperChamfer: [levels[2], levels[3]]
	};
}

export function lipProfileHeight(lip: StackingLip): number {
	if (lip === 'standard') return BASE_PROFILE_HEIGHT;
	if (lip === 'reduced') return REDUCED_LIP_PROTRUSION;
	return 0;
}

export function lipProtrusion(lip: StackingLip): number {
	if (lip === 'standard') return STACKING_LIP_PROTRUSION;
	if (lip === 'reduced') return REDUCED_LIP_PROTRUSION;
	return 0;
}

export function standardLipCavityLevels(bodyW: number, bodyL: number, topZ: number): FourLevelProfile<RectProfileLevel> {
	return [
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
}

export function reducedLipCavityLevels(bodyW: number, bodyL: number, topZ: number, lipHeight: number): readonly [RectProfileLevel, RectProfileLevel] {
	return [
		{
			z: topZ,
			w: bodyW - 2 * LIP_OFFSET_MID,
			l: bodyL - 2 * LIP_OFFSET_MID,
			r: Math.max(0.2, CORNER_FILLET_RADIUS - LIP_OFFSET_MID)
		},
		{ z: topZ + lipHeight, w: bodyW, l: bodyL, r: CORNER_FILLET_RADIUS }
	];
}

export const HOLE_OFFSET = bodySize(1) / 2 - HOLE_DISTANCE_FROM_EDGE;
export const HOLE_OFFSETS: readonly (readonly [number, number])[] = [
	[HOLE_OFFSET, HOLE_OFFSET],
	[-HOLE_OFFSET, HOLE_OFFSET],
	[HOLE_OFFSET, -HOLE_OFFSET],
	[-HOLE_OFFSET, -HOLE_OFFSET]
];

export function isOuterGridCorner(width: number, length: number, x: number, y: number, ox: number, oy: number): boolean {
	const outerX = (x === 0 && ox < 0) || (x === width - 1 && ox > 0);
	const outerY = (y === 0 && oy < 0) || (y === length - 1 && oy > 0);
	return outerX && outerY;
}

export function gridHoleSites(width: number, length: number): GridHoleSite[] {
	const sites: GridHoleSite[] = [];
	for (let cellX = 0; cellX < width; cellX++) {
		for (let cellY = 0; cellY < length; cellY++) {
			const cx = cellCenter(cellX, width);
			const cy = cellCenter(cellY, length);
			for (const [offsetX, offsetY] of HOLE_OFFSETS) {
				sites.push({
					cellX,
					cellY,
					x: cx + offsetX,
					y: cy + offsetY,
					offsetX,
					offsetY,
					outerCorner: isOuterGridCorner(width, length, cellX, cellY, offsetX, offsetY)
				});
			}
		}
	}
	return sites;
}
