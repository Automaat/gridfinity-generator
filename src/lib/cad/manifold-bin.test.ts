import { describe, it, expect, beforeAll } from 'vitest';
import type { BinParams } from '$lib/stores/params';
import { buildBinManifold, setBinManifold } from './manifold-bin';
import { manifoldToMesh } from './mesh-util';

// Unlike the OCCT path (which mocks replicad), the manifold engine is exercised
// against the real WASM — mocking a CSG kernel would verify nothing. manifold
// loads fine under Node/Vitest.
beforeAll(async () => {
	const Module = (await import('manifold-3d')).default;
	const mani = await Module();
	mani.setup();
	setBinManifold(mani);
}, 30000);

function makeParams(overrides: Partial<BinParams> = {}): BinParams {
	return {
		width: 1, length: 1, height: 3, wallThickness: 1.2, magnetHoles: false, screwHoles: false,
		stackingLip: 'none', labelTab: false, dividersX: 0, dividersY: 0, lightweightDividers: false,
		scoopWalls: [], scoopRadius: 0, wallCut: false, wallCutSide: 'front', wallCutLowFraction: 0,
		wallCutRun: 1, ...overrides
	};
}

const span = (s: ReturnType<typeof buildBinManifold>, axis: number) => {
	const bb = s.boundingBox();
	return bb.max[axis] - bb.min[axis];
};

describe('buildBinManifold', () => {
	it('default bin has the expected outer dimensions', () => {
		const s = buildBinManifold(makeParams({ width: 2, length: 1, height: 3, stackingLip: 'standard' }));
		expect(span(s, 0)).toBeCloseTo(2 * 42 - 0.5, 1); // width 83.5mm
		expect(span(s, 1)).toBeCloseTo(42 - 0.5, 1); // length 41.5mm
		expect(span(s, 2)).toBeCloseTo(3 * 7, 1); // height 21mm
		expect(s.volume()).toBeGreaterThan(0);
	});

	it('scales footprint with grid size', () => {
		const s = buildBinManifold(makeParams({ width: 4, length: 3 }));
		expect(span(s, 0)).toBeCloseTo(4 * 42 - 0.5, 1);
		expect(span(s, 1)).toBeCloseTo(3 * 42 - 0.5, 1);
	});

	it('magnet and screw holes remove material', () => {
		const solid = buildBinManifold(makeParams({ width: 2, length: 2 })).volume();
		const holes = buildBinManifold(makeParams({ width: 2, length: 2, magnetHoles: true, screwHoles: true })).volume();
		expect(holes).toBeLessThan(solid);
	});

	it('lip style changes geometry but not the fixed overall height', () => {
		const none = buildBinManifold(makeParams({ height: 4, stackingLip: 'none' }));
		const std = buildBinManifold(makeParams({ height: 4, stackingLip: 'standard' }));
		const reduced = buildBinManifold(makeParams({ height: 4, stackingLip: 'reduced' }));
		// p.height fixes the overall height regardless of lip style
		expect(span(none, 2)).toBeCloseTo(28, 1);
		expect(span(std, 2)).toBeCloseTo(28, 1);
		expect(span(reduced, 2)).toBeCloseTo(28, 1);
		// each lip profile is distinct geometry
		expect(Math.abs(std.volume() - none.volume())).toBeGreaterThan(1);
		expect(Math.abs(std.volume() - reduced.volume())).toBeGreaterThan(1);
	});

	it('dividers add material inside the cavity', () => {
		const plain = buildBinManifold(makeParams({ width: 3, length: 2, height: 5 })).volume();
		const divided = buildBinManifold(makeParams({ width: 3, length: 2, height: 5, dividersX: 2, dividersY: 1 })).volume();
		expect(divided).toBeGreaterThan(plain);
	});

	it('returns base-only solid when wall height collapses', () => {
		// height=1 (7mm) with standard lip ⇒ wallHeight negative ⇒ base + floor only
		const s = buildBinManifold(makeParams({ height: 1, stackingLip: 'standard' }));
		expect(s.volume()).toBeGreaterThan(0);
		expect(span(s, 2)).toBeLessThanOrEqual(7 + 0.01);
	});

	it('scoops on every wall add material without changing footprint', () => {
		const plain = buildBinManifold(makeParams({ width: 3, length: 2, height: 5 }));
		const scooped = buildBinManifold(makeParams({ width: 3, length: 2, height: 5, scoopWalls: ['back', 'front', 'left', 'right'] }));
		expect(scooped.volume()).toBeGreaterThan(plain.volume());
		expect(span(scooped, 0)).toBeCloseTo(span(plain, 0), 1);
		expect(span(scooped, 1)).toBeCloseTo(span(plain, 1), 1);
	});

	it('label tabs add material at the top', () => {
		const plain = buildBinManifold(makeParams({ width: 3, height: 5 })).volume();
		const tabbed = buildBinManifold(makeParams({ width: 3, height: 5, labelTab: true })).volume();
		expect(tabbed).toBeGreaterThan(plain);
	});

	it('lightweight dividers remove material vs solid dividers (both axes)', () => {
		for (const o of [{ dividersX: 1 }, { dividersY: 1 }]) {
			const solid = buildBinManifold(makeParams({ width: 2, length: 2, height: 6, ...o })).volume();
			const light = buildBinManifold(makeParams({ width: 2, length: 2, height: 6, lightweightDividers: true, ...o })).volume();
			expect(light).toBeLessThan(solid);
		}
	});

	it('wall cut removes material on every side', () => {
		const plain = buildBinManifold(makeParams({ width: 3, length: 2, height: 6 })).volume();
		for (const wallCutSide of ['front', 'back', 'left', 'right'] as const) {
			const cut = buildBinManifold(makeParams({ width: 3, length: 2, height: 6, wallCut: true, wallCutSide, wallCutLowFraction: 0.2 }));
			expect(cut.volume()).toBeGreaterThan(0);
			expect(cut.volume()).toBeLessThan(plain);
		}
	});

	it('builds an all-features bin without error', () => {
		const s = buildBinManifold(makeParams({
			width: 3, length: 2, height: 6, magnetHoles: true, screwHoles: true, stackingLip: 'standard',
			labelTab: true, dividersX: 2, dividersY: 1, scoopWalls: ['back'], wallCut: true, wallCutSide: 'front'
		}));
		expect(s.volume()).toBeGreaterThan(0);
	});
});

describe('manifoldToMesh', () => {
	it('produces finite, non-empty render data with feature edges', () => {
		const m = manifoldToMesh(buildBinManifold(makeParams({ width: 3, length: 2, magnetHoles: true })));
		expect(m.vertices.length).toBeGreaterThan(0);
		expect(m.triangles.length).toBeGreaterThan(0);
		expect(m.normals.length).toBe(m.vertices.length);
		expect(m.edges.length).toBeGreaterThan(0);
		expect(m.edges.length % 6).toBe(0); // pairs of xyz points
		for (const v of m.vertices) expect(Number.isFinite(v)).toBe(true);
		for (const n of m.normals) expect(Number.isFinite(n)).toBe(true);
	});

	it('triangle indices stay within the vertex range', () => {
		const m = manifoldToMesh(buildBinManifold(makeParams({ width: 2, length: 1 })));
		const vertCount = m.vertices.length / 3;
		let maxIdx = 0;
		for (const i of m.triangles) maxIdx = Math.max(maxIdx, i);
		expect(maxIdx).toBeLessThan(vertCount);
	});
});
