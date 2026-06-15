// Lazy OpenCascade path, used only for STEP export — the one output that needs a
// BRep kernel. Importing this module pulls in the ~4.6 MB (gzip) WASM, so the
// worker dynamic-imports it on demand. Preview and STL export both run on the
// manifold engine, so the common path never downloads OpenCascade.
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { setOC, type Solid } from 'replicad';
import { buildBin } from './gridfinity';
import type { BinParams } from '$lib/stores/params';

let ready: Promise<void> | null = null;
function init(): Promise<void> {
	if (!ready) {
		ready = (async () => {
			const OC = await opencascade({ locateFile: () => opencascadeWasm });
			setOC(OC as Parameters<typeof setOC>[0]);
		})();
	}
	return ready;
}

export async function buildOcctBin(params: BinParams): Promise<Solid> {
	await init();
	return buildBin(params);
}
