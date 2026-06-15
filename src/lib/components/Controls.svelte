<script lang="ts">
	import { params, dimensions, defaultParams, serializeParams, type BinParams } from '$lib/stores/params';
	import { presets } from '$lib/presets';
	import { estimatePrint } from '$lib/utils/print-estimate';

	interface Props {
		onexport: (format: 'step' | 'stl') => void;
		exporting: boolean;
		loading?: boolean;
	}

	let { onexport, exporting, loading = false }: Props = $props();
	let dims = $derived($dimensions);
	let estimate = $derived(estimatePrint($params));

	let selectedPreset = $derived(
		presets.findIndex((p) => JSON.stringify(p.params) === JSON.stringify($params))
	);

	// Advanced features that aren't part of the everyday size/feature workflow.
	let advancedActive = $derived(
		$params.scoopWalls.length > 0 ||
			$params.wallCut ||
			$params.dividersX > 0 ||
			$params.dividersY > 0 ||
			$params.stackingLip !== 'standard'
	);
	let advancedOpen = $state(false);
	// Reveal advanced options when a preset / shared URL turns them on, but never
	// force the panel shut — the user stays in control once they've opened it.
	$effect(() => {
		if (advancedActive) advancedOpen = true;
	});

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	type NumKey = 'width' | 'length' | 'height' | 'wallThickness' | 'dividersX' | 'dividersY';

	function clamp(v: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, v));
	}
	function round2(v: number): number {
		return Math.round(v * 100) / 100;
	}
	// Changing a divider count redistributes evenly, so drop any custom positions
	// for that axis (a stale-length array falls back to even spacing anyway).
	function resetPosForKey<T extends Partial<BinParams>>(next: T, key: NumKey): T {
		if (key === 'dividersX') next.dividerPosX = undefined;
		if (key === 'dividersY') next.dividerPosY = undefined;
		return next;
	}
	function step(key: NumKey, delta: number, min: number, max: number) {
		params.update((p) => resetPosForKey({ ...p, [key]: round2(clamp(p[key] + delta, min, max)) }, key));
	}
	function setNum(key: NumKey, v: number, min: number, max: number) {
		if (Number.isNaN(v)) return;
		params.update((p) => resetPosForKey({ ...p, [key]: round2(clamp(v, min, max)) }, key));
	}
	function resetDividerPositions() {
		params.update((p) => ({ ...p, dividerPosX: undefined, dividerPosY: undefined }));
	}
	let dividerPositionsCustom = $derived(
		($params.dividerPosX?.length ?? 0) > 0 || ($params.dividerPosY?.length ?? 0) > 0
	);

	function applyPreset(idx: number) {
		if (idx >= 0 && idx < presets.length) params.set({ ...presets[idx]!.params });
	}
	function reset() {
		params.set({ ...defaultParams });
	}
	async function copyLink() {
		const qs = serializeParams($params).toString();
		const url = `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ''}`;
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 1600);
		} catch {
			// Clipboard blocked (insecure context / permissions) — silently ignore.
		}
	}

	function fmtTime(min: number): string {
		if (min < 60) return `${min} min`;
		const h = Math.floor(min / 60);
		const m = min % 60;
		return m ? `${h}h ${m}m` : `${h}h`;
	}

	const SCOOP_WALLS = ['back', 'front', 'left', 'right'] as const;

	const lbl = 'text-[13px] font-medium text-zinc-300';
	const section = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500';
	const stepBtn =
		'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-xl leading-none text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-700 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-30';
	const numInput =
		'w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-800/60 px-2 py-2 text-center text-base font-semibold text-zinc-100 [appearance:textfield] focus:border-blue-500 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
	const selectInput =
		'mt-1.5 w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-800/60 bg-[length:1rem] bg-[right_0.6rem_center] bg-no-repeat px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none';
	// Inline chevron so the native select arrow matches the dark theme.
	const chevron =
		"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717a' stroke-width='2.5'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")";
</script>

