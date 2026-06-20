import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { SkadisParams } from '$lib/stores/params';

// Mirror baseplate-occt.test.ts: exercise the replicad orchestration in skadis-occt
// against a structural mock of the chainable API, plus mocks for the OpenCascade
// WASM imports so the module loads without the ~4.6MB kernel.
interface MockSolid {
	fuse: Mock<(other: MockSolid) => MockSolid>;
	cut: Mock<(other: MockSolid) => MockSolid>;
	translate: Mock<(x: number, y: number, z: number) => MockSolid>;
	blobSTEP: Mock<() => Blob>;
}
interface MockSketch {
	extrude: Mock<(height: number) => MockSolid>;
}
interface MockSketchOnPlane {
	sketchOnPlane: Mock<(plane?: string, origin?: number) => MockSketch>;
}
interface MockDrawing {
	lineTo: Mock<(point: [number, number]) => MockDrawing>;
	close: Mock<() => MockSketchOnPlane>;
}

function mockSolid(): MockSolid {
	return {
		fuse: vi.fn<(other: MockSolid) => MockSolid>(() => mockSolid()),
		cut: vi.fn<(other: MockSolid) => MockSolid>(() => mockSolid()),
		translate: vi.fn<(x: number, y: number, z: number) => MockSolid>(() => mockSolid()),
		blobSTEP: vi.fn<() => Blob>(() => new Blob())
	};
}
function mockSketch(): MockSketch {
	return { extrude: vi.fn<(height: number) => MockSolid>(() => mockSolid()) };
}
function mockSketchOnPlane(): MockSketchOnPlane {
	return { sketchOnPlane: vi.fn<(plane?: string, origin?: number) => MockSketch>(() => mockSketch()) };
}
function mockDrawing(): MockDrawing {
	return {
		lineTo: vi.fn<(point: [number, number]) => MockDrawing>(() => mockDrawing()),
		close: vi.fn<() => MockSketchOnPlane>(() => mockSketchOnPlane())
	};
}

vi.mock('replicad', () => ({
	draw: vi.fn<(start?: [number, number]) => MockDrawing>(() => mockDrawing()),
	drawCircle: vi.fn<(r: number) => MockSketchOnPlane>(() => mockSketchOnPlane()),
	drawRoundedRectangle: vi.fn<(w: number, l: number, r?: number) => MockSketchOnPlane>(() => mockSketchOnPlane()),
	makeCompound: vi.fn<(shapes: MockSolid[]) => MockSolid>(() => mockSolid()),
	setOC: vi.fn<() => void>(() => undefined)
}));
vi.mock('replicad-opencascadejs/src/replicad_single.js', () => ({ default: vi.fn<() => Promise<object>>(async () => ({})) }));
vi.mock('replicad-opencascadejs/src/replicad_single.wasm?url', () => ({ default: 'replicad.wasm' }));
// Keep the real hex math but spy on hexCells so a test can assert the faceH passed
// for each panel (the structural replicad mock can't measure geometry).
vi.mock('./hex-lattice', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./hex-lattice')>();
	return { ...actual, hexCells: vi.fn<typeof actual.hexCells>(actual.hexCells) };
});

const { buildOcctSkadis } = await import('./skadis-occt');
const replicad = await import('replicad');
const { hexCells } = await import('./hex-lattice');
const { frontWallCutZ, sideWallCutZ } = await import('./skadis-layout');

function makeSk(overrides: Partial<SkadisParams> = {}): SkadisParams {
	return { width: 120, height: 80, depth: 50, wallThickness: 2, mountType: 'hook', hookRows: 1, openFront: false, frontWallHeight: 30, openSides: false, sideWallHeight: 30, lightweightWalls: false, ...overrides };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('buildOcctSkadis', () => {
	it('builds a solid and initializes OpenCascade once', async () => {
		const result = await buildOcctSkadis(makeSk());
		expect(result).toBeDefined();
		expect(replicad.setOC).toHaveBeenCalled();
		expect(replicad.drawRoundedRectangle).toHaveBeenCalled(); // shell + cavity + hooks
	});

	it('fuses the hooks via a compound', async () => {
		await buildOcctSkadis(makeSk());
		expect(replicad.makeCompound).toHaveBeenCalled();
	});

	it('builds with one and two hook rows, open and closed front', async () => {
		for (const hookRows of [1, 2] as const) {
			for (const openFront of [false, true] as const) {
				const result = await buildOcctSkadis(makeSk({ height: 150, hookRows, openFront }));
				expect(result).toBeDefined();
			}
		}
	});

	it('screw mount: bores flush clearance holes (drawCircle) instead of fusing hooks', async () => {
		const result = await buildOcctSkadis(makeSk({ mountType: 'screw' }));
		expect(result).toBeDefined();
		expect(replicad.drawCircle).toHaveBeenCalled(); // clearance-hole cylinders
		expect(replicad.makeCompound).toHaveBeenCalled(); // holes cut as one compound
	});

	it('handles a narrow single-column box', async () => {
		expect(await buildOcctSkadis(makeSk({ width: 30 }))).toBeDefined();
	});

	it('builds with open side walls at a chosen height', async () => {
		expect(await buildOcctSkadis(makeSk({ openSides: true, sideWallHeight: 25 }))).toBeDefined();
		expect(await buildOcctSkadis(makeSk({ openFront: true, openSides: true, sideWallHeight: 40 }))).toBeDefined();
	});

	it('cuts hex lattice cutters when lightweight walls are on', async () => {
		await buildOcctSkadis(makeSk({ width: 120, height: 90, depth: 55, lightweightWalls: true }));
		expect(replicad.draw).toHaveBeenCalled(); // hexagon outlines
	});

	it('sizes lowered front/side hex panels to the exposed wall height (not full interior)', async () => {
		const p = makeSk({ width: 120, height: 80, depth: 50, wallThickness: 2, openFront: true, frontWallHeight: 30, openSides: true, sideWallHeight: 25, lightweightWalls: true });
		await buildOcctSkadis(p);
		const calls = vi.mocked(hexCells).mock.calls;
		// front panel: faceW = interior width, faceH = exposed front height; sides: depth + exposed side height.
		expect(calls).toContainEqual([p.width, frontWallCutZ(p) - p.wallThickness]);
		expect(calls).toContainEqual([p.depth, sideWallCutZ(p) - p.wallThickness]);
		// Guard against reverting to full interior height (the sliced-rim bug).
		expect(calls).not.toContainEqual([p.width, p.height]);
		expect(calls).not.toContainEqual([p.depth, p.height]);
	});
});
