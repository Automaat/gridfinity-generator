<script lang="ts">
	import { skadisParams, defaultSkadis, type SkadisParams } from '$lib/stores/params';
	import { skadisPresets } from '$lib/presets';
	import { planSkadis, outerDims, SKADIS_PITCH } from '$lib/cad/skadis-layout';

	interface Props {
		onexport: (format: 'step' | 'stl') => void;
		exporting: boolean;
		loading?: boolean;
	}
	let { onexport, exporting, loading = false }: Props = $props();

	let layout = $derived(planSkadis($skadisParams));
	let outer = $derived(outerDims($skadisParams));
	let round1 = (v: number) => Math.round(v * 10) / 10;

	type NumKey = 'width' | 'height' | 'depth' | 'wallThickness' | 'frontWallHeight' | 'sideWallHeight';
	function clamp(v: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, v));
	}
	function round2(v: number): number {
		return Math.round(v * 100) / 100;
	}
	function norm(key: NumKey, v: number): number {
		return key === 'wallThickness' ? round2(v) : Math.round(v);
	}
	function step(key: NumKey, delta: number, min: number, max: number) {
		skadisParams.update((p) => ({ ...p, [key]: norm(key, clamp(p[key] + delta, min, max)) }));
	}
	function setNum(key: NumKey, v: number, min: number, max: number) {
		if (Number.isNaN(v)) return;
		skadisParams.update((p) => ({ ...p, [key]: norm(key, clamp(v, min, max)) }));
	}

	const canonical = (p: SkadisParams): string =>
		JSON.stringify(Object.entries(p).toSorted(([a], [b]) => a.localeCompare(b)));
	let selectedPreset = $derived(skadisPresets.findIndex((p) => canonical(p.params) === canonical($skadisParams)));
	function applyPreset(idx: number) {
		const preset = skadisPresets[idx];
		if (preset) skadisParams.set({ ...preset.params });
	}
	function reset() {
		skadisParams.set({ ...defaultSkadis });
	}

	const lbl = 'text-[13px] font-medium text-zinc-300';
	const section = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500';
	const stepBtn =
		'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-xl leading-none text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-700 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-30';
	const numInput =
		'w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-800/60 px-2 py-2 text-center text-base font-semibold text-zinc-100 [appearance:textfield] focus:border-blue-500 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
	const selectInput =
		'mt-1.5 w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-800/60 bg-[length:1rem] bg-[right_0.6rem_center] bg-no-repeat px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none';
	const chevron =
		"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717a' stroke-width='2.5'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")";
</script>

