import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BinParams } from '$lib/stores/params';

// Chainable mock for replicad Solid/Sketch objects
function mockSolid(): Record<string, unknown> {
	const solid: Record<string, unknown> = {};
	solid.fuse = vi.fn(() => mockSolid());
	solid.cut = vi.fn(() => mockSolid());
	solid.translate = vi.fn(() => mockSolid());
	solid.extrude = vi.fn(() => mockSolid());
	solid.loftWith = vi.fn(() => mockSolid());
	solid.mesh = vi.fn(() => ({ vertices: [], triangles: [], normals: [] }));
	solid.meshEdges = vi.fn(() => ({ lines: [] }));
	solid.blobSTEP = vi.fn(() => new Blob());
	solid.blobSTL = vi.fn(() => new Blob());
	return solid;
}

function mockSketch(): Record<string, unknown> {
	const sketch: Record<string, unknown> = {};
	sketch.extrude = vi.fn(() => mockSolid());
	sketch.loftWith = vi.fn(() => mockSolid());
	return sketch;
}

function mockDrawing(): Record<string, unknown> {
	const drawing: Record<string, unknown> = {};
	drawing.lineTo = vi.fn(() => drawing);
	drawing.close = vi.fn(() => ({
		sketchOnPlane: vi.fn(() => mockSketch())
	}));
	drawing.sketchOnPlane = vi.fn(() => mockSketch());
	return drawing;
}

vi.mock('replicad', () => ({
	draw: vi.fn(() => mockDrawing()),
	drawCircle: vi.fn(() => ({
		sketchOnPlane: vi.fn(() => mockSketch())
	})),
	drawRoundedRectangle: vi.fn(() => ({
		sketchOnPlane: vi.fn(() => mockSketch())
	}))
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
		screwHoles: false,
		stackingLip: 'none',
		labelTab: false,
		dividersX: 0,
		dividersY: 0,
		bottomScoop: false,
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
		// With height=1, stackingLip='standard': wallHeight = 7 - 7 - 4.75 = negative
		const result = buildBin(makeParams({ height: 1, stackingLip: 'standard' }));
		expect(result).toBeDefined();
	});

	it('creates bottom scoops when enabled', () => {
		const spy = vi.mocked(replicad.drawCircle);
		buildBin(makeParams({ bottomScoop: true }));
		// drawCircle used for scoop cylinder (1 compartment = 1 scoop)
		expect(spy).toHaveBeenCalled();
	});

	it('creates scoop per compartment with dividers', () => {
		const spy = vi.mocked(replicad.drawCircle);
		buildBin(makeParams({ bottomScoop: true, dividersX: 0, dividersY: 0 }));
		const scoopsNoDividers = spy.mock.calls.length;

		vi.clearAllMocks();
		buildBin(makeParams({ bottomScoop: true, dividersX: 1, dividersY: 1 }));
		const scoopsWithDividers = spy.mock.calls.length;

		// 2x2=4 compartments vs 1
		expect(scoopsWithDividers).toBeGreaterThan(scoopsNoDividers);
	});

	it('skips scoop when wall height too short', () => {
		const spy = vi.mocked(replicad.drawCircle);
		// height=1 + stackingLip='none' → wallHeight = 7-7 = 0
		buildBin(makeParams({ bottomScoop: true, height: 1 }));
		expect(spy).not.toHaveBeenCalled();
	});
});
