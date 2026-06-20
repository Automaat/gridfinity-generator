<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { base } from '$app/paths';
	import { params, baseplateParams, skadisParams, mode, serializeAll, deserializeAll } from '$lib/stores/params';
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
	// Latest store values are always read at build time, so coalescing only needs a
	// "rebuild pending" flag — works for either mode (bin or baseplate).
	let pendingBuild = false;
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
		pendingBuild = false;
		clearOpTimer();
	}

	function spawnWorker() {
		worker?.terminate();
		workerReady = false;
		inFlight = 0; // the terminated worker's queued ops will never reply
		buildInFlight = false;
		pendingBuild = false;
		worker = new Worker(new URL('$lib/cad/worker.ts', import.meta.url), { type: 'module' });
		worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
			const msg = e.data;
			if (msg.type === 'ready') {
				workerReady = true;
				if (skipAutoBuild) {
					skipAutoBuild = false;
				} else {
					requestBuild();
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
					pendingBuild = false;
					requestBuild();
				} else {
					loading = false;
				}
			} else if (msg.type === 'exportSTEP' || msg.type === 'exportSTL') {
				opResolved();
				downloadBlob(msg.blob, msg.filename);
				exporting = false;
			} else if (msg.type === 'error') {
				console.error(`Worker error [${msg.code}] on ${msg.requestType}:`, msg.message);
				setError(msg.code, msg.message);
			}
		});
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
		const url = new URLSearchParams(window.location.search);
		const { mode: m, bin, baseplate, skadis } = deserializeAll(url);
		mode.set(m);
		params.set(bin);
		baseplateParams.set(baseplate);
		skadisParams.set(skadis);
		spawnWorker();
		// Paint the precomputed default bin immediately so the first visit shows a
		// real model while the worker starts up. Only valid for the default bin view
		// — any params (or another mode) mean a different model, so let the worker build it.
		if (m === 'bin' && serializeAll(m, bin, baseplate, skadis).toString() === '') {
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

	function requestBuild() {
		if (!worker || !workerReady) return;
		if (buildInFlight) {
			pendingBuild = true; // rebuild from the latest stores once this one returns
			return;
		}
		buildError = null;
		loading = true;
		buildInFlight = true;
		pendingBuild = false;
		inFlight++;
		startOpTimer();
		const req: WorkerRequest =
			$mode === 'baseplate'
				? { type: 'buildBaseplate', params: $baseplateParams }
				: $mode === 'skadis'
					? { type: 'buildSkadis', params: $skadisParams }
					: { type: 'build', params: $params };
		worker.postMessage(req);
	}

	function handleExport(format: 'step' | 'stl') {
		// Don't overlap with a build/export — the worker is serial and a second
		// op would clear the in-flight operation's timeout watchdog.
		if (!worker || !workerReady || loading || exporting) return;
		buildError = null;
		exporting = true;
		inFlight++;
		startOpTimer();
		const req: WorkerRequest =
			$mode === 'baseplate'
				? { type: format === 'step' ? 'exportBaseplateSTEP' : 'exportBaseplateSTL', params: $baseplateParams }
				: $mode === 'skadis'
					? { type: format === 'step' ? 'exportSkadisSTEP' : 'exportSkadisSTL', params: $skadisParams }
					: { type: format === 'step' ? 'exportSTEP' : 'exportSTL', params: $params };
		worker.postMessage(req);
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
	// longer one so dragging a slider doesn't spam history.replaceState. Any of the
	// three stores (mode, bin params, baseplate params) can drive a rebuild.
	function scheduleBuildAndSync() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => requestBuild(), 40);
		clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			const qs = serializeAll($mode, $params, $baseplateParams, $skadisParams).toString();
			history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
		}, 250);
	}
	const unsubP = params.subscribe(() => scheduleBuildAndSync());
	const unsubBp = baseplateParams.subscribe(() => scheduleBuildAndSync());
	const unsubSk = skadisParams.subscribe(() => scheduleBuildAndSync());
	const unsubMode = mode.subscribe(() => scheduleBuildAndSync());

	onDestroy(() => {
		unsubP();
		unsubBp();
		unsubSk();
		unsubMode();
	});
</script>

<svelte:head>
	<title>Gridfinity Bin Generator</title>
</svelte:head>

{#snippet logo()}
	<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 ring-1 ring-inset ring-blue-500/30">
		<svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5 text-blue-400">
			<rect x="3" y="3" width="8" height="8" rx="2.2" />
			<rect x="13" y="3" width="8" height="8" rx="2.2" />
			<rect x="3" y="13" width="8" height="8" rx="2.2" />
			<rect x="13" y="13" width="8" height="8" rx="2.2" />
		</svg>
	</div>
{/snippet}

<div class="flex h-screen flex-col bg-zinc-950 text-zinc-100 md:flex-row">
	<!-- Desktop sidebar -->
	<aside class="hidden w-80 shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-900 md:block">
		<div class="sticky top-0 z-10 flex items-center gap-2.5 border-b border-zinc-800 bg-zinc-900/95 px-4 py-3.5 backdrop-blur">
			{@render logo()}
			<div>
				<h1 class="text-sm font-bold leading-tight">Gridfinity Generator</h1>
				<p class="text-[11px] text-zinc-500">Parametric bins · live preview</p>
			</div>
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
			onclick={() => (controlsOpen = true)}
			class="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-blue-900/40 ring-1 ring-white/10 transition hover:bg-blue-500 active:scale-95 md:hidden"
			aria-label="Toggle controls"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
			</svg>
			Customize
		</button>
	</main>
</div>

<!-- Mobile controls panel -->
{#if controlsOpen}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
		onclick={() => (controlsOpen = false)}
		aria-label="Close controls"
	></button>
	<div class="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border-t border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl md:hidden">
		<div class="shrink-0 border-b border-zinc-800 bg-zinc-900">
			<div class="flex justify-center pt-2.5">
				<div class="h-1 w-10 rounded-full bg-zinc-700"></div>
			</div>
			<div class="flex items-center justify-between gap-2.5 px-4 py-3">
				<div class="flex items-center gap-2.5">
					{@render logo()}
					<h1 class="text-sm font-bold">Gridfinity Generator</h1>
				</div>
				<button onclick={() => (controlsOpen = false)} class="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200" aria-label="Close controls">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>
		<div class="overflow-y-auto">
			<Controls onexport={handleExport} {exporting} {loading} />
		</div>
	</div>
{/if}
