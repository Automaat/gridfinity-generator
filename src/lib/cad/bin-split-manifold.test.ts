import { describe, it, expect, beforeAll } from 'vitest';
import type { BinParams } from '$lib/stores/params';
import { setBinManifold, buildBinManifold } from './manifold-bin';
import { buildBinSplitPreview, buildBinSplitTiles, buildBinSplitCombined } from './bin-split-manifold';
import { planBinSplit } from './bin-split';
import { manifoldToMesh } from './mesh-util';

// Real manifold WASM, like the other geometry tests — mocking a CSG kernel proves
// nothing about the booleans.
beforeAll(async () => {
	const Module = (await import('manifold-3d')).default;
	const mani = await Module();
	mani.setup();
	setBinManifold(mani);
}, 30000);

function makeParams(overrides: Partial<BinParams> = {}): BinParams {
	return {
		width: 6, length: 6, height: 3, wallThickness: 1.2, magnetHoles: false, magnetCornersOnly: false, screwHoles: false,
		stackingLip: 'standard', labelTab: false, dividersX: 0, dividersY: 0, lightweightDividers: false,
		scoopWalls: [], scoopRadius: 0, wallCut: false, wallCutSide: 'front', wallCutLowFraction: 0, wallCutRun: 1,
		splitToFit: true, bedWidth: 220, bedDepth: 220, splitAlgorithm: 'ideal', splitLayout: 'zip', ...overrides
	};
}

const span = (s: ReturnType<typeof buildBinManifold>, axis: number) => {
	const bb = s.boundingBox();
	return bb.max[axis]! - bb.min[axis]!;
};

describe('buildBinSplitPreview', () => {
	it('returns the whole bin unchanged when it fits one bed', () => {
		const p = makeParams({ width: 2, length: 1, bedWidth: 256, bedDepth: 256 });
		const preview = buildBinSplitPreview(p).volume();
		const whole = buildBinManifold(p).volume();
		expect(preview).toBeCloseTo(whole, 3);
	});

	it('explodes a split bin slightly past its footprint so the seams show', () => {
		const p = makeParams({ width: 6, length: 6, bedWidth: 220, bedDepth: 220 });
		const s = buildBinSplitPreview(p);
		// 2×2 pieces pushed apart by the preview gap -> a touch wider than the bin
		expect(span(s, 0)).toBeGreaterThan(6 * 42 - 0.5);
		expect(s.volume()).toBeGreaterThan(0);
	});

	it('meshes into the buffers the worker renders — non-empty, finite, with seam edges', () => {
		// Mirrors the worker `build` path for a split bin: preview -> mesh buffers.
		const p = makeParams({ width: 6, length: 6, bedWidth: 220, bedDepth: 220 });
		const { vertices, triangles, normals, edges } = manifoldToMesh(buildBinSplitPreview(p));
		expect(vertices.length).toBeGreaterThan(0);
		expect(triangles.length).toBeGreaterThan(0);
		expect(normals.length).toBe(vertices.length);
		expect(edges.length).toBeGreaterThan(0); // cut faces add visible boundary edges
		expect(vertices.every((v) => Number.isFinite(v))).toBe(true);
	});
});

describe('buildBinSplitTiles', () => {
	it('emits one solid per piece, uniquely named, each within the bed', () => {
		const p = makeParams({ width: 6, length: 6, bedWidth: 220, bedDepth: 220 });
		const plan = planBinSplit(p.width, p.length, p.bedWidth, p.bedDepth, p.splitAlgorithm);
		const tiles = buildBinSplitTiles(p);
		expect(tiles).toHaveLength(plan.pieces.length);
		expect(new Set(tiles.map((t) => t.name)).size).toBe(tiles.length);
		for (const t of tiles) {
			expect(t.solid.volume()).toBeGreaterThan(0);
			const bb = t.solid.boundingBox();
			expect(bb.max[0]! - bb.min[0]!).toBeLessThanOrEqual(220 + 0.5);
			expect(bb.max[1]! - bb.min[1]!).toBeLessThanOrEqual(220 + 0.5);
		}
	});

	it('conserves volume — flush cuts neither add nor remove material', () => {
		const p = makeParams({ width: 6, length: 4, bedWidth: 180, bedDepth: 180, magnetHoles: true });
		const whole = buildBinManifold(p, { segments: 64 }).volume();
		const sum = buildBinSplitTiles(p).reduce((v, t) => v + t.solid.volume(), 0);
		expect(sum / whole).toBeCloseTo(1, 4);
	});

	it('splits along grid lines even with dividers and a label tab', () => {
		const p = makeParams({ width: 6, length: 2, dividersX: 2, labelTab: true, bedWidth: 180, bedDepth: 180 });
		const tiles = buildBinSplitTiles(p);
		expect(tiles.length).toBeGreaterThan(1);
		for (const t of tiles) expect(t.solid.volume()).toBeGreaterThan(0);
	});
});

describe('buildBinSplitCombined', () => {
	it('spreads the pieces wider than the assembled bin', () => {
		const p = makeParams({ width: 6, length: 6, bedWidth: 220, bedDepth: 220 });
		const s = buildBinSplitCombined(p);
		expect(s.volume()).toBeGreaterThan(0);
		expect(span(s, 0)).toBeGreaterThan(6 * 42); // gaps between laid-out pieces
	});

	it('combined volume equals the sum of the pieces', () => {
		const p = makeParams({ width: 6, length: 3, bedWidth: 180, bedDepth: 180 });
		const combined = buildBinSplitCombined(p).volume();
		const whole = buildBinManifold(p, { segments: 64 }).volume();
		expect(combined / whole).toBeCloseTo(1, 4);
	});
});
