<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { params, serializeParams, deserializeParams, type BinParams } from '$lib/stores/params';
	import Viewer from '$lib/components/Viewer.svelte';
	import Controls from '$lib/components/Controls.svelte';
	import type { WorkerRequest, WorkerResponse } from '$lib/cad/worker';

	let worker: Worker | null = $state(null);
	let workerReady = $state(false);
	let loading = $state(true);
	let exporting = $state(false);
	let controlsOpen = $state(false);

	let vertices: Float32Array | null = $state(null);
	let triangles: Uint32Array | null = $state(null);
	let normals: Float32Array | null = $state(null);
	let edges: Float32Array | null = $state(null);

	let debounceTimer: ReturnType<typeof setTimeout>;

	onMount(() => {
		const urlParams = deserializeParams(new URLSearchParams(window.location.search));
		params.set(urlParams);

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

	// debounced rebuild + URL sync on param change
	const unsubscribe = params.subscribe((p) => {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			requestBuild(p);
			const sp = serializeParams(p);
			const qs = sp.toString();
			history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
		}, 150);
	});

	onDestroy(unsubscribe);
</script>

<svelte:head>
	<title>Gridfinity Bin Generator</title>
</svelte:head>

<div class="flex h-screen flex-col bg-zinc-900 text-zinc-100 md:flex-row">
	<!-- Desktop sidebar -->
	<aside class="hidden w-72 shrink-0 overflow-y-auto border-r border-zinc-700 bg-zinc-800 md:block">
		<div class="border-b border-zinc-700 px-4 py-3">
			<h1 class="text-base font-bold">Gridfinity Generator</h1>
		</div>
		<Controls onexport={handleExport} {exporting} {loading} />
	</aside>

	<main class="relative flex-1">
		<Viewer {vertices} {triangles} {normals} {edges} {loading} />

		<!-- Mobile controls toggle -->
		<button
			onclick={() => (controlsOpen = !controlsOpen)}
			class="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-500 md:hidden"
			aria-label="Toggle controls"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
			</svg>
		</button>
	</main>
</div>

<!-- Mobile controls panel -->
{#if controlsOpen}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 z-40 bg-black/40 md:hidden"
		onclick={() => (controlsOpen = false)}
		aria-label="Close controls"
	></button>
	<div class="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-xl bg-zinc-800 md:hidden">
		<div class="sticky top-0 flex items-center justify-between border-b border-zinc-700 bg-zinc-800 px-4 py-3">
			<h1 class="text-base font-bold">Gridfinity Generator</h1>
			<button onclick={() => (controlsOpen = false)} class="text-zinc-400 hover:text-zinc-200" aria-label="Close controls">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
		<Controls onexport={handleExport} {exporting} {loading} />
	</div>
{/if}
