import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { BinParams } from '$lib/stores/params';

// Structural mocks for the replicad chainable API. Each interface captures the
// subset of Solid / Sketch / Drawing methods buildBin() exercises, replacing
// untyped Record<string, unknown> so a typo or dropped method is a type error.
interface MockSolid {
	fuse: Mock<(other: MockSolid) => MockSolid>;
	cut: Mock<(other: MockSolid) => MockSolid>;
	intersect: Mock<(other: MockSolid) => MockSolid>;
	clone: Mock<() => MockSolid>;
	translate: Mock<(x: number, y: number, z: number) => MockSolid>;
	mesh: Mock<() => { vertices: number[]; triangles: number[]; normals: number[] }>;
	meshEdges: Mock<() => { lines: number[] }>;
	blobSTEP: Mock<() => Blob>;
	blobSTL: Mock<() => Blob>;
}

interface MockSketch {
	extrude: Mock<(height: number) => MockSolid>;
	loftWith: Mock<(other: MockSketch, config: { ruled: boolean }) => MockSolid>;
}

// drawCircle / drawRoundedRectangle / Drawing.close() all yield a sketch source.
interface MockSketchOnPlane {
	sketchOnPlane: Mock<(plane?: string, origin?: number) => MockSketch>;
}

interface MockDrawing {
	lineTo: Mock<(point: [number, number]) => MockDrawing>;
	close: Mock<() => MockSketchOnPlane>;
	sketchOnPlane: Mock<(plane?: string, origin?: number) => MockSketch>;
}

interface MockPolysides {
	rotate: Mock<(angle: number) => MockSketchOnPlane>;
}

function mockSolid(): MockSolid {
	return {
		fuse: vi.fn<(other: MockSolid) => MockSolid>(() => mockSolid()),
		cut: vi.fn<(other: MockSolid) => MockSolid>(() => mockSolid()),
		intersect: vi.fn<(other: MockSolid) => MockSolid>(() => mockSolid()),
		clone: vi.fn<() => MockSolid>(() => mockSolid()),
		translate: vi.fn<(x: number, y: number, z: number) => MockSolid>(() => mockSolid()),
		mesh: vi.fn<() => { vertices: number[]; triangles: number[]; normals: number[] }>(() => ({ vertices: [], triangles: [], normals: [] })),
		meshEdges: vi.fn<() => { lines: number[] }>(() => ({ lines: [] })),
		blobSTEP: vi.fn<() => Blob>(() => new Blob()),
		blobSTL: vi.fn<() => Blob>(() => new Blob())
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
		close: vi.fn<() => MockSketchOnPlane>(() => mockSketchOnPlane()),
		sketchOnPlane: vi.fn<(plane?: string, origin?: number) => MockSketch>(() => mockSketch())
	};
}

vi.mock('replicad', () => ({
	draw: vi.fn<(start?: [number, number]) => MockDrawing>(() => mockDrawing()),
	drawCircle: vi.fn<(radius: number) => MockSketchOnPlane>(() => mockSketchOnPlane()),
	drawRoundedRectangle: vi.fn<(w: number, l: number, r?: number) => MockSketchOnPlane>(() => mockSketchOnPlane()),
	drawPolysides: vi.fn<(radius: number, sides: number) => MockPolysides>(() => ({
		rotate: vi.fn<(angle: number) => MockSketchOnPlane>(() => mockSketchOnPlane())
	})),
	makeCompound: vi.fn<(shapes: MockSolid[]) => MockSolid>(() => mockSolid())
}));

const { buildBin } = await import('./gridfinity');
const replicad = await import('replicad');

