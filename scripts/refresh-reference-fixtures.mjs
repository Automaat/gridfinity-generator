#!/usr/bin/env node
// Regenerates the committed reference fixtures used by reference-parity.test.ts.
//
// Source of truth: gridfinity.perplexinglabs.com, which runs the canonical
// kennetek/gridfinity-rebuilt-openscad (the same spec our constants cite),
// server-side. Generation is deterministic: identical params -> identical STL
// hash. We POST each config, fetch the binary STL, and record its bounding box
// + volume as the oracle our geometry must reproduce.
//
// Requires network. CI never runs this — it consumes the committed JSON. Run
// manually to refresh after a deliberate spec change:
//   node scripts/refresh-reference-fixtures.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://gridfinity.perplexinglabs.com';
const OUT = fileURLToPath(new URL('../src/lib/cad/__fixtures__/perplexinglabs-reference.json', import.meta.url));

// gridfinity-rebuilt OpenSCAD params. We strip features that have no clean
// analogue in our model (refined holes, scoops, label tabs, sub-bins) so the
// geometry reduces to base + floor + walls + lip, and match wall thickness to
// our 1.2mm default so volumes are comparable.
const BASE_BODY = {
	d_tabw: 42, screw_holes: false, place_tab: 'All sub bins', crush_ribs: false,
	c_orientation: 'Vertical', enable_thumbscrew: false, d_tabh: 15.85, divx: 1, gridx: 1,
	c_chamfer: 0.5, chamfer_holes: false, gridz: 6, REFINED_HOLE_RADIUS: 2.93, style_lip: true,
	printable_hole_top: true, gridy: 1, MAGNET_HOLE_RADIUS: 3.25, only_corners: false,
	bin_style: 'Standard', style_tab: 'None', ch: 10, divy: 1, d_wall: 1.2, cdivx: 1,
	style_hole: 'None', c_depth: 1.1, cdivy: 1, scoop: 0, l_grid: 42, cd: 10, MAGNET_HEIGHT: 2.1
};

// Each fixture pairs OUR BinParams with the reference-generator overrides that
// should produce the same physical bin. gridx->width, gridy->length, gridz->height.
const FIXTURES = [
	{ id: '1x1x3-lip', binParams: { width: 1, length: 1, height: 3, stackingLip: 'standard' }, body: { gridx: 1, gridy: 1, gridz: 3, style_lip: true } },
	{ id: '1x1x3-nolip', binParams: { width: 1, length: 1, height: 3, stackingLip: 'none' }, body: { gridx: 1, gridy: 1, gridz: 3, style_lip: false } },
	{ id: '1x1x6-lip', binParams: { width: 1, length: 1, height: 6, stackingLip: 'standard' }, body: { gridx: 1, gridy: 1, gridz: 6, style_lip: true } },
	{ id: '1x1x6-nolip', binParams: { width: 1, length: 1, height: 6, stackingLip: 'none' }, body: { gridx: 1, gridy: 1, gridz: 6, style_lip: false } },
	{ id: '2x1x4-lip', binParams: { width: 2, length: 1, height: 4, stackingLip: 'standard' }, body: { gridx: 2, gridy: 1, gridz: 4, style_lip: true } },
	{ id: '2x3x6-lip', binParams: { width: 2, length: 3, height: 6, stackingLip: 'standard' }, body: { gridx: 2, gridy: 3, gridz: 6, style_lip: true } },
	{ id: '3x2x5-lip', binParams: { width: 3, length: 2, height: 5, stackingLip: 'standard' }, body: { gridx: 3, gridy: 2, gridz: 5, style_lip: true } },
	{ id: '1x1x6-magnets', binParams: { width: 1, length: 1, height: 6, stackingLip: 'standard', magnetHoles: true }, body: { gridx: 1, gridy: 1, gridz: 6, style_lip: true, style_hole: 'Magnet holes', MAGNET_HOLE_RADIUS: 3.25, MAGNET_HEIGHT: 2.4 } }
];

function measure(buf) {
	const dv = new DataView(buf);
	const nTri = dv.getUint32(80, true);
	let o = 84;
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	let vol6 = 0;
	for (let f = 0; f < nTri; f++) {
		o += 12;
		const v = [];
		for (let i = 0; i < 3; i++) {
			const x = dv.getFloat32(o, true), y = dv.getFloat32(o + 4, true), z = dv.getFloat32(o + 8, true);
			o += 12;
			v.push([x, y, z]);
			for (let a = 0; a < 3; a++) {
				const c = [x, y, z][a];
				if (c < min[a]) min[a] = c;
				if (c > max[a]) max[a] = c;
			}
		}
		o += 2;
		const [a, b, c] = v;
		vol6 += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
	}
	return {
		size: [+(max[0] - min[0]).toFixed(3), +(max[1] - min[1]).toFixed(3), +(max[2] - min[2]).toFixed(3)],
		volume: +(Math.abs(vol6) / 6).toFixed(1),
		triangles: nTri
	};
}

async function generate(body) {
	const gen = await fetch(`${BASE}/gen/gridfinity-rebuilt/0/0/stl`, {
		method: 'POST',
		headers: { 'content-type': 'text/plain;charset=UTF-8' },
		body: JSON.stringify(body)
	});
	if (!gen.ok) throw new Error(`gen failed: ${gen.status}`);
	const { stl_url } = await gen.json();
	const stl = await fetch(`${BASE}${stl_url}`);
	if (!stl.ok) throw new Error(`download failed: ${stl.status}`);
	return { hash: stl_url.split('/').pop(), ...measure(await stl.arrayBuffer()) };
}

const fixtures = [];
for (const f of FIXTURES) {
	const body = { ...BASE_BODY, ...f.body };
	const ref = await generate(body);
	fixtures.push({ id: f.id, binParams: f.binParams, reference: ref });
	console.log(`${f.id.padEnd(16)} size=${ref.size.join(' x ')}  vol=${ref.volume}  ${ref.hash}`);
}

const out = {
	$comment: 'Reference dimensions from gridfinity.perplexinglabs.com (canonical kennetek/gridfinity-rebuilt-openscad). Regenerate with scripts/refresh-reference-fixtures.mjs. Do not edit by hand.',
	source: `${BASE}/gen/gridfinity-rebuilt/0/0/stl`,
	fixtures
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`\nwrote ${fixtures.length} fixtures -> ${OUT}`);
