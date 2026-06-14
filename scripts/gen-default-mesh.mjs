// Generates static/default-mesh.json: the meshed default bin, rendered on first
// paint so the viewport shows a real bin instantly instead of waiting for the
// ~4.6 MB OpenCascade WASM to download/compile. Must match the worker's preview
// tolerance exactly (see worker.ts) so the swap to the live mesh is seamless.
//
// Run after changing defaultParams or the base geometry: `npm run gen:default-mesh`.
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ocPkg = path.dirname(require.resolve('replicad-opencascadejs/package.json'));
const wasmPath = path.join(ocPkg, 'src/replicad_single.wasm');

// The emscripten glue is an ES module that still references __dirname/require in
// its Node branch, so Node can't auto-classify it. Copy to a temp .mjs and shim
// the globals it expects before importing.
const tmp = mkdtempSync(path.join(tmpdir(), 'oc-'));
const glueMjs = path.join(tmp, 'glue.mjs');
copyFileSync(path.join(ocPkg, 'src/replicad_single.js'), glueMjs);
globalThis.__dirname = path.join(ocPkg, 'src');
globalThis.require = require;
const glue = (await import(glueMjs)).default;

const replicad = await import('replicad');
replicad.setOC(await glue({ locateFile: () => wasmPath }));

const { buildBin } = await import('../src/lib/cad/gridfinity.ts');
const { defaultParams } = await import('../src/lib/stores/params.ts');

const PREVIEW = { tolerance: 0.2, angularTolerance: 0.3 };
const shape = buildBin(defaultParams);
const mesh = shape.mesh(PREVIEW);
const edges = shape.meshEdges(PREVIEW);

const b64 = (Arr, data) => Buffer.from(new Arr(data).buffer).toString('base64');
const out = {
	params: defaultParams,
	vertices: b64(Float32Array, mesh.vertices),
	normals: b64(Float32Array, mesh.normals),
	triangles: b64(Uint32Array, mesh.triangles),
	edges: b64(Float32Array, edges.lines)
};

const dest = path.join(import.meta.dirname, '../static/default-mesh.json');
writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest} (${(JSON.stringify(out).length / 1024).toFixed(1)} KB, ${mesh.triangles.length / 3} tris)`);
process.exit(0);