function makeParams(overrides: Partial<BinParams> = {}): BinParams {
	return {
		width: 1,
		length: 1,
		height: 3,
		wallThickness: 1.2,
		magnetHoles: false,
		magnetCornersOnly: false,
		screwHoles: false,
		stackingLip: 'none',
		labelTab: false,
		dividersX: 0,
		dividersY: 0,
		lightweightDividers: false,
		scoopWalls: [],
		scoopRadius: 0,
		wallCut: false,
		wallCutSide: 'front',
		wallCutLowFraction: 0,
		wallCutRun: 1,
		splitToFit: false,
		bedWidth: 220,
		bedDepth: 220,
		splitAlgorithm: 'ideal',
		splitLayout: 'zip',
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('buildBin', () => {
	it('returns a solid for default params', () => {
		const result = buildBin(makeParams());
		expect(result).toBeDefined();
	});

	it('calls drawRoundedRectangle for base and walls', () => {
		buildBin(makeParams());
		expect(replicad.drawRoundedRectangle).toHaveBeenCalled();
	});

	it('builds unit bases for each grid cell', () => {
		buildBin(makeParams({ width: 2, length: 3 }));
		// 2x3 grid = 6 unit bases, each uses drawRoundedRectangle for 4 levels
		// Plus floor, walls, cavity = many calls
		expect(replicad.drawRoundedRectangle).toHaveBeenCalled();
	});

	it('creates magnet holes when enabled', () => {
		buildBin(makeParams({ magnetHoles: true }));
		// drawCircle called for magnet holes (4 corners per grid unit)
		expect(replicad.drawCircle).toHaveBeenCalled();
	});

	it('creates screw holes when enabled', () => {
		buildBin(makeParams({ screwHoles: true }));
		expect(replicad.drawCircle).toHaveBeenCalled();
	});

	it('creates both magnet and screw holes', () => {
		buildBin(makeParams({ magnetHoles: true, screwHoles: true }));
		// 4 corners × (1 magnet + 1 screw) = 8 drawCircle calls for 1x1
		expect(replicad.drawCircle).toHaveBeenCalledTimes(8);
	});

	it('creates holes for multi-unit bins', () => {
		buildBin(makeParams({ width: 2, length: 2, magnetHoles: true }));
		// 4 grid cells × 4 corners = 16 magnet holes
		expect(replicad.drawCircle).toHaveBeenCalledTimes(16);
	});

	it('restricts magnet holes to the 4 outer corners when magnetCornersOnly', () => {
		buildBin(makeParams({ width: 2, length: 2, magnetHoles: true, magnetCornersOnly: true }));
		// Only the bin's 4 outer corners get a magnet — not 16
		expect(replicad.drawCircle).toHaveBeenCalledTimes(4);
	});

	it('magnetCornersOnly leaves a 1x1 bin unchanged (all 4 corners are outer)', () => {
		buildBin(makeParams({ magnetHoles: true, magnetCornersOnly: true }));
		expect(replicad.drawCircle).toHaveBeenCalledTimes(4);
	});

	it('magnetCornersOnly keeps screw holes on every tile corner', () => {
		buildBin(makeParams({ width: 2, length: 2, magnetHoles: true, magnetCornersOnly: true, screwHoles: true }));
		// 4 corner magnets + 16 per-corner screws
		expect(replicad.drawCircle).toHaveBeenCalledTimes(20);
	});

	it('adds standard stacking lip', () => {
		const spy = vi.mocked(replicad.drawRoundedRectangle);
		const callsBefore = spy.mock.calls.length;
		buildBin(makeParams({ stackingLip: 'standard' }));
		// Standard lip adds multiple drawRoundedRectangle calls for outer + cavity levels
		expect(spy.mock.calls.length).toBeGreaterThan(callsBefore);
	});

	it('adds reduced stacking lip', () => {
		buildBin(makeParams({ stackingLip: 'reduced' }));
		expect(replicad.drawRoundedRectangle).toHaveBeenCalled();
	});

	it('skips stacking lip when none', () => {
		const spy = vi.mocked(replicad.drawRoundedRectangle);
		buildBin(makeParams({ stackingLip: 'none' }));
		const noneCallCount = spy.mock.calls.length;

		vi.clearAllMocks();
		buildBin(makeParams({ stackingLip: 'standard' }));
		const standardCallCount = spy.mock.calls.length;

		// Standard lip requires more geometry calls than none
		expect(standardCallCount).toBeGreaterThan(noneCallCount);
	});

	it('creates X dividers', () => {
		buildBin(makeParams({ dividersX: 2 }));
		// Dividers use drawRoundedRectangle
		expect(replicad.drawRoundedRectangle).toHaveBeenCalled();
	});

	it('creates Y dividers', () => {
		buildBin(makeParams({ dividersY: 3 }));
		expect(replicad.drawRoundedRectangle).toHaveBeenCalled();
	});

	it('creates both X and Y dividers', () => {
		const spy = vi.mocked(replicad.drawRoundedRectangle);
		buildBin(makeParams({ dividersX: 1 }));
		const xOnlyCount = spy.mock.calls.length;

		vi.clearAllMocks();
		buildBin(makeParams({ dividersX: 1, dividersY: 1 }));
		const bothCount = spy.mock.calls.length;

		expect(bothCount).toBeGreaterThan(xOnlyCount);
	});

	it('creates label tabs when enabled', () => {
		buildBin(makeParams({ labelTab: true }));
		// Label tabs use draw() for triangle profile
		expect(replicad.draw).toHaveBeenCalled();
	});

	it('creates label tabs per compartment with dividers', () => {
		const spy = vi.mocked(replicad.draw);
		buildBin(makeParams({ labelTab: true, dividersX: 0 }));
		const tabsNoDividers = spy.mock.calls.length;

		vi.clearAllMocks();
		buildBin(makeParams({ labelTab: true, dividersX: 2 }));
		const tabsWithDividers = spy.mock.calls.length;

		// 3 compartments (2 dividers) = 3 tabs vs 1 tab
		expect(tabsWithDividers).toBeGreaterThan(tabsNoDividers);
	});

	it('handles minimum 1x1x1 bin', () => {
		const result = buildBin(makeParams({ width: 1, length: 1, height: 1 }));
		expect(result).toBeDefined();
	});

	it('handles maximum 6x6x10 bin', () => {
		const result = buildBin(
			makeParams({ width: 6, length: 6, height: 10 })
		);
		expect(result).toBeDefined();
	});

	it('handles all features enabled', () => {
		const result = buildBin(
			makeParams({
				width: 3,
				length: 2,
				magnetHoles: true,
				screwHoles: true,
				stackingLip: 'standard',
				labelTab: true,
				dividersX: 2,
				dividersY: 1
			})
		);
		expect(result).toBeDefined();
	});

	it('skips label tab when wall height too short', () => {
		const spy = vi.mocked(replicad.draw);
		// height=1 → 7mm total, wallHeight likely <= LABEL_TAB_HEIGHT/2
		buildBin(makeParams({ labelTab: true, height: 1 }));
		// draw() used for label tabs — may not be called if wallHeight too short
		// With height=1, wallHeight = 7 - 4.75 - 2.25 - lipHeight
		// stackingLip='none' → lipHeight=0, wallHeight = 0, so no label tab
		expect(spy).not.toHaveBeenCalled();
	});

	it('returns early when wallHeight is zero or negative', () => {
		// height=1: walls fill 7-7=0 ⇒ wallHeight collapses ⇒ early return (base only, no lip)
		const result = buildBin(makeParams({ height: 1, stackingLip: 'standard' }));
		expect(result).toBeDefined();
	});

	it('creates bottom scoops when enabled', () => {
		const spy = vi.mocked(replicad.drawCircle);
		buildBin(makeParams({ scoopWalls: ['back'], scoopRadius: 0 }));
		// drawCircle used for scoop cylinder (1 compartment = 1 scoop)
		expect(spy).toHaveBeenCalled();
	});

	it('creates scoop per compartment with dividers', () => {
		const spy = vi.mocked(replicad.drawCircle);
		buildBin(makeParams({ scoopWalls: ['back'], scoopRadius: 0, dividersX: 0, dividersY: 0 }));
		const scoopsNoDividers = spy.mock.calls.length;

		vi.clearAllMocks();
		buildBin(makeParams({ scoopWalls: ['back'], scoopRadius: 0, dividersX: 1, dividersY: 1 }));
		const scoopsWithDividers = spy.mock.calls.length;

		// 2x2=4 compartments vs 1
		expect(scoopsWithDividers).toBeGreaterThan(scoopsNoDividers);
	});

	it('skips scoop when wall height too short', () => {
		const spy = vi.mocked(replicad.drawCircle);
		// height=1 + stackingLip='none' → wallHeight = 7-7 = 0
		buildBin(makeParams({ scoopWalls: ['back'], scoopRadius: 0, height: 1 }));
		expect(spy).not.toHaveBeenCalled();
	});

	it('creates front scoop', () => {
		const result = buildBin(makeParams({ scoopWalls: ['front'], scoopRadius: 0 }));
		expect(result).toBeDefined();
	});

	it('creates left scoop', () => {
		const result = buildBin(makeParams({ scoopWalls: ['left'], scoopRadius: 0 }));
		expect(result).toBeDefined();
	});

	it('creates right scoop', () => {
		const result = buildBin(makeParams({ scoopWalls: ['right'], scoopRadius: 0 }));
		expect(result).toBeDefined();
	});

	it('creates multiple scoops', () => {
		const spy = vi.mocked(replicad.drawCircle);
		buildBin(makeParams({ scoopWalls: ['back', 'front'], scoopRadius: 0 }));
		// 2 walls × 1 compartment = 2 scoop cylinders
		expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it('uses custom scoop radius', () => {
		const result = buildBin(makeParams({ scoopWalls: ['back'], scoopRadius: 3 }));
		expect(result).toBeDefined();
	});

	it('creates lightweight X dividers with hex pattern', () => {
		const spy = vi.mocked(replicad.drawPolysides);
		buildBin(makeParams({ dividersX: 1, lightweightDividers: true, height: 5 }));
		expect(spy).toHaveBeenCalled();
	});

	it('creates lightweight Y dividers with hex pattern', () => {
		const spy = vi.mocked(replicad.drawPolysides);
		buildBin(makeParams({ dividersY: 1, lightweightDividers: true, height: 5 }));
		expect(spy).toHaveBeenCalled();
	});

	it('skips hex pattern when lightweightDividers is false', () => {
		const spy = vi.mocked(replicad.drawPolysides);
		buildBin(makeParams({ dividersX: 1, lightweightDividers: false }));
		expect(spy).not.toHaveBeenCalled();
	});

	it('skips hex pattern when no dividers exist', () => {
		const spy = vi.mocked(replicad.drawPolysides);
		buildBin(makeParams({ dividersX: 0, dividersY: 0, lightweightDividers: true }));
		expect(spy).not.toHaveBeenCalled();
	});

	it('applies diagonal wall cut when enabled', () => {
		const spy = vi.mocked(replicad.draw);
		const callsBefore = spy.mock.calls.length;
		buildBin(makeParams({ wallCut: true }));
		// Wall cut builds a polygon cutter via draw()
		expect(spy.mock.calls.length).toBeGreaterThan(callsBefore);
	});

	it('skips wall cut when disabled', () => {
		const spy = vi.mocked(replicad.draw);
		buildBin(makeParams({ wallCut: false, labelTab: false }));
		expect(spy).not.toHaveBeenCalled();
	});

	it('builds wall cut for each side', () => {
		for (const side of ['back', 'front', 'left', 'right'] as const) {
			const result = buildBin(makeParams({ wallCut: true, wallCutSide: side }));
			expect(result).toBeDefined();
		}
	});

	it('handles wall cut with dividers and lip', () => {
		const result = buildBin(
			makeParams({ wallCut: true, dividersX: 2, stackingLip: 'standard', height: 5 })
		);
		expect(result).toBeDefined();
	});

	it('builds partial-run wall cut (slope ends early)', () => {
		const result = buildBin(makeParams({ wallCut: true, wallCutRun: 0.5 }));
		expect(result).toBeDefined();
	});
});
