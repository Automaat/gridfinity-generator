import { describe, it, expect, beforeAll } from 'vitest';
import type { SkadisParams } from '$lib/stores/params';
import { setBinManifold } from './manifold-bin';
import { buildSkadisManifold } from './skadis-manifold';
import { planSkadis, BOARD_THICKNESS } from './skadis-layout';

// Real manifold WASM, like the bin/baseplate tests — mocking a CSG kernel verifies nothing.
beforeAll(async () => {
	const Module = (await import('manifold-3d')).default;
	const mani = await Module();
	mani.setup();
	setBinManifold(mani);
}, 30000);

function makeSk(overrides: Partial<SkadisParams> = {}): SkadisParams {
	return { width: 120, height: 80, depth: 50, wallThickness: 2, hookRows: 1, openFront: false, lightweightWalls: false, ...overrides };
}

const span = (s: ReturnType<typeof buildSkadisManifold>, axis: number) => {
	const bb = s.boundingBox();
	return bb.max[axis]! - bb.min[axis]!;
};

describe('buildSkadisManifold', () => {
	it('outer footprint is interior + walls, sitting on Z=0', () => {
		// width/height/depth are interior; 2mm walls add 4mm in X/Y, 2mm floor in Z.
		const s = buildSkadisManifold(makeSk({ width: 120, height: 80, depth: 50, wallThickness: 2 }));
		expect(s.volume()).toBeGreaterThan(0);
		expect(span(s, 0)).toBeCloseTo(124, 1); // 120 interior + 2×2 walls
		expect(s.boundingBox().min[2]!).toBeCloseTo(0, 3); // bottom rests on the floor
		expect(s.boundingBox().max[2]!).toBeCloseTo(82, 1); // 80 interior + 2 floor
	});

	it('is hollow — far lighter than a solid block of the same outer size', () => {
		const s = buildSkadisManifold(makeSk({ wallThickness: 2 }));
		expect(s.volume()).toBeLessThan(0.5 * 124 * 54 * 82);
	});

	it('protrudes hooks behind the board face (into -Y)', () => {
		const s = buildSkadisManifold(makeSk());
		// Box body spans Y [0, depth]; hooks reach back past the board thickness.
		expect(s.boundingBox().min[1]!).toBeLessThan(-BOARD_THICKNESS);
	});

	it('adds material as hook rows increase', () => {
		const one = buildSkadisManifold(makeSk({ height: 150, hookRows: 1 })).volume();
		const two = buildSkadisManifold(makeSk({ height: 150, hookRows: 2 })).volume();
		expect(planSkadis(makeSk({ height: 150, hookRows: 2 })).rows).toBe(2);
		expect(two).toBeGreaterThan(one);
	});

	it('open front removes material', () => {
		const closed = buildSkadisManifold(makeSk({ openFront: false })).volume();
		const open = buildSkadisManifold(makeSk({ openFront: true })).volume();
		expect(open).toBeLessThan(closed);
	});

	it('builds a narrow single-column box', () => {
		const s = buildSkadisManifold(makeSk({ width: 30 }));
		expect(s.volume()).toBeGreaterThan(0);
	});

	it('lightweight walls remove material but keep the outer footprint', () => {
		const solid = buildSkadisManifold(makeSk({ width: 120, height: 90, depth: 55, wallThickness: 2 }));
		const hex = buildSkadisManifold(makeSk({ width: 120, height: 90, depth: 55, wallThickness: 2, lightweightWalls: true }));
		expect(hex.volume()).toBeLessThan(solid.volume()); // hex cutouts saved filament
		expect(span(hex, 0)).toBeCloseTo(span(solid, 0), 1); // envelope unchanged
		expect(span(hex, 2)).toBeCloseTo(span(solid, 2), 1);
	});
});