{#snippet numField(key: NumKey, label: string, name: string, min: number, max: number, by: number)}
	<div>
		<label class="mb-1.5 block {lbl}" for={`num-${key}`}>{label}</label>
		<div class="flex items-center gap-1.5">
			<button
				type="button"
				aria-label={`Decrease ${name}`}
				onclick={() => step(key, -by, min, max)}
				disabled={$params[key] <= min}
				class={stepBtn}>&minus;</button
			>
			<input
				id={`num-${key}`}
				type="number"
				{min}
				{max}
				step={by}
				value={$params[key]}
				oninput={(e) => setNum(key, e.currentTarget.valueAsNumber, min, max)}
				class={numInput}
			/>
			<button
				type="button"
				aria-label={`Increase ${name}`}
				onclick={() => step(key, by, min, max)}
				disabled={$params[key] >= max}
				class={stepBtn}>+</button
			>
		</div>
	</div>
{/snippet}

{#snippet toggleRow(checked: boolean, label: string, onToggle: (v: boolean) => void)}
	<label
		class="relative flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2.5 transition hover:border-zinc-700 has-[:checked]:border-blue-500/40 has-[:checked]:bg-blue-500/10"
	>
		<input
			type="checkbox"
			{checked}
			aria-label={label}
			onchange={(e) => onToggle(e.currentTarget.checked)}
			class="peer absolute inset-0 cursor-pointer opacity-0"
		/>
		<span class="text-sm text-zinc-200">{label}</span>
		<span
			class="relative h-5 w-9 shrink-0 rounded-full bg-zinc-600 transition-colors peer-checked:bg-blue-500"
		>
			<span
				class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all peer-checked:left-4"
			></span>
		</span>
	</label>
{/snippet}

<div class="flex flex-col gap-6 p-4">
	<!-- Presets -->
	<section class="flex flex-col gap-2.5">
		<span class={section}>Start from a preset</span>
		<div class="flex flex-wrap gap-1.5">
			{#each presets as preset, i}
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
				<span
					class="rounded-lg border border-dashed border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-500"
					>Custom</span
				>
			{/if}
		</div>
	</section>

	<!-- Size -->
	<section class="flex flex-col gap-3">
		<h2 class={section}>Size</h2>
		<div class="grid grid-cols-2 gap-3">
			{@render numField('width', `Width (${dims.widthMm}mm)`, 'width', 1, 6, 1)}
			{@render numField('length', `Length (${dims.lengthMm}mm)`, 'length', 1, 6, 1)}
		</div>
		{@render numField('height', `Height (${dims.heightMm}mm)`, 'height', 1, 10, 1)}
		{@render numField('wallThickness', 'Wall thickness (mm)', 'wall thickness', 0.8, 2, 0.1)}
	</section>

	<!-- Features -->
	<section class="flex flex-col gap-2">
		<h2 class={section}>Features</h2>
		{@render toggleRow($params.magnetHoles, 'Magnet holes', (v) => ($params.magnetHoles = v))}
		{@render toggleRow($params.screwHoles, 'Screw holes', (v) => ($params.screwHoles = v))}
		{@render toggleRow($params.labelTab, 'Label tab', (v) => ($params.labelTab = v))}
	</section>

	<!-- Advanced -->
	<details bind:open={advancedOpen} class="group rounded-xl border border-zinc-800 bg-zinc-900/40">
		<summary
			class="flex cursor-pointer list-none items-center justify-between rounded-xl px-3.5 py-3 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800/40"
		>
			<span class="flex items-center gap-2">
				Advanced
				{#if advancedActive}
					<span class="h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden="true"></span>
				{/if}
			</span>
			<svg
				class="chevron h-4 w-4 text-zinc-500 transition-transform"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
			</svg>
		</summary>

		<div class="flex flex-col gap-5 border-t border-zinc-800 px-3.5 py-4">
			<!-- Stacking lip -->
			<label class="block">
				<span class={lbl}>Stacking lip</span>
				<select bind:value={$params.stackingLip} class={selectInput} style:background-image={chevron}>
					<option value="standard">Standard</option>
					<option value="reduced">Reduced</option>
					<option value="none">None</option>
				</select>
			</label>

			<!-- Scoop walls -->
			<div>
				<span class={lbl}>Scoop walls</span>
				<div class="mt-1.5 grid grid-cols-4 gap-1.5">
					{#each SCOOP_WALLS as wall}
						<label
							class="relative flex cursor-pointer items-center justify-center rounded-lg border border-zinc-800 bg-zinc-800/40 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-zinc-700 has-[:checked]:border-blue-500/50 has-[:checked]:bg-blue-500/15 has-[:checked]:text-blue-200"
						>
							<input
								type="checkbox"
								checked={$params.scoopWalls.includes(wall)}
								aria-label={`Scoop ${wall}`}
								onchange={(e) => {
									$params.scoopWalls = e.currentTarget.checked
										? [...$params.scoopWalls, wall]
										: $params.scoopWalls.filter((w) => w !== wall);
								}}
								class="absolute inset-0 cursor-pointer opacity-0"
							/>
							{wall.charAt(0).toUpperCase() + wall.slice(1)}
						</label>
					{/each}
				</div>
				{#if $params.scoopWalls.length > 0}
					<label class="mt-2.5 block">
						<span class="text-xs text-zinc-500">Scoop radius ({$params.scoopRadius || 'auto'}mm)</span>
						<input
							type="range"
							min="0"
							max="20"
							step="0.5"
							bind:value={$params.scoopRadius}
							class="mt-1 w-full accent-blue-500"
						/>
					</label>
				{/if}
			</div>

			<!-- Wall cut -->
			<div class="flex flex-col gap-2.5">
				{@render toggleRow($params.wallCut, 'Wall cut (diagonal slope)', (v) => ($params.wallCut = v))}
				{#if $params.wallCut}
					<label class="block">
						<span class="text-xs text-zinc-500">Slope down toward</span>
						<select bind:value={$params.wallCutSide} class={selectInput} style:background-image={chevron}>
							<option value="front">Front</option>
							<option value="back">Back</option>
							<option value="left">Left</option>
							<option value="right">Right</option>
						</select>
					</label>
					<label class="block">
						<span class="text-xs text-zinc-500"
							>Low side height ({Math.round($params.wallCutLowFraction * 100)}%)</span
						>
						<input
							type="range"
							min="0"
							max="0.95"
							step="0.05"
							bind:value={$params.wallCutLowFraction}
							class="mt-1 w-full accent-blue-500"
						/>
					</label>
					<label class="block">
						<span class="text-xs text-zinc-500"
							>Slope length ({Math.round($params.wallCutRun * 100)}%)</span
						>
						<input
							type="range"
							min="0.1"
							max="1"
							step="0.05"
							bind:value={$params.wallCutRun}
							class="mt-1 w-full accent-blue-500"
						/>
					</label>
				{/if}
			</div>

			<!-- Dividers -->
			<div class="flex flex-col gap-3">
				<span class={lbl}>Dividers</span>
				<div class="grid grid-cols-2 gap-3">
					{@render numField('dividersX', 'Dividers X', 'dividers X', 0, 5, 1)}
					{@render numField('dividersY', 'Dividers Y', 'dividers Y', 0, 5, 1)}
				</div>
				{#if $params.dividersX > 0 || $params.dividersY > 0}
					<p class="flex items-start gap-1.5 rounded-lg bg-sky-500/10 px-2.5 py-2 text-xs text-sky-200/90">
						<svg class="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M7 8l-4 4 4 4M17 8l4 4-4 4M3 12h18" />
						</svg>
						Hover a divider in the 3D view, then drag to reposition it — wall distances update live.
					</p>
					{@render toggleRow(
						$params.lightweightDividers,
						'Lightweight dividers',
						(v) => ($params.lightweightDividers = v)
					)}
					{#if dividerPositionsCustom}
						<button
							onclick={resetDividerPositions}
							class="self-start text-xs font-medium text-zinc-400 underline-offset-2 transition hover:text-zinc-200 hover:underline"
						>
							Reset to even spacing
						</button>
					{/if}
				{/if}
			</div>
		</div>
	</details>

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
		<div class="flex gap-2">
			<button
				onclick={copyLink}
				class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-white"
			>
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
				</svg>
				{copied ? 'Copied!' : 'Copy link'}
			</button>
			<button
				onclick={reset}
				class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-white"
			>
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M5.5 9a7 7 0 0111.9-2.1L20 9M18.5 15a7 7 0 01-11.9 2.1L4 15" />
				</svg>
				Reset
			</button>
		</div>
	</section>

	<!-- Print estimate -->
	<div class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 text-sm">
		<div class="flex items-center gap-2.5 bg-zinc-900/70 p-3">
			<svg class="h-5 w-5 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 3a2 2 0 100 4 2 2 0 000-4zM6.5 9h11l2.5 9a1 1 0 01-1 1.3H5a1 1 0 01-1-1.3L6.5 9z" />
			</svg>
			<div>
				<div class="font-semibold text-zinc-100">~{estimate.filamentGrams} g</div>
				<div class="text-xs text-zinc-500">PLA · {estimate.filamentMeters} m</div>
			</div>
		</div>
		<div class="flex items-center gap-2.5 bg-zinc-900/70 p-3">
			<svg class="h-5 w-5 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
				<circle cx="12" cy="12" r="9" />
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2" />
			</svg>
			<div>
				<div class="font-semibold text-zinc-100">~{fmtTime(estimate.printTimeMinutes)}</div>
				<div class="text-xs text-zinc-500">{estimate.volumeCm3} cm³</div>
			</div>
		</div>
	</div>
</div>

<style>
	details[open] summary .chevron {
		transform: rotate(90deg);
	}
</style>
