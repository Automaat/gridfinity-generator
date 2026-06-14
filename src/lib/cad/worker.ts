import manifoldModule from 'manifold-3d';
import manifoldWasm from 'manifold-3d/manifold.wasm?url';
import { buildBinManifold, setBinManifold } from './manifold-bin';
import { manifoldToMesh } from './mesh-util';
import type { BinParams } from '$lib/stores/params';
import { classifyError, validateParams, type WorkerErrorCode } from './worker-errors';

// Preview tessellation for the OCCT fallback path (manifold bakes its own at
// construction). Matches the precomputed default mesh and STL/STEP stay finer.
const PREVIEW = { tolerance: 0.2, angularTolerance: 0.3 };

let initialized = false;
async function init() {
	if (initialized) return;
	const m = await manifoldModule({ locateFile: () => manifoldWasm });
	m.setup();
	setBinManifold(m);
	initialized = true;
}

const ready = init();

// Features not yet ported to the manifold engine fall back to OCCT for preview.
function usesOcctOnly(p: BinParams): boolean {
	return p.scoopWalls.length > 0 || p.lightweightDividers || p.labelTab || p.wallCut;
}

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
			if (usesOcctOnly(msg.params)) {
				const { buildOcctBin } = await import('./occt');
				const shape = await buildOcctBin(msg.params);
				const mesh = shape.mesh(PREVIEW);
				const edgeData = shape.meshEdges(PREVIEW);
				postMesh(
					new Float32Array(mesh.vertices),
					new Uint32Array(mesh.triangles),
					new Float32Array(mesh.normals),
					new Float32Array(edgeData.lines)
				);
			} else {
				const solid = buildBinManifold(msg.params);
				const { vertices, triangles, normals, edges } = manifoldToMesh(solid);
				postMesh(vertices, triangles, normals, edges);
			}
		} else if (msg.type === 'exportSTEP') {
			const { buildOcctBin } = await import('./occt');
			const shape = await buildOcctBin(msg.params);
			self.postMessage({ type: 'exportSTEP', blob: shape.blobSTEP() } satisfies WorkerResponse);
		} else if (msg.type === 'exportSTL') {
			const { buildOcctBin } = await import('./occt');
			const shape = await buildOcctBin(msg.params);
			self.postMessage({ type: 'exportSTL', blob: shape.blobSTL({ binary: true }) } satisfies WorkerResponse);
		}
	} catch (err) {
		const { code, message } = classifyError(err);
		self.postMessage({ type: 'error', code, message, requestType: msg.type } satisfies WorkerResponse);
	}
};

// signal ready after the manifold engine loads (small WASM; OCCT stays lazy)
ready.then(() => self.postMessage({ type: 'ready' } satisfies WorkerResponse));
