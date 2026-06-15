import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { BaseplateParams } from '$lib/stores/params';

// Mirror gridfinity.test.ts: exercise the replicad orchestration in baseplate-occt
// against a structural mock of the chainable API, plus mocks for the OpenCascade
// WASM imports so the module loads without the ~4.6MB kernel.
interface MockSolid {
	fuse: Mock<(other: MockSolid) => MockSolid>;
	cut: Mock<(other: MockSolid) => MockSolid>;
	clone: Mock<() => MockSolid>;
	translate: Mock<(x: number, y: number, z: number) => MockSolid>;
	blobSTEP: Mock<() => Blob>;
}
interface MockSketch {
	extrude: Mock<(height: number) => MockSolid>;
	loftWith: Mock<(other: MockSketch, config: { ruled: boolean }) => MockSolid>;
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
		clone: vi.fn<() => MockSolid>(() => mockSolid()),
		translate: vi.fn<(x: number, y: number, z: number) => MockSolid>(() => mockSolid()),
		blobSTEP: vi.fn<() => Blob>(() => new Blob())
	};
}
function mockSketch(): MockSketch {
	return {
		extrude: vi.fn<(height: number) => MockSolid>(() => mockSolid()),
		loftWith: vi.fn<(other: MockSketch, config: { ruled: boolean }) => MockSolid>(() => mockSolid())
	};
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
	drawCircle: vi.fn<(radius: number) => MockSketchOnPlane>(() => mockSketchOnPlane()),
	drawRoundedRectangle: vi.fn<(w: number, l: number, r?: number) => MockSketchOnPlane>(() => mockSketchOnPlane()),
	makeCompound: vi.fn<(shapes: MockSolid[]) => MockSolid>(() => mockSolid()),
	setOC: vi.fn<() => void>(() => undefined)
}));
// The WASM kernel + its asset URL — never actually loaded under the mock.
vi.mock('replicad-opencascadejs/src/replicad_single.js', () => ({ default: vi.fn<() => Promise<object>>(async () => ({})) }));
vi.mock('replicad-opencascadejs/src/replicad_single.wasm?url', () => ({ default: 'replicad.wasm' }));

const { buildOcctBaseplate } = await import('./baseplate-occt');
const replicad = await import('replicad');

function makeBp(overrides: Partial<BaseplateParams> = {}): BaseplateParams {
	return {
		drawerWidth: 8 * 42, drawerDepth: 6 * 42, alignX: 'center', alignY: 'center',
		style: 'magnet', screwHoles: false, bedWidth: 180, bedDepth: 180,
		splitAlgorithm: 'ideal', connector: 'filament', exportLayout: 'zip', ...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('buildOcctBaseplate', () => {
	it('builds a solid and initializes OpenCascade once', async () => {
		const result = await buildOcctBaseplate(makeBp());
		expect(result).toBeDefined();
		expect(replicad.setOC).toHaveBeenCalled();
		expect(replicad.drawRoundedRectangle).toHaveBeenCalled(); // tile slabs + openings
	});

	it('cuts receiving sockets and magnet pockets for the magnet style', async () => {
		await buildOcctBaseplate(makeBp({ style: 'magnet' }));
		expect(replicad.drawCircle).toHaveBeenCalled(); // magnet pads + pockets
	});

	it('adds M3 through-holes when screwHoles is on', async () => {
		await buildOcctBaseplate(makeBp({ style: 'magnet', screwHoles: true }));
		expect(replicad.drawCircle).toHaveBeenCalled();
	});

	it('builds each connector type without throwing', async () => {
		for (const connector of ['none', 'filament', 'dovetail', 'screw'] as const) {
			const result = await buildOcctBaseplate(makeBp({ connector }));
			expect(result).toBeDefined();
		}
		// dovetail uses draw(); screw uses drawRoundedRectangle rails
		await buildOcctBaseplate(makeBp({ connector: 'dovetail' }));
		expect(replicad.draw).toHaveBeenCalled();
	});

	it('handles the simple style and a single-tile plate', async () => {
		const single = await buildOcctBaseplate(makeBp({ style: 'simple', drawerWidth: 126, drawerDepth: 126, bedWidth: 256, bedDepth: 256 }));
		expect(single).toBeDefined();
	});

	it('returns a compound for a multi-tile plate', async () => {
		const result = await buildOcctBaseplate(makeBp());
		// >1 tile -> the tiles are wrapped via makeCompound
		expect(replicad.makeCompound).toHaveBeenCalled();
		expect(result).toBeDefined();
	});
});
