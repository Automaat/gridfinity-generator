<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { base } from '$app/paths';
	import { params, serializeParams, deserializeParams, type BinParams } from '$lib/stores/params';
	import Viewer from '$lib/components/Viewer.svelte';
	import Controls from '$lib/components/Controls.svelte';
	import type { WorkerRequest, WorkerResponse } from '$lib/cad/worker';
	import type { WorkerErrorCode } from '$lib/cad/worker-errors';

	// Worker computation is 200-500ms; a build that takes this long means the
	// worker is wedged (e.g. a WASM hang that can't be interrupted from inside).
	const OP_TIMEOUT_MS = 20000;

	const ERROR_LABELS: Record<WorkerErrorCode, string> = {
		InvalidParams: 'Invalid parameters',
		WASMError: 'Geometry engine error',
		OutOfMemory: 'Out of memory',
		Timeout: 'Timed out',
		Unknown: 'Unexpected error'
	};

	let worker: Worker | null = $state(null);
	let workerReady = $state(false);
	let loading = $state(true);
	let exporting = $state(false);
	let controlsOpen = $state(false);
	let buildError: { code: WorkerErrorCode; message: string } | null = $state(null);

	let vertices: Float32Array | null = $state(null);
	let triangles: Uint32Array | null = $state(null);
	let normals: Float32Array | null = $state(null);
	let edges: Float32Array | null = $state(null);

	let debounceTimer: ReturnType<typeof setTimeout>;
	let opTimer: ReturnType<typeof setTimeout> | null = null;
	// Operations posted to the (serial, FIFO) worker but not yet answered. The
	// watchdog stays armed while any remain, so a completed op can't disarm the
	// timeout for one still queued behind it.
	let inFlight = 0;
	// After a timeout-triggered respawn, skip the auto-rebuild so a genuinely
	// hanging param set can't loop forever; the next param change retries.
	let skipAutoBuild = false;
	// Manifold builds are fast (~20-250ms), so instead of a long input debounce we
	// build eagerly and coalesce: while a build runs, keep only the latest pending
	// params and build them when it returns. No backlog; always converges to latest.
	let buildInFlight = false;
	let pendingBuild: BinParams | null = null;
	let urlTimer: ReturnType<typeof setTimeout>;

	function clearOpTimer() {
		if (opTimer !== null) {
			clearTimeout(opTimer);
			opTimer = null;
		}
	}

	// One outstanding op resolved: re-arm the watchdog for any still queued.
	function opResolved() {
		inFlight = Math.max(0, inFlight - 1);
		if (inFlight > 0) startOpTimer();
		else clearOpTimer();
	}

	function setError(code: WorkerErrorCode, message: string) {
		buildError = { code, message };
		loading = false;
		exporting = false;
		inFlight = 0;
		buildInFlight = false;
		pendingBuild = null;
		clearOpTimer();
	}

	function spawnWorker() {
		worker?.terminate();
		workerReady = false;
		inFlight = 0; // the terminated worker's queued ops will never reply
		buildInFlight = false;
		pendingBuild = null;
		worker = new Worker(new URL('$lib/cad/worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const msg = e.data;
			if (msg.type === 'ready') {
				workerReady = true;
				if (skipAutoBuild) {
					skipAutoBuild = false;
				} else {
					requestBuild($params);
				}
			} else if (msg.type === 'mesh') {
				opResolved();
				buildInFlight = false;
				vertices = msg.vertices;
				triangles = msg.triangles;
				normals = msg.normals;
				edges = msg.edges;
				// A param changed mid-build: build the latest now; otherwise settle.
				if (pendingBuild) {
					const next = pendingBuild;
					pendingBuild = null;
					requestBuild(next);
				} else {
					loading = false;
				}
			} else if (msg.type === 'exportSTEP' || msg.type === 'exportSTL') {
				opResolved();
				downloadBlob(msg.blob, msg.type === 'exportSTEP' ? 'bin.step' : 'bin.stl');
				exporting = false;
			} else if (msg.type === 'error') {
				console.error(`Worker error [${msg.code}] on ${msg.requestType}:`, msg.message);
				setError(msg.code, msg.message);
			}
		};
	}

	// A wedged worker never replies, so the timer terminates and respawns it; the
	// fresh worker re-builds the current params once it signals ready.
	function startOpTimer() {
		clearOpTimer();
		opTimer = setTimeout(() => {
			console.error('Worker operation timed out; respawning worker');
			setError('Timeout', `Operation exceeded ${OP_TIMEOUT_MS / 1000}s — the geometry engine was restarted.`);
			skipAutoBuild = true;
			spawnWorker();
		}, OP_TIMEOUT_MS);
	}

	onMount(() => {
		const urlParams = deserializeParams(new URLSearchParams(window.location.search));
		params.set(urlParams);
		spawnWorker();
		// Paint the precomputed default bin immediately so the first visit shows a
		// real model while the worker starts up (loads the manifold WASM and runs
		// the first build). Only valid for the default view — any URL params mean a
		// different bin, so let the worker build it.
		if (serializeParams(urlParams).toString() === '') {
			loadDefaultMesh();
		}
	});

	function base64ToBytes(b64: string): Uint8Array {
		const bin = atob(b64);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return bytes;
	}

	async function loadDefaultMesh() {
		try {
			const res = await fetch(`${base}/default-mesh.json`);
			if (!res.ok) return;
			const d = await res.json();
			// The worker may have answered first on a warm (cached WASM) load — don't
			// overwrite a freshly built mesh with the static placeholder.
			if (vertices) return;
			vertices = new Float32Array(base64ToBytes(d.vertices).buffer);
			normals = new Float32Array(base64ToBytes(d.normals).buffer);
			triangles = new Uint32Array(base64ToBytes(d.triangles).buffer);
			edges = new Float32Array(base64ToBytes(d.edges).buffer);
		} catch {
			// Ignore — the worker will produce the mesh once WASM is ready.
		}
	}

	onDestroy(() => {
		worker?.terminate();
		clearTimeout(debounceTimer);
		clearTimeout(urlTimer);
		clearOpTimer();
	});

	function requestBuild(p: BinParams) {
		if (!worker || !workerReady) return;
		if (buildInFlight) {
			pendingBuild = p; // supersede any earlier pending params
			return;
		}
		buildError = null;
		loading = true;
		buildInFlight = true;
		pendingBuild = null;
		inFlight++;
		startOpTimer();
		worker.postMessage({ type: 'build', params: p } satisfies WorkerRequest);
	}

	function handleExport(format: 'step' | 'stl') {
		// Don't overlap with a build/export — the worker is serial and a second
		// op would clear the in-flight operation's timeout watchdog.
		if (!worker || !workerReady || loading || exporting) return;
		buildError = null;
		exporting = true;
		inFlight++;
		startOpTimer();
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

	// Build on a short debounce (coalescing absorbs bursts); sync the URL on a
	// longer one so dragging a slider doesn't spam history.replaceState.
	const unsubscribe = params.subscribe((p) => {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => requestBuild(p), 40);
		clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			const qs = serializeParams(p).toString();
			history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
		}, 250);
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
		<Viewer
			{vertices}
			{triangles}
			{normals}
			{edges}
			{loading}
			error={buildError && { title: ERROR_LABELS[buildError.code], message: buildError.message }}
		/>

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
