import type { BinParams } from '$lib/stores/params';

const GRID_UNIT = 42;
const HEIGHT_UNIT = 7;
const TOLERANCE = 0.5;
const BASE_PROFILE_HEIGHT = 4.75;
const FLOOR_THICKNESS = 2.25;
const PLA_DENSITY = 1.24; // g/cm³
const FILAMENT_DIAMETER = 1.75; // mm
const FILAMENT_CROSS_SECTION = Math.PI * (FILAMENT_DIAMETER / 2) ** 2; // mm²

export interface PrintEstimate {
	volumeCm3: number;
	filamentGrams: number;
	filamentMeters: number;
	printTimeMinutes: number;
}

export function estimatePrint(p: BinParams): PrintEstimate {
	const bodyW = p.width * GRID_UNIT - TOLERANCE;
	const bodyL = p.length * GRID_UNIT - TOLERANCE;
	const heightMm = p.height * HEIGHT_UNIT;
	const innerW = bodyW - 2 * p.wallThickness;
	const innerL = bodyL - 2 * p.wallThickness;

	const lipHeight =
		p.stackingLip === 'standard' ? BASE_PROFILE_HEIGHT : p.stackingLip === 'reduced' ? 2.15 : 0;

	const wallBottom = BASE_PROFILE_HEIGHT + FLOOR_THICKNESS;
	const wallHeight = Math.max(0, heightMm - wallBottom - lipHeight);

	// Base profile (approximate as 60% fill of bounding box)
	let volumeMm3 = bodyW * bodyL * BASE_PROFILE_HEIGHT * 0.6;

	// Floor plate
	volumeMm3 += bodyW * bodyL * FLOOR_THICKNESS;

	// Walls (hollow shell)
	volumeMm3 += (bodyW * bodyL - innerW * innerL) * wallHeight;

	// Stacking lip (approximate as shell)
	if (lipHeight > 0) {
		const lipInnerW = bodyW - 2 * 2.95;
		const lipInnerL = bodyL - 2 * 2.95;
		volumeMm3 += (bodyW * bodyL - lipInnerW * lipInnerL) * lipHeight;
	}

	// Dividers
	const dividerFill = p.lightweightDividers ? 0.45 : 1.0;
	if (p.dividersX > 0) {
		volumeMm3 += p.dividersX * p.wallThickness * innerL * wallHeight * dividerFill;
	}
	if (p.dividersY > 0) {
		volumeMm3 += p.dividersY * innerW * p.wallThickness * wallHeight * dividerFill;
	}

	const volumeCm3 = volumeMm3 / 1000;
	const filamentGrams = volumeCm3 * PLA_DENSITY;
	const filamentMeters = volumeMm3 / FILAMENT_CROSS_SECTION / 1000;
	const layers = heightMm / 0.2;
	const printTimeMinutes = Math.round(volumeCm3 * 8 + layers * 0.5);

	return {
		volumeCm3: Math.round(volumeCm3 * 10) / 10,
		filamentGrams: Math.round(filamentGrams),
		filamentMeters: Math.round(filamentMeters * 10) / 10,
		printTimeMinutes
	};
}
