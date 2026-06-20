import type { BinParams } from '$lib/stores/params';
import {
	BASE_PROFILE_HEIGHT,
	FLOOR_THICKNESS,
	LIP_OFFSET_BOTTOM,
	WALL_BOTTOM,
	bodySize,
	lipProfileHeight,
	lipProtrusion,
	nominalHeight
} from '$lib/cad/gridfinity-spec';

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
	const bodyW = bodySize(p.width);
	const bodyL = bodySize(p.length);
	const heightMm = nominalHeight(p.height);
	const innerW = bodyW - 2 * p.wallThickness;
	const innerL = bodyL - 2 * p.wallThickness;

	const lipHeight = lipProfileHeight(p.stackingLip);
	const protrusion = lipProtrusion(p.stackingLip);

	// Walls fill the nominal height; the lip protrudes above it. When the wall
	// collapses (e.g. height=1) the CAD builders emit base + floor only — no lip.
	const wallHeight = Math.max(0, heightMm - WALL_BOTTOM);
	const hasLip = lipHeight > 0 && wallHeight > 0;
	const effectiveProtrusion = hasLip ? protrusion : 0;

	// Base profile (approximate as 60% fill of bounding box)
	let volumeMm3 = bodyW * bodyL * BASE_PROFILE_HEIGHT * 0.6;

	// Floor plate
	volumeMm3 += bodyW * bodyL * FLOOR_THICKNESS;

	// Walls (hollow shell)
	volumeMm3 += (bodyW * bodyL - innerW * innerL) * wallHeight;

	// Stacking lip (approximate as a shell over its protrusion above the walls)
	if (hasLip) {
		const lipInnerW = bodyW - 2 * LIP_OFFSET_BOTTOM;
		const lipInnerL = bodyL - 2 * LIP_OFFSET_BOTTOM;
		volumeMm3 += (bodyW * bodyL - lipInnerW * lipInnerL) * protrusion;
	}

	// Dividers
	const dividerFill = p.lightweightDividers ? 0.38 : 1.0;
	if (p.dividersX > 0) {
		volumeMm3 += p.dividersX * p.wallThickness * innerL * wallHeight * dividerFill;
	}
	if (p.dividersY > 0) {
		volumeMm3 += p.dividersY * innerW * p.wallThickness * wallHeight * dividerFill;
	}

	const volumeCm3 = volumeMm3 / 1000;
	const filamentGrams = volumeCm3 * PLA_DENSITY;
	const filamentMeters = volumeMm3 / FILAMENT_CROSS_SECTION / 1000;
	const layers = (heightMm + effectiveProtrusion) / 0.2;
	const printTimeMinutes = Math.round(volumeCm3 * 8 + layers * 0.5);

	return {
		volumeCm3: Math.round(volumeCm3 * 10) / 10,
		filamentGrams: Math.round(filamentGrams),
		filamentMeters: Math.round(filamentMeters * 10) / 10,
		printTimeMinutes
	};
}
