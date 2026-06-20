import type { Seam } from './baseplate-layout';
import {
	DOVETAIL_ANCHOR,
	DOVETAIL_CLEARANCE,
	DOVETAIL_DEPTH,
	DOVETAIL_NECK,
	DOVETAIL_TIP
} from './baseplate-spec';

export type ConnectorPoint = [number, number];

export interface DovetailTabSpec {
	points: ConnectorPoint[];
	z: number;
	height: number;
}

export interface PinRailSpec {
	w: number;
	l: number;
	cx: number;
	cy: number;
}

export interface PinHoleSpec {
	axis: Seam['axis'];
	length: number;
	start: number;
	x: number;
	y: number;
	z: number;
}

const PIN_HOLE_EXTRA_LENGTH = 0.4;
const PIN_HOLE_FACE_OVERLAP = 0.2;
const FEMALE_Z_OVERSHOOT = 0.1;

function orientSeamPoints(seam: Seam, points: ConnectorPoint[]): ConnectorPoint[] {
	return seam.axis === 'x' ? points : points.map(([p, q]) => [q, p]);
}

export function dovetailTabSpec(seam: Seam, along: number, thickness: number, female: boolean): DovetailTabSpec {
	const c = female ? DOVETAIL_CLEARANCE : 0;
	const neck = DOVETAIL_NECK / 2 + c;
	const tip = DOVETAIL_TIP / 2 + c;
	const depth = DOVETAIL_DEPTH + c;
	const dir = female ? seam.bodyDir : -seam.bodyDir;
	const anchor = female ? 0 : DOVETAIL_ANCHOR;
	const pNeck = seam.pos - dir * anchor;
	const pTip = seam.pos + dir * depth;
	const points: ConnectorPoint[] = [
		[pNeck, along - neck],
		[pNeck, along + neck],
		[pTip, along + tip],
		[pTip, along - tip]
	];

	return {
		points: orientSeamPoints(seam, points),
		z: female ? -FEMALE_Z_OVERSHOOT : 0,
		height: female ? thickness + 2 * FEMALE_Z_OVERSHOOT : thickness
	};
}

export function pinRailSpec(seam: Seam, wall: number): PinRailSpec {
	const len = seam.max - seam.min;
	const mid = (seam.min + seam.max) / 2;
	const into = seam.pos + (seam.bodyDir * wall) / 2;
	return seam.axis === 'x'
		? { w: wall, l: len, cx: into, cy: mid }
		: { w: len, l: wall, cx: mid, cy: into };
}

export function pinHoleSpec(seam: Seam, along: number, depth: number, z: number): PinHoleSpec {
	const length = depth + PIN_HOLE_EXTRA_LENGTH;
	const start = seam.bodyDir > 0 ? seam.pos - PIN_HOLE_FACE_OVERLAP : seam.pos - length + PIN_HOLE_FACE_OVERLAP;
	return {
		axis: seam.axis,
		length,
		start,
		x: seam.axis === 'x' ? start : along,
		y: seam.axis === 'x' ? along : start,
		z
	};
}
