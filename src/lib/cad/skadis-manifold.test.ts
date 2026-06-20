import { describe, it, expect, beforeAll } from 'vitest';
import type { SkadisParams } from '$lib/stores/params';
import { setBinManifold, box } from './manifold-bin';
import { buildSkadisManifold } from './skadis-manifold';
import { planSkadis, outerDims, frontWallCutZ, sideWallCutZ, BOARD_THICKNESS } from './skadis-layout';

// Real manifold WASM, like the bin/baseplate tests — mocking a CSG kernel verifies nothing.
beforeAll(async () => {
	const Module = (await import('manifold-3d')).default;
	const mani = await Module();
	mani.setup();
	setBinManifold(mani);
}, 30000);

function makeSk(overrides: Partial<SkadisParams> = {}): SkadisParams {
	return { width: 120, height: 80, depth: 50, wallThickness: 2, mountType: 'hook', hookRows: 1, openFront: false, frontWallHeight: 30, openSides: false, sideWallHeight: 30, lightweightWalls: false, ...overrides };
}

const span = (s: ReturnType<typeof buildSkadisManifold>, axis: number) => {
	const bb = s.boundingBox();
	return bb.max[axis]! - bb.min[axis]!;
};

// Volume of a front-corner column probe above both lowered walls: solid when the box
// is closed (corner is full-height wall), empty when both front + sides open (post gone).
const frontCornerFill = (p: SkadisParams): number => {
	const { outerW, outerD, outerH } = outerDims(p);
	const t = p.wallThickness;
	const probe = box(t + 2, t + 2, outerH - 50, -outerW / 2 + t / 2, outerD - t / 2, 50);
	return buildSkadisManifold(p).intersect(probe).volume();
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

	it('a taller front wall removes less material than a shorter one', () => {
		const low = buildSkadisManifold(makeSk({ openFront: true, frontWallHeight: 20 })).volume();
		const high = buildSkadisManifold(makeSk({ openFront: true, frontWallHeight: 60 })).volume();
		expect(high).toBeGreaterThan(low);
	});

	it('open sides removes material and keeps the outer footprint', () => {
		const closed = buildSkadisManifold(makeSk({ openSides: false }));
		const open = buildSkadisManifold(makeSk({ openSides: true, sideWallHeight: 25 }));
		expect(open.volume()).toBeLessThan(closed.volume());
		expect(span(open, 0)).toBeCloseTo(span(closed, 0), 1); // width envelope unchanged
		expect(span(open, 1)).toBeCloseTo(span(closed, 1), 1); // depth envelope unchanged (corner posts stay)
	});

	it('a taller side wall removes less material than a shorter one', () => {
		const low = buildSkadisManifold(makeSk({ openSides: true, sideWallHeight: 20 })).volume();
		const high = buildSkadisManifold(makeSk({ openSides: true, sideWallHeight: 60 })).volume();
		expect(high).toBeGreaterThan(low);
	});

	it('drops the front corner posts when both front and sides are open (no poles)', () => {
		const base = { width: 160, height: 80, depth: 60, sideWallHeight: 22 } as const;
		expect(frontCornerFill(makeSk({ ...base, openFront: false, openSides: false }))).toBeGreaterThan(0);
		expect(frontCornerFill(makeSk({ ...base, openFront: true, openSides: true }))).toBeCloseTo(0, 3);
	});

	it('screw mount: no hooks behind the board, and the back wall is bored at each mount site', () => {
		const p = makeSk({ mountType: 'screw' });
		const s = buildSkadisManifold(p);
		const t = p.wallThickness;
		expect(s.volume()).toBeGreaterThan(0);
		// Screws replace hooks: nothing protrudes behind the board face (contrast the hook test).
		expect(s.boundingBox().min[1]!).toBeGreaterThan(-BOARD_THICKNESS);
		// A small probe through the back wall at the top-center mount: solid for hooks, bored for screws.
		const site = planSkadis(p).hooks[0]!;
		const probe = box(2, t + 0.2, 2, site.x, t / 2, site.z - 1);
		const screwWall = s.intersect(probe).volume();
		const hookWall = buildSkadisManifold(makeSk({ mountType: 'hook' })).intersect(probe).volume();
		expect(screwWall).toBeLessThan(0.1 * hookWall); // clearance hole hollows the wall
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

	it('lightweight front + side walls finish with a solid top edge (no sliced hex)', () => {
		const base = { width: 120, height: 80, depth: 50, wallThickness: 2 } as const;
		const t = base.wallThickness;
		// A 1mm band at the very top of a lowered + hexed front wall must be fully solid
		// (interior width x thickness) -- the lattice is cut to a clean straight finish, not
		// a hex sliced through the rim.
		const fp = makeSk({ ...base, openFront: true, frontWallHeight: 30, lightweightWalls: true });
		const fTop = frontWallCutZ(fp);
		const { outerD } = outerDims(fp);
		const frontProbe = box(base.width, t, 1, 0, outerD - t / 2, fTop - 1);
		expect(buildSkadisManifold(fp).intersect(frontProbe).volume()).toBeCloseTo(base.width * t, 0);
		// Same guarantee on a lowered + hexed side wall, probed along its interior depth.
		const sp = makeSk({ ...base, openSides: true, sideWallHeight: 30, lightweightWalls: true });
		const sTop = sideWallCutZ(sp);
		const sd = outerDims(sp);
		const sideProbe = box(t, base.depth, 1, -sd.outerW / 2 + t / 2, sd.outerD / 2, sTop - 1);
		expect(buildSkadisManifold(sp).intersect(sideProbe).volume()).toBeCloseTo(base.depth * t, 0);
	});
});
