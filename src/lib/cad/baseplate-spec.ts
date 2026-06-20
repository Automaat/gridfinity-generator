import type { BaseplateParams } from '$lib/stores/params';
import {
	BASE_PROFILE_HEIGHT,
	GRID_UNIT,
	HOLE_DISTANCE_FROM_EDGE,
	MAGNET_HOLE_DEPTH,
	MAGNET_HOLE_DIAMETER
} from './gridfinity-spec';

// Plate thickness = full socket profile plus a floor. Magnet style adds room for
// a 2.4mm magnet pocket plus a skin below the socket.
export const SOCKET_DEPTH = BASE_PROFILE_HEIGHT;
export const SIMPLE_FLOOR = 1.25;
export const MAGNET_SKIN = 0.8;
export const THICKNESS_SIMPLE = SOCKET_DEPTH + SIMPLE_FLOOR;
export const THICKNESS_MAGNET = SOCKET_DEPTH + MAGNET_HOLE_DEPTH + MAGNET_SKIN;

// Skeletonized cell opening and the magnet pad geometry preserved in magnet mode.
export const SKELETON_OPENING = 33;
export const SKELETON_CORNER_RADIUS = 7;
export const MAGNET_BOSS_RADIUS = MAGNET_HOLE_DIAMETER / 2 + 2;
export const HOLE_INSET = GRID_UNIT / 2 - HOLE_DISTANCE_FROM_EDGE;
export const CORNER_OFFSETS: readonly (readonly [number, number])[] = [
	[HOLE_INSET, HOLE_INSET],
	[-HOLE_INSET, HOLE_INSET],
	[HOLE_INSET, -HOLE_INSET],
	[-HOLE_INSET, -HOLE_INSET]
];

// In-plane dovetail snap-tab dimensions. The tip is wider than the neck so a
// pressed joint locks; clearance is applied only to the female pocket.
export const DOVETAIL_DEPTH = 4;
export const DOVETAIL_NECK = 5;
export const DOVETAIL_TIP = 8;
export const DOVETAIL_ANCHOR = 1.5;
export const DOVETAIL_CLEARANCE = 0.15;

// Tile-seam connector dimensions. Filament holes sit low in the existing seam
// floor; screw connectors keep a solid rail with an M3 clearance hole.
export const SCREW_CONNECTOR_WALL = 6;
export const SCREW_CONNECTOR_RADIUS = 1.7;
export const FILAMENT_PIN_DEPTH = 5;
export const FILAMENT_PIN_RADIUS = 0.9;
export const FILAMENT_PIN_Z = 1.6;
export const COMBINED_TILE_GAP = SCREW_CONNECTOR_WALL + 8;

export interface BaseplateCellCenter {
	x: number;
	y: number;
}

export function baseplateThickness(style: BaseplateParams['style']): number {
	return style === 'magnet' ? THICKNESS_MAGNET : THICKNESS_SIMPLE;
}

export function baseplateCellCorners(cells: readonly BaseplateCellCenter[]): [number, number][] {
	const seen = new Set<string>();
	const corners: [number, number][] = [];
	for (const cell of cells) {
		for (const [ox, oy] of CORNER_OFFSETS) {
			const x = cell.x + ox;
			const y = cell.y + oy;
			const key = `${x.toFixed(2)}:${y.toFixed(2)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			corners.push([x, y]);
		}
	}
	return corners;
}
