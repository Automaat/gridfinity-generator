<script lang="ts">
	import { baseplateParams, type BaseplateParams } from '$lib/stores/params';
	import { baseplatePresets, printerBeds } from '$lib/presets';
	import { planBaseplate } from '$lib/cad/baseplate-layout';
	import { language, text, type Text } from '$lib/i18n';

	interface Props {
		onexport: (format: 'step' | 'stl') => void;
		exporting: boolean;
		loading?: boolean;
	}
	let { onexport, exporting, loading = false }: Props = $props();
	let t = $derived(text[$language]);

	let layout = $derived(planBaseplate($baseplateParams));
	let tileCount = $derived(layout.tiles.length);

	type NumKey = 'drawerWidth' | 'drawerDepth' | 'bedWidth' | 'bedDepth';
	function clamp(v: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, v));
	}
	function step(key: NumKey, delta: number, min: number, max: number) {
		baseplateParams.update((p) => ({ ...p, [key]: clamp(Math.round(p[key] + delta), min, max) }));
	}
	function setNum(key: NumKey, v: number, min: number, max: number) {
		if (Number.isNaN(v)) return;
		baseplateParams.update((p) => ({ ...p, [key]: clamp(Math.round(v), min, max) }));
	}

	// Compare by sorted keys: store updates spread `{ ...p, [key]: v }`, which
	// reorders keys, so plain JSON.stringify would miss a value-identical preset.
	const canonical = (p: BaseplateParams): string =>
		JSON.stringify(Object.entries(p).toSorted(([a], [b]) => a.localeCompare(b)));
	let selectedPreset = $derived(
		baseplatePresets.findIndex((p) => canonical(p.params) === canonical($baseplateParams))
	);

	let selectedPrinter = $derived(
		printerBeds.findIndex((b) => b.w === $baseplateParams.bedWidth && b.d === $baseplateParams.bedDepth)
	);
	function applyPrinter(value: string) {
		if (value === '') return; // "Custom" — keep the current bed size
		const bed = printerBeds[Number(value)];
		if (bed) baseplateParams.update((p) => ({ ...p, bedWidth: bed.w, bedDepth: bed.d }));
	}
	function applyPreset(idx: number) {
		const preset = baseplatePresets[idx];
		if (preset) baseplateParams.set({ ...preset.params });
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
	const presetTextKeys = [
		{ name: 'ikeaAlex', description: 'ikeaAlexDesc' },
		{ name: 'smallDrawer', description: 'smallDrawerDesc' }
	] as const satisfies { name: keyof Text['presets']; description: keyof Text['presets'] }[];
</script>

{#snippet numField(key: NumKey, label: string, min: number, max: number, by: number)}
	<div>
		<label class="mb-1.5 block {lbl}" for={`bp-${key}`}>{label}</label>
		<div class="flex items-center gap-1.5">
			<button type="button" aria-label={`- ${label}`} onclick={() => step(key, -by, min, max)} disabled={$baseplateParams[key] <= min} class={stepBtn}>&minus;</button>
			<input
				id={`bp-${key}`}
				type="number"
				{min}
				{max}
				step="any"
				value={$baseplateParams[key]}
				oninput={(e) => setNum(key, e.currentTarget.valueAsNumber, min, max)}
				class={numInput}
			/>
			<button type="button" aria-label={`+ ${label}`} onclick={() => step(key, by, min, max)} disabled={$baseplateParams[key] >= max} class={stepBtn}>+</button>
		</div>
	</div>
{/snippet}

<div class="flex flex-col gap-6 p-4">
	<!-- Presets -->
	{#if baseplatePresets.length > 0}
		<section class="flex flex-col gap-2.5">
			<span class={section}>{t.startPreset}</span>
			<div class="flex flex-wrap gap-1.5">
				{#each baseplatePresets as preset, i}
					<button
						type="button"
						title={t.presets[presetTextKeys[i]!.description] || preset.description}
						onclick={() => applyPreset(i)}
						class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition {selectedPreset === i
							? 'border-blue-500/60 bg-blue-500/15 text-blue-200'
							: 'border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'}"
					>
						{t.presets[presetTextKeys[i]!.name] || preset.name}
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Drawer -->
	<section class="flex flex-col gap-3">
		<h2 class={section}>{t.drawerInteriorMm}</h2>
		<div class="grid grid-cols-2 gap-3">
			{@render numField('drawerWidth', t.width, 42, 2000, 1)}
			{@render numField('drawerDepth', t.depth, 42, 2000, 1)}
		</div>
		<p class="rounded-lg bg-zinc-800/50 px-2.5 py-2 text-xs text-zinc-400">
			{t.grid} <span class="font-semibold text-zinc-200">{layout.cols}×{layout.rows}</span> {t.cells}
			· {t.skirt} {layout.skirt.x.toFixed(1)}×{layout.skirt.y.toFixed(1)}mm
			· <span class="font-semibold text-zinc-200">{tileCount}</span> {tileCount === 1 ? t.tile : t.tiles}
		</p>
		<div class="grid grid-cols-2 gap-3">
			<label class="block">
				<span class={lbl}>{t.alignX}</span>
				<select bind:value={$baseplateParams.alignX} class={selectInput} style:background-image={chevron}>
					<option value="low">{t.left}</option>
					<option value="center">{t.center}</option>
					<option value="high">{t.right}</option>
				</select>
			</label>
			<label class="block">
				<span class={lbl}>{t.alignY}</span>
				<select bind:value={$baseplateParams.alignY} class={selectInput} style:background-image={chevron}>
					<option value="low">{t.front}</option>
					<option value="center">{t.center}</option>
					<option value="high">{t.back}</option>
				</select>
			</label>
		</div>
	</section>

	<!-- Style -->
	<section class="flex flex-col gap-3">
		<h2 class={section}>{t.style}</h2>
		<div class="grid grid-cols-2 gap-1.5">
			<button
				type="button"
				onclick={() => ($baseplateParams.style = 'simple')}
				class="rounded-lg border px-3 py-2 text-sm font-medium transition {$baseplateParams.style === 'simple'
					? 'border-blue-500/60 bg-blue-500/15 text-blue-200'
					: 'border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700'}"
			>
				{t.simpleGrid}
			</button>
			<button
				type="button"
				onclick={() => ($baseplateParams.style = 'magnet')}
				class="rounded-lg border px-3 py-2 text-sm font-medium transition {$baseplateParams.style === 'magnet'
					? 'border-blue-500/60 bg-blue-500/15 text-blue-200'
					: 'border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700'}"
			>
				{t.magnet}
			</button>
		</div>
		{#if $baseplateParams.style === 'magnet'}
			<label class="relative flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2.5 transition hover:border-zinc-700 has-[:checked]:border-blue-500/40 has-[:checked]:bg-blue-500/10">
				<input type="checkbox" bind:checked={$baseplateParams.screwHoles} class="peer absolute inset-0 cursor-pointer opacity-0" aria-label={t.screwHoles} />
				<span class="text-sm text-zinc-200">{t.screwHolesM3}</span>
				<span class="relative h-5 w-9 shrink-0 rounded-full bg-zinc-600 transition-colors peer-checked:bg-blue-500">
					<span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all peer-checked:left-4"></span>
				</span>
			</label>
		{/if}
	</section>

	<!-- Tiling -->
	<section class="flex flex-col gap-3">
		<h2 class={section}>{t.printerBedTiling}</h2>
		<label class="block">
			<span class={lbl}>{t.printer}</span>
			<select
				onchange={(e) => applyPrinter(e.currentTarget.value)}
				class={selectInput}
				style:background-image={chevron}
			>
				<option value="" selected={selectedPrinter === -1}>{t.custom}</option>
				{#each printerBeds as bed, i}
					<option value={i} selected={i === selectedPrinter}>{bed.name} ({bed.w}×{bed.d})</option>
				{/each}
			</select>
		</label>
		<div class="grid grid-cols-2 gap-3">
			{@render numField('bedWidth', t.bedWidth, 42, 1000, 5)}
			{@render numField('bedDepth', t.bedDepth, 42, 1000, 5)}
		</div>
		<label class="block">
			<span class={lbl}>{t.splitLayout}</span>
			<select bind:value={$baseplateParams.splitAlgorithm} class={selectInput} style:background-image={chevron}>
				<option value="ideal">{t.balancedTiles}</option>
				<option value="incremental">{t.packedTiles}</option>
			</select>
		</label>
		{#if layout.multiTile}
			<label class="block">
				<span class={lbl}>{t.connector}</span>
				<select bind:value={$baseplateParams.connector} class={selectInput} style:background-image={chevron}>
					<option value="filament">{t.filamentPin}</option>
					<option value="dovetail">{t.dovetail}</option>
					<option value="screw">{t.screwTogether}</option>
					<option value="none">{t.noneFlush}</option>
				</select>
			</label>
			{#if $baseplateParams.connector === 'filament'}
				<p class="text-xs text-zinc-500">{t.filamentHint}</p>
			{:else if $baseplateParams.connector === 'screw'}
				<p class="text-xs text-zinc-500">{t.screwHint}</p>
			{:else if $baseplateParams.connector === 'none'}
				<p class="text-xs text-zinc-500">{t.noneHint}</p>
			{/if}
		{:else}
			<p class="text-xs text-zinc-500">{t.baseplateFitsOnePiece}</p>
		{/if}
	</section>

	<!-- Export -->
	<section class="flex flex-col gap-2">
		<h2 class={section}>{t.export}</h2>
		{#if layout.multiTile}
			<label class="block">
				<span class={lbl}>{t.stlLayout}</span>
				<select bind:value={$baseplateParams.exportLayout} class={selectInput} style:background-image={chevron}>
					<option value="zip">{t.zipPerTile}</option>
					<option value="combined">{t.combinedTiles}</option>
				</select>
			</label>
		{/if}
		<button
			onclick={() => onexport('stl')}
			disabled={exporting || loading}
			aria-label={t.downloadStl}
			class="mt-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
			</svg>
			{exporting ? t.exporting : layout.multiTile && $baseplateParams.exportLayout === 'zip' ? t.downloadStlZip : t.downloadStl}
		</button>
		<button
			onclick={() => onexport('step')}
			disabled={exporting || loading}
			aria-label="Download STEP"
			class="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50"
		>
			{exporting ? t.exporting : t.stepFile}
			<span class="text-xs font-normal text-zinc-500">{t.forCad}</span>
		</button>
	</section>
</div>
