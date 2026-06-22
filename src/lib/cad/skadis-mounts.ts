import type { SkadisParams } from '$lib/stores/params';
import type { HexPanelAxis } from './hex-lattice';
import {
	BOARD_THICKNESS,
	frontWallCutZ,
	outerDims,
	sideWallCutZ,
	type SkadisLayout
} from './skadis-layout';

export type MountProfilePoint = [number, number];

export const SKADIS_HOOK_WIDTH = 4.4;
export const SKADIS_MOUNT_BAND = 12;
export const SKADIS_SCREW_CLEARANCE_RADIUS = 2.75;
export const SKADIS_SCREW_SEGMENTS = 48;

const ARM_OVERLAP = 1.2;
const ARM_TOP = 2;
const ARM_THICKNESS = 3;
const CATCH_FRONT_Y = BOARD_THICKNESS + 0.4;
const LIP_THICKNESS = 2;
const LIP_DROP = 8;
const SCREW_HOLE_Y_OVERSHOOT = 1;

export interface SkadisScrewHoleSpec {
	radius: number;
	yStart: number;
	length: number;
	x: number;
	z: number;
}

export type SkadisHexPanelName = 'left' | 'right' | 'front' | 'back' | 'floor';

export interface SkadisHexPanel {
	name: SkadisHexPanelName;
	axis: HexPanelAxis;
	faceW: number;
	faceH: number;
	thickness: number;
	cx: number;
	cy: number;
	cz: number;
}

// Y-Z profile of one drop-catch hook centered on row z; back wall outer face at Y=0,
// board into -Y. The arm passes through the slot and the lip drops behind the board.
export function skadisHookProfile(z: number): MountProfilePoint[] {
	const top = z + ARM_TOP;
	const armBottom = top - ARM_THICKNESS;
	const armReach = CATCH_FRONT_Y + LIP_THICKNESS;
	return [
		[ARM_OVERLAP, top],
		[-armReach, top],
		[-armReach, z - LIP_DROP],
		[-CATCH_FRONT_Y, z - LIP_DROP],
		[-CATCH_FRONT_Y, armBottom],
		[ARM_OVERLAP, armBottom]
	];
}

export function skadisScrewHoleSpec(x: number, z: number, wallThickness: number): SkadisScrewHoleSpec {
	return {
		radius: SKADIS_SCREW_CLEARANCE_RADIUS,
		yStart: -SCREW_HOLE_Y_OVERSHOOT,
		length: wallThickness + 2 * SCREW_HOLE_Y_OVERSHOOT,
		x,
		z
	};
}

// Hex panels for a lightweight Skadis box. The back wall stops below the mount band
// so hooks or screw holes land in solid material.
export function skadisHexPanels(p: SkadisParams, layout: SkadisLayout): SkadisHexPanel[] {
	const t = p.wallThickness;
	const { outerW, outerD, outerH } = outerDims(p);
	const frontH = p.openFront ? frontWallCutZ(p) : outerH;
	const sideZ = p.openSides ? sideWallCutZ(p) : outerH;
	const frontFaceH = frontH - t;
	const sideFaceH = sideZ - t;
	const lowestHookZ = layout.hooks.length > 0 ? Math.min(...layout.hooks.map((h) => h.z)) : outerH;
	const backFaceH = lowestHookZ - SKADIS_MOUNT_BAND - t;

	return [
		{
			name: 'left',
			axis: 'X',
			faceW: p.depth,
			faceH: sideFaceH,
			thickness: t,
			cx: -outerW / 2 + t / 2,
			cy: outerD / 2,
			cz: t + sideFaceH / 2
		},
		{
			name: 'right',
			axis: 'X',
			faceW: p.depth,
			faceH: sideFaceH,
			thickness: t,
			cx: outerW / 2 - t / 2,
			cy: outerD / 2,
			cz: t + sideFaceH / 2
		},
		{
			name: 'front',
			axis: 'Y',
			faceW: p.width,
			faceH: frontFaceH,
			thickness: t,
			cx: 0,
			cy: outerD - t / 2,
			cz: t + frontFaceH / 2
		},
		{
			name: 'back',
			axis: 'Y',
			faceW: p.width,
			faceH: backFaceH,
			thickness: t,
			cx: 0,
			cy: t / 2,
			cz: t + backFaceH / 2
		},
		{
			name: 'floor',
			axis: 'Z',
			faceW: p.width,
			faceH: p.depth,
			thickness: t,
			cx: 0,
			cy: outerD / 2,
			cz: t / 2
		}
	];
}
