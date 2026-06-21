import { BOARD_THICKNESS } from './skadis-layout';

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
