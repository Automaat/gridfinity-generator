import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { setOC } from 'replicad';
import { buildBin } from './gridfinity';
import type { BinParams } from '$lib/stores/params';

let initialized = false;

async function init() {
	if (initialized) return;
	const OC = await opencascade({ locateFile: () => opencascadeWasm });
	setOC(OC as Parameters<typeof setOC>[0]);
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
	| { type: 'error'; message: string }
	| { type: 'ready' };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
	try {
		await ready;
		const msg = e.data;
		const shape = buildBin(msg.params);

		if (msg.type === 'build') {
			const mesh = shape.mesh({ tolerance: 0.1, angularTolerance: 0.3 });
			const edgeData = shape.meshEdges({ tolerance: 0.1, angularTolerance: 0.3 });
			const vertices = new Float32Array(mesh.vertices);
			const triangles = new Uint32Array(mesh.triangles);
			const normals = new Float32Array(mesh.normals);
			const edges = new Float32Array(edgeData.lines);
			self.postMessage(
				{ type: 'mesh', vertices, triangles, normals, edges } satisfies WorkerResponse,
				{ transfer: [vertices.buffer, triangles.buffer, normals.buffer, edges.buffer] }
			);
		} else if (msg.type === 'exportSTEP') {
			const blob = shape.blobSTEP();
			self.postMessage({ type: 'exportSTEP', blob } satisfies WorkerResponse);
		} else if (msg.type === 'exportSTL') {
			const blob = shape.blobSTL({ binary: true });
			self.postMessage({ type: 'exportSTL', blob } satisfies WorkerResponse);
		}
	} catch (err) {
		self.postMessage({
			type: 'error',
			message: err instanceof Error ? err.message : String(err)
		} satisfies WorkerResponse);
	}
};

// signal ready after WASM loads
ready.then(() => self.postMessage({ type: 'ready' } satisfies WorkerResponse));
