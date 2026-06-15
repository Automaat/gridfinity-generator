// Generates static/default-mesh.json: the meshed default bin, rendered on first
// paint so the viewport shows a real bin instantly instead of waiting for the
// engine WASM. Built with the manifold engine so it matches the live preview
// tessellation exactly (seamless swap).
//
// Run after changing defaultParams or the base geometry: `npm run gen:default-mesh`.
// Imports the .ts source directly, so it needs Node's TS type stripping (Node
// >=22.18; the repo pins 24 via mise). The npm script passes
// --experimental-strip-types so it also works on 22.18-23.5.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const ManifoldModule = (await import('manifold-3d')).default;
const mani = await ManifoldModule();
mani.setup();

const { buildBinManifold, setBinManifold } = await import('../src/lib/cad/manifold-bin.ts');
const { manifoldToMesh } = await import('../src/lib/cad/mesh-util.ts');
const { defaultParams } = await import('../src/lib/stores/params.ts');
setBinManifold(mani);

const mesh = manifoldToMesh(buildBinManifold(defaultParams));
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const out = {
	params: defaultParams,
	vertices: b64(mesh.vertices),
	normals: b64(mesh.normals),
	triangles: b64(mesh.triangles),
	edges: b64(mesh.edges)
};

const dest = path.join(import.meta.dirname, '../static/default-mesh.json');
writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest} (${(JSON.stringify(out).length / 1024).toFixed(1)} KB, ${mesh.triangles.length / 3} tris)`);
process.exit(0);
