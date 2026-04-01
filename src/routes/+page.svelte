<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { params, type BinParams } from '$lib/stores/params';
	import Viewer from '$lib/components/Viewer.svelte';
	import Controls from '$lib/components/Controls.svelte';
	import type { WorkerRequest, WorkerResponse } from '$lib/cad/worker';

	let worker: Worker | null = $state(null);
	let workerReady = $state(false);
	let loading = $state(true);
	let exporting = $state(false);

	let vertices: Float32Array | null = $state(null);
	let triangles: Uint32Array | null = $state(null);
	let normals: Float32Array | null = $state(null);
	let edges: Float32Array | null = $state(null);

	let debounceTimer: ReturnType<typeof setTimeout>;

	onMount(() => {
		worker = new Worker(new URL('$lib/cad/worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const msg = e.data;
			if (msg.type === 'ready') {
				workerReady = true;
				requestBuild($params);
			} else if (msg.type === 'mesh') {
				vertices = msg.vertices;
				triangles = msg.triangles;
				normals = msg.normals;
				edges = msg.edges;
				loading = false;
			} else if (msg.type === 'exportSTEP' || msg.type === 'exportSTL') {
				downloadBlob(msg.blob, msg.type === 'exportSTEP' ? 'bin.step' : 'bin.stl');
				exporting = false;
			} else if (msg.type === 'error') {
				console.error('Worker error:', msg.message);
				loading = false;
				exporting = false;
			}
		};
	});

	onDestroy(() => {
		worker?.terminate();
		clearTimeout(debounceTimer);
	});

	function requestBuild(p: BinParams) {
		if (!worker || !workerReady) return;
		loading = true;
		worker.postMessage({ type: 'build', params: p } satisfies WorkerRequest);
	}

	function handleExport(format: 'step' | 'stl') {
		if (!worker || !workerReady) return;
		exporting = true;
		const type = format === 'step' ? 'exportSTEP' : 'exportSTL';
		worker.postMessage({ type, params: $params } satisfies WorkerRequest);
	}

	function downloadBlob(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	// debounced rebuild on param change
	const unsubscribe = params.subscribe((p) => {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => requestBuild(p), 150);
	});

	onDestroy(unsubscribe);
</script>

<svelte:head>
	<title>Gridfinity Bin Generator</title>
</svelte:head>

<div class="flex h-screen bg-zinc-900 text-zinc-100">
	<aside class="w-72 shrink-0 border-r border-zinc-700 bg-zinc-800">
		<div class="border-b border-zinc-700 px-4 py-3">
			<h1 class="text-base font-bold">Gridfinity Generator</h1>
		</div>
		<Controls onexport={handleExport} {exporting} />
	</aside>

	<main class="flex-1">
		<Viewer {vertices} {triangles} {normals} {edges} {loading} />
	</main>
</div>
