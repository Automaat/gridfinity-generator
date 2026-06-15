import manifoldModule from 'manifold-3d';
import manifoldWasm from 'manifold-3d/manifold.wasm?url';
import { buildBinManifold, setBinManifold } from './manifold-bin';
import { manifoldToMesh, manifoldToStlBlob } from './mesh-util';
import type { BinParams } from '$lib/stores/params';
import { classifyError, validateParams, type WorkerErrorCode } from './worker-errors';

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
	| { type: 'exportSTL'; params: BinParams };

export type WorkerResponse =
	| {
			type: 'mesh';
			vertices: Float32Array;
			triangles: Uint32Array;
			normals: Float32Array;
			edges: Float32Array;
		}
	| { type: 'exportSTEP'; blob: Blob }
	| { type: 'exportSTL'; blob: Blob }
	| { type: 'error'; code: WorkerErrorCode; message: string; requestType: WorkerRequest['type'] }
	| { type: 'ready' };

function postMesh(vertices: Float32Array, triangles: Uint32Array, normals: Float32Array, edges: Float32Array) {
	self.postMessage(
		{ type: 'mesh', vertices, triangles, normals, edges } satisfies WorkerResponse,
		{ transfer: [vertices.buffer, triangles.buffer, normals.buffer, edges.buffer] }
	);
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
	const msg = e.data;
	try {
		await ready;
		validateParams(msg.params);

		if (msg.type === 'build') {
			const solid = buildBinManifold(msg.params);
			const { vertices, triangles, normals, edges } = manifoldToMesh(solid);
			postMesh(vertices, triangles, normals, edges);
		} else if (msg.type === 'exportSTEP') {
			const { buildOcctBin } = await import('./occt');
			const shape = await buildOcctBin(msg.params);
			self.postMessage({ type: 'exportSTEP', blob: shape.blobSTEP() } satisfies WorkerResponse);
		} else if (msg.type === 'exportSTL') {
			const solid = buildBinManifold(msg.params, { segments: STL_SEGMENTS });
			self.postMessage({ type: 'exportSTL', blob: manifoldToStlBlob(solid) } satisfies WorkerResponse);
		}
	} catch (err) {
		const { code, message } = classifyError(err);
		self.postMessage({ type: 'error', code, message, requestType: msg.type } satisfies WorkerResponse);
	}
};

// signal ready after the manifold engine loads (small WASM; OCCT stays lazy)
ready.then(() => self.postMessage({ type: 'ready' } satisfies WorkerResponse));