{#snippet numField(key: NumKey, label: string, min: number, max: number, by: number)}
	<div>
		<label class="mb-1.5 block {lbl}" for={`sk-${key}`}>{label}</label>
		<div class="flex items-center gap-1.5">
			<button type="button" aria-label={`Decrease ${label}`} onclick={() => step(key, -by, min, max)} disabled={$skadisParams[key] <= min} class={stepBtn}>&minus;</button>
			<input
				id={`sk-${key}`}
				type="number"
				{min}
				{max}
				step="any"
				value={$skadisParams[key]}
				oninput={(e) => setNum(key, e.currentTarget.valueAsNumber, min, max)}
				class={numInput}
			/>
			<button type="button" aria-label={`Increase ${label}`} onclick={() => step(key, by, min, max)} disabled={$skadisParams[key] >= max} class={stepBtn}>+</button>
		</div>
	</div>
{/snippet}

<div class="flex flex-col gap-6 p-4">
	<!-- Presets -->
	<section class="flex flex-col gap-2.5">
		<span class={section}>Start from a preset</span>
		<div class="flex flex-wrap gap-1.5">
			{#each skadisPresets as preset, i}
				<button
					type="button"
					title={preset.description}
					onclick={() => applyPreset(i)}
					class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition {selectedPreset === i
						? 'border-blue-500/60 bg-blue-500/15 text-blue-200'
						: 'border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'}"
				>
					{preset.name}
				</button>
			{/each}
			{#if selectedPreset === -1}
				<span class="rounded-lg border border-dashed border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-500">Custom</span>
			{/if}
		</div>
	</section>

	<!-- Size -->
	<section class="flex flex-col gap-3">
		<h2 class={section}>Inside size (mm)</h2>
		<div class="grid grid-cols-2 gap-3">
			{@render numField('width', 'Width', 20, 400, 5)}
			{@render numField('height', 'Height', 20, 400, 5)}
		</div>
		<div class="grid grid-cols-2 gap-3">
			{@render numField('depth', 'Depth', 10, 300, 5)}
			{@render numField('wallThickness', 'Wall', 1, 5, 0.2)}
		</div>
		<p class="rounded-lg bg-zinc-800/50 px-2.5 py-2 text-xs text-zinc-400">
			Outer size <span class="font-semibold text-zinc-200">{round1(outer.outerW)}×{round1(outer.outerD)}×{round1(outer.outerH)}mm</span>
			· dimensions are the usable interior
		</p>
	</section>

	<!-- Mount -->
	<section class="flex flex-col gap-3">
		<h2 class={section}>Skadis mount</h2>
		<label class="block">
			<span class={lbl}>Mount type</span>
			<select bind:value={$skadisParams.mountType} class={selectInput} style:background-image={chevron}>
				<option value="hook">Snap hooks (no screws)</option>
				<option value="screw">M5 screw holes</option>
			</select>
		</label>
		<label class="block">
			<span class={lbl}>{$skadisParams.mountType === 'screw' ? 'Screw rows' : 'Hook rows'}</span>
			<select bind:value={$skadisParams.hookRows} class={selectInput} style:background-image={chevron}>
				<option value={1}>1 row</option>
				<option value={2}>2 rows (heavier loads)</option>
			</select>
		</label>
		<label class="relative flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2.5 transition hover:border-zinc-700 has-[:checked]:border-blue-500/40 has-[:checked]:bg-blue-500/10">
			<input type="checkbox" bind:checked={$skadisParams.openFront} class="peer absolute inset-0 cursor-pointer opacity-0" aria-label="Open front" />
			<span class="text-sm text-zinc-200">Open front (low wall)</span>
			<span class="relative h-5 w-9 shrink-0 rounded-full bg-zinc-600 transition-colors peer-checked:bg-blue-500">
				<span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all peer-checked:left-4"></span>
			</span>
		</label>
		{#if $skadisParams.openFront}
			{@render numField('frontWallHeight', 'Front wall height (mm)', 5, 400, 5)}
		{/if}
		<label class="relative flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2.5 transition hover:border-zinc-700 has-[:checked]:border-blue-500/40 has-[:checked]:bg-blue-500/10">
			<input type="checkbox" bind:checked={$skadisParams.openSides} class="peer absolute inset-0 cursor-pointer opacity-0" aria-label="Open side walls" />
			<span class="text-sm text-zinc-200">Open side walls (low walls)</span>
			<span class="relative h-5 w-9 shrink-0 rounded-full bg-zinc-600 transition-colors peer-checked:bg-blue-500">
				<span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all peer-checked:left-4"></span>
			</span>
		</label>
		{#if $skadisParams.openSides}
			{@render numField('sideWallHeight', 'Side wall height (mm)', 5, 400, 5)}
		{/if}
		<label class="relative flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2.5 transition hover:border-zinc-700 has-[:checked]:border-blue-500/40 has-[:checked]:bg-blue-500/10">
			<input type="checkbox" bind:checked={$skadisParams.lightweightWalls} class="peer absolute inset-0 cursor-pointer opacity-0" aria-label="Lightweight walls" />
			<span class="text-sm text-zinc-200">Lightweight walls (hex cutouts)</span>
			<span class="relative h-5 w-9 shrink-0 rounded-full bg-zinc-600 transition-colors peer-checked:bg-blue-500">
				<span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all peer-checked:left-4"></span>
			</span>
		</label>
		<p class="rounded-lg bg-zinc-800/50 px-2.5 py-2 text-xs text-zinc-400">
			<span class="font-semibold text-zinc-200">{layout.cols}×{layout.rows}</span>
			{$skadisParams.mountType === 'screw' ? 'M5 screw holes' : 'snap hooks'}
			· {SKADIS_PITCH}mm pitch
			{#if layout.cols < 2}
				<span class="mt-1 block text-amber-300/90">Box is narrow — only one mount column; it may rotate on the board.</span>
			{/if}
		</p>
	</section>

	<!-- Export -->
	<section class="flex flex-col gap-2">
		<h2 class={section}>Export</h2>
		<button
			onclick={() => onexport('stl')}
			disabled={exporting || loading}
			aria-label="Download STL"
			class="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
			</svg>
			{exporting ? 'Exporting…' : 'Download STL'}
			<span class="text-xs font-normal text-blue-200/80">for printing</span>
		</button>
		<button
			onclick={() => onexport('step')}
			disabled={exporting || loading}
			aria-label="Download STEP"
			class="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50"
		>
			{exporting ? 'Exporting…' : 'STEP file'}
			<span class="text-xs font-normal text-zinc-500">for CAD</span>
		</button>
		<button
			onclick={reset}
			class="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-white"
		>
			<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M5.5 9a7 7 0 0111.9-2.1L20 9M18.5 15a7 7 0 01-11.9 2.1L4 15" />
			</svg>
			Reset
		</button>
	</section>

	<p class="rounded-lg bg-sky-500/10 px-2.5 py-2 text-xs text-sky-200/90">
		Print with the open top facing up.
		{#if $skadisParams.mountType === 'screw'}
			Bolt the box to the board with M5 screws through the slots — washer + nut behind the board.
		{:else}
			Print the hooks with supports. Slide the hooks into the pegboard slots, then lower the box so the lips drop behind the board.
		{/if}
	</p>
</div>
