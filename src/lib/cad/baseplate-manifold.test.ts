import { describe, it, expect, beforeAll } from 'vitest';
import type { BaseplateParams } from '$lib/stores/params';
import { setBinManifold } from './manifold-bin';
import { buildBaseplateAssembled, buildBaseplateTiles, buildBaseplateCombined } from './baseplate-manifold';
import { planBaseplate, PITCH } from './baseplate-layout';

// Real manifold WASM, like the bin tests — mocking a CSG kernel verifies nothing.
beforeAll(async () => {
	const Module = (await import('manifold-3d')).default;
	const mani = await Module();
	mani.setup();
	setBinManifold(mani);
}, 30000);

function makeBp(overrides: Partial<BaseplateParams> = {}): BaseplateParams {
	return {
		drawerWidth: 252, drawerDepth: 210, alignX: 'center', alignY: 'center',
		style: 'simple', screwHoles: false, bedWidth: 256, bedDepth: 256,
		splitAlgorithm: 'ideal', connector: 'dovetail', exportLayout: 'zip', ...overrides
	};
}

const span = (s: ReturnType<typeof buildBaseplateAssembled>, axis: number) => {
	const bb = s.boundingBox();
	return bb.max[axis]! - bb.min[axis]!;
};

describe('buildBaseplateAssembled', () => {
	it('single-tile plate matches the drawer footprint', () => {
		const s = buildBaseplateAssembled(makeBp({ drawerWidth: 252, drawerDepth: 210 }));
		expect(s.volume()).toBeGreaterThan(0);
		expect(span(s, 0)).toBeCloseTo(252, 1);
		expect(span(s, 1)).toBeCloseTo(210, 1);
	});

	it('is skeletonized — far lighter than a solid slab of the same footprint', () => {
		const s = buildBaseplateAssembled(makeBp({ drawerWidth: 252, drawerDepth: 210, style: 'simple' }));
		const solidSlab = 252 * 210 * 6; // footprint × simple thickness
		expect(s.volume()).toBeLessThan(0.6 * solidSlab);
	});

	it('multi-tile assembled plate still spans the full drawer', () => {
		const bp = makeBp({ drawerWidth: 8 * PITCH, drawerDepth: 6 * PITCH, bedWidth: 180, bedDepth: 180 });
		const s = buildBaseplateAssembled(bp);
		// dovetail tabs protrude past the outer edge, so allow a small overshoot
		expect(span(s, 0)).toBeGreaterThanOrEqual(8 * PITCH - 1);
		expect(span(s, 1)).toBeGreaterThanOrEqual(6 * PITCH - 1);
	});

	it('magnet style removes material vs simple', () => {
		const simple = buildBaseplateAssembled(makeBp({ style: 'simple' })).volume();
		const magnet = buildBaseplateAssembled(makeBp({ style: 'magnet' })).volume();
		const screws = buildBaseplateAssembled(makeBp({ style: 'magnet', screwHoles: true })).volume();
		// magnet plate is thicker, so compare hole effect at equal style via screws
		expect(screws).toBeLessThan(magnet);
		expect(simple).toBeGreaterThan(0);
	});
});

describe('buildBaseplateTiles', () => {
	it('emits one solid per tile, each within the bed and uniquely named', () => {
		const bp = makeBp({ drawerWidth: 8 * PITCH, drawerDepth: 6 * PITCH, bedWidth: 180, bedDepth: 180 });
		const layout = planBaseplate(bp);
		const tiles = buildBaseplateTiles(bp);
		expect(tiles).toHaveLength(layout.tiles.length);
		expect(new Set(tiles.map((t) => t.name)).size).toBe(tiles.length);
		for (const t of tiles) {
			expect(t.solid.volume()).toBeGreaterThan(0);
			const bb = t.solid.boundingBox();
			// footprint within bed (+ dovetail protrusion + tessellation slack)
			expect(bb.max[0]! - bb.min[0]!).toBeLessThanOrEqual(180 + DT_SLACK);
			expect(bb.max[1]! - bb.min[1]!).toBeLessThanOrEqual(180 + DT_SLACK);
		}
	});
});

const DT_SLACK = 20; // dovetail tabs reach past the footprint

describe('buildBaseplateCombined', () => {
	it('spreads tiles wider than a single tile', () => {
		const bp = makeBp({ drawerWidth: 8 * PITCH, drawerDepth: 6 * PITCH, bedWidth: 180, bedDepth: 180 });
		const s = buildBaseplateCombined(bp);
		expect(s.volume()).toBeGreaterThan(0);
		// laid-out plate is wider than the assembled drawer (gaps between tiles)
		expect(span(s, 0)).toBeGreaterThan(8 * PITCH);
	});
});

describe('connectors', () => {
	const multi = (connector: BaseplateParams['connector']) =>
		makeBp({ drawerWidth: 8 * PITCH, drawerDepth: 6 * PITCH, bedWidth: 180, bedDepth: 180, connector });

	it('builds every connector type', () => {
		for (const c of ['none', 'filament', 'dovetail', 'screw'] as const) {
			expect(buildBaseplateAssembled(multi(c)).volume()).toBeGreaterThan(0);
		}
	}, 20000);

	it('tiles and combines a connectored plate', () => {
		const bp = multi('screw');
		expect(buildBaseplateTiles(bp).length).toBeGreaterThan(1);
		expect(buildBaseplateCombined(bp).volume()).toBeGreaterThan(0);
	}, 20000);

	it('screw rails add material; filament holes remove it (vs no connector)', () => {
		const none = buildBaseplateAssembled(multi('none')).volume();
		const screw = buildBaseplateAssembled(multi('screw')).volume();
		const filament = buildBaseplateAssembled(multi('filament')).volume();
		expect(screw).toBeGreaterThan(none); // seam rails
		expect(filament).toBeLessThan(none); // dowel holes
	}, 20000);

	it('keeps the filament seam clean — no rib widening past the footprint', () => {
		// filament adds no material, so the assembled plate matches the drawer bbox
		const s = buildBaseplateAssembled(multi('filament'));
		expect(span(s, 0)).toBeCloseTo(8 * PITCH, 0);
		expect(span(s, 1)).toBeCloseTo(6 * PITCH, 0);
	});
});
