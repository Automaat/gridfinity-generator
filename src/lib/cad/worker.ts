import manifoldModule from 'manifold-3d';
import manifoldWasm from 'manifold-3d/manifold.wasm?url';
import { zipSync } from 'fflate';
import { buildBinManifold, setBinManifold } from './manifold-bin';
import { planBinSplit } from './bin-split';
import { buildBinSplitPreview, buildBinSplitTiles, buildBinSplitCombined } from './bin-split-manifold';
import { buildBaseplateAssembled, buildBaseplateTiles, buildBaseplateCombined } from './baseplate-manifold';
import { buildSkadisManifold } from './skadis-manifold';
import { manifoldToMesh, manifoldToStlBlob, manifoldToStlBytes } from './mesh-util';
import type { BinParams, BaseplateParams, SkadisParams } from '$lib/stores/params';
import { classifyError, validateParams, validateBaseplate, validateSkadis, type WorkerErrorCode } from './worker-errors';

// Preview and STL export both run on the manifold engine (small WASM, eager).
// STL is rebuilt at a finer tessellation than the preview. OpenCascade is
// dynamic-imported only for STEP (which needs a BRep), so the interactive path
// and the common STL export never download the ~4.6MB kernel.
const STL_SEGMENTS = 64;
let initialized = false;
async function init() {
	if (initialized) return;
	const m = await manifoldModule({ locateFile: () => manifoldWasm });
	m.setup();
	setBinManifold(m);
	initialized = true;
}

const ready = init();

export type WorkerRequest =
	| { type: 'build'; params: BinParams }
	| { type: 'exportSTEP'; params: BinParams }
	| { type: 'exportSTL'; params: BinParams }
	| { type: 'buildBaseplate'; params: BaseplateParams }
	| { type: 'exportBaseplateSTL'; params: BaseplateParams }
	| { type: 'exportBaseplateSTEP'; params: BaseplateParams }
	| { type: 'buildSkadis'; params: SkadisParams }
	| { type: 'exportSkadisSTL'; params: SkadisParams }
	| { type: 'exportSkadisSTEP'; params: SkadisParams };

export type WorkerResponse =
	| {
			type: 'mesh';
			vertices: Float32Array;
			triangles: Uint32Array;
			normals: Float32Array;
			edges: Float32Array;
		}
	| { type: 'exportSTEP'; blob: Blob; filename: string }
	| { type: 'exportSTL'; blob: Blob; filename: string }
	| { type: 'error'; code: WorkerErrorCode; message: string; requestType: WorkerRequest['type'] }
	| { type: 'ready' };

function postMesh(vertices: Float32Array, triangles: Uint32Array, normals: Float32Array, edges: Float32Array) {
	self.postMessage(
		{ type: 'mesh', vertices, triangles, normals, edges } satisfies WorkerResponse,
		{ transfer: [vertices.buffer, triangles.buffer, normals.buffer, edges.buffer] }
	);
}

