import { describe, it, expect, beforeAll } from 'vitest';
import type { BinParams } from '$lib/stores/params';
import { defaultParams } from '$lib/stores/params';
import { buildBinManifold, setBinManifold } from './manifold-bin';
import { manifoldToStlBlob } from './mesh-util';
import reference from './__fixtures__/perplexinglabs-reference.json';

// Cross-checks our exported STL geometry against the canonical reference
// generator (gridfinity.perplexinglabs.com → kennetek/gridfinity-rebuilt). The
// reference dimensions are committed in __fixtures__ (regenerate with
// scripts/refresh-reference-fixtures.mjs); this test never hits the network.
beforeAll(async () => {
	const Module = (await import('manifold-3d')).default;
	const mani = await Module();
	mani.setup();
	setBinManifold(mani);
}, 30000);

// Measure the actual exported bytes — outer bounding box + mesh volume — exactly
// as the refresh script measured the reference STLs.
function measureStl(buf: ArrayBuffer): { size: [number, number, number]; volume: number } {
	const dv = new DataView(buf);
	const nTri = dv.getUint32(80, true);
	let o = 84;
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	let vol6 = 0;
	for (let f = 0; f < nTri; f++) {
		o += 12; // skip normal
		const tri: number[][] = [];
		for (let i = 0; i < 3; i++) {
			const p = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)];
			o += 12;
			tri.push(p);
			for (let a = 0; a < 3; a++) {
				const v = p[a]!;
				if (v < min[a]!) min[a] = v;
				if (v > max[a]!) max[a] = v;
			}
		}
		o += 2; // attribute byte count
		const a = tri[0]!;
		const b = tri[1]!;
		const c = tri[2]!;
		vol6 +=
			a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) -
			a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) +
			a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!);
	}
	return {
		size: [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!],
		volume: Math.abs(vol6) / 6
	};
}

const fullParams = (bp: unknown): BinParams => ({ ...defaultParams, ...(bp as Partial<BinParams>) });

// Outer dimensions are spec-defined; both generators agree to well under this.
// This is the authoritative dimensional check.
const BBOX_TOL = 0.2; // mm
// Volume is a coarser cross-generator sanity bound. Lip-off bodies agree closely;
// a lipped bin's volume differs more because our stacking-lip cross-section is a
// simplified approximation of the canonical profile (the outer dimensions still
// match exactly — only the internal lip cavity material differs).
const VOL_TOL_BODY = 0.03; // 3% — body (no lip) should match closely
const VOL_TOL_LIPPED = 0.1; // 10% — lip profile detail diverges between generators

describe('reference parity (gridfinity-rebuilt)', () => {
	for (const fx of reference.fixtures) {
		it(`${fx.id} export matches reference dimensions`, async () => {
			const solid = buildBinManifold(fullParams(fx.binParams), { segments: 64 });
			const { size, volume } = measureStl(await manifoldToStlBlob(solid).arrayBuffer());
			const rx = fx.reference.size[0]!;
			const ry = fx.reference.size[1]!;
			const rz = fx.reference.size[2]!;
			expect(Math.abs(size[0] - rx), `width: ${size[0]} vs ${rx}`).toBeLessThanOrEqual(BBOX_TOL);
			expect(Math.abs(size[1] - ry), `length: ${size[1]} vs ${ry}`).toBeLessThanOrEqual(BBOX_TOL);
			expect(Math.abs(size[2] - rz), `height: ${size[2]} vs ${rz}`).toBeLessThanOrEqual(BBOX_TOL);
			const volTol =
				(fx.binParams as { stackingLip?: string }).stackingLip === 'none' ? VOL_TOL_BODY : VOL_TOL_LIPPED;
			expect(
				Math.abs(volume - fx.reference.volume) / fx.reference.volume,
				`volume: ${volume.toFixed(0)} vs ${fx.reference.volume}`
			).toBeLessThan(volTol);
		});
	}
});