self.addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
	const msg = e.data;
	try {
		await ready;

		if (msg.type === 'build') {
			validateParams(msg.params);
			// Split bins render an exploded preview so the cut seams are visible; the
			// build functions fall back to the whole bin when it fits one piece.
			const solid = msg.params.splitToFit ? buildBinSplitPreview(msg.params) : buildBinManifold(msg.params);
			const { vertices, triangles, normals, edges } = manifoldToMesh(solid);
			postMesh(vertices, triangles, normals, edges);
		} else if (msg.type === 'exportSTEP') {
			validateParams(msg.params);
			const { buildOcctBin } = await import('./occt');
			const shape = await buildOcctBin(msg.params);
			self.postMessage({ type: 'exportSTEP', blob: shape.blobSTEP(), filename: 'bin.step' } satisfies WorkerResponse);
		} else if (msg.type === 'exportSTL') {
			validateParams(msg.params);
			const p = msg.params;
			const plan = p.splitToFit ? planBinSplit(p.width, p.length, p.bedWidth, p.bedDepth, p.splitAlgorithm) : null;
			if (plan?.multiTile && p.splitLayout === 'zip') {
				const pieces = buildBinSplitTiles(p, { segments: STL_SEGMENTS });
				const files: Record<string, Uint8Array> = {};
				for (const t of pieces) files[t.name] = manifoldToStlBytes(t.solid);
				const zipped = zipSync(files);
				self.postMessage({ type: 'exportSTL', blob: new Blob([zipped], { type: 'application/zip' }), filename: 'bin.zip' } satisfies WorkerResponse);
			} else if (plan?.multiTile) {
				const solid = buildBinSplitCombined(p, { segments: STL_SEGMENTS });
				self.postMessage({ type: 'exportSTL', blob: manifoldToStlBlob(solid), filename: 'bin.stl' } satisfies WorkerResponse);
			} else {
				const solid = buildBinManifold(p, { segments: STL_SEGMENTS });
				self.postMessage({ type: 'exportSTL', blob: manifoldToStlBlob(solid), filename: 'bin.stl' } satisfies WorkerResponse);
			}
		} else if (msg.type === 'buildBaseplate') {
			validateBaseplate(msg.params);
			const solid = buildBaseplateAssembled(msg.params);
			const { vertices, triangles, normals, edges } = manifoldToMesh(solid);
			postMesh(vertices, triangles, normals, edges);
		} else if (msg.type === 'exportBaseplateSTL') {
			validateBaseplate(msg.params);
			if (msg.params.exportLayout === 'zip') {
				const tiles = buildBaseplateTiles(msg.params, { segments: STL_SEGMENTS });
				const files: Record<string, Uint8Array> = {};
				for (const t of tiles) files[t.name] = manifoldToStlBytes(t.solid);
				const zipped = zipSync(files);
				self.postMessage({ type: 'exportSTL', blob: new Blob([zipped], { type: 'application/zip' }), filename: 'baseplate.zip' } satisfies WorkerResponse);
			} else {
				const solid = buildBaseplateCombined(msg.params, { segments: STL_SEGMENTS });
				self.postMessage({ type: 'exportSTL', blob: manifoldToStlBlob(solid), filename: 'baseplate.stl' } satisfies WorkerResponse);
			}
		} else if (msg.type === 'exportBaseplateSTEP') {
			validateBaseplate(msg.params);
			const { buildOcctBaseplate } = await import('./baseplate-occt');
			const shape = await buildOcctBaseplate(msg.params);
			self.postMessage({ type: 'exportSTEP', blob: shape.blobSTEP(), filename: 'baseplate.step' } satisfies WorkerResponse);
		} else if (msg.type === 'buildSkadis') {
			validateSkadis(msg.params);
			const solid = buildSkadisManifold(msg.params);
			const { vertices, triangles, normals, edges } = manifoldToMesh(solid);
			postMesh(vertices, triangles, normals, edges);
		} else if (msg.type === 'exportSkadisSTL') {
			validateSkadis(msg.params);
			const solid = buildSkadisManifold(msg.params);
			self.postMessage({ type: 'exportSTL', blob: manifoldToStlBlob(solid), filename: 'skadis-box.stl' } satisfies WorkerResponse);
		} else if (msg.type === 'exportSkadisSTEP') {
			validateSkadis(msg.params);
			const { buildOcctSkadis } = await import('./skadis-occt');
			const shape = await buildOcctSkadis(msg.params);
			self.postMessage({ type: 'exportSTEP', blob: shape.blobSTEP(), filename: 'skadis-box.step' } satisfies WorkerResponse);
		}
	} catch (err) {
		const { code, message } = classifyError(err);
		self.postMessage({ type: 'error', code, message, requestType: msg.type } satisfies WorkerResponse);
	}
});

// signal ready after the manifold engine loads (small WASM; OCCT stays lazy).
// Fire-and-forget: if init rejects, the first op awaiting `ready` surfaces it.
void ready.then(() => self.postMessage({ type: 'ready' } satisfies WorkerResponse));
