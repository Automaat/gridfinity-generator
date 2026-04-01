<script lang="ts">
	import { params, dimensions } from '$lib/stores/params';
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

	function applyPreset(idx: number) {
		if (idx >= 0 && idx < presets.length) {
			params.set({ ...presets[idx].params });
		}
	}

	const inputClass = 'mt-1 w-full rounded bg-zinc-700 px-2 py-1 text-sm text-zinc-200';
</script>

<div class="flex flex-col gap-4 overflow-y-auto p-4">
	<label class="block">
		<span class="text-sm text-zinc-400">Preset</span>
		<select
			value={selectedPreset}
			onchange={(e) => applyPreset(Number((e.target as HTMLSelectElement).value))}
			class={inputClass}
		>
			<option value={-1}>Custom</option>
			{#each presets as preset, i}
				<option value={i}>{preset.name}</option>
			{/each}
		</select>
	</label>

	<hr class="border-zinc-700" />

	<h2 class="text-lg font-semibold text-zinc-100">Parameters</h2>

	<div class="space-y-3">
		<label class="block">
			<span class="text-sm text-zinc-400">Width ({dims.widthMm}mm)</span>
			<input type="number" min="1" max="6" step="1" bind:value={$params.width} class={inputClass} />
		</label>

		<label class="block">
			<span class="text-sm text-zinc-400">Length ({dims.lengthMm}mm)</span>
			<input type="number" min="1" max="6" step="1" bind:value={$params.length} class={inputClass} />
		</label>

		<label class="block">
			<span class="text-sm text-zinc-400">Height ({dims.heightMm}mm)</span>
			<input type="number" min="1" max="10" step="1" bind:value={$params.height} class={inputClass} />
		</label>

		<label class="block">
			<span class="text-sm text-zinc-400">Wall thickness (mm)</span>
			<input type="number" min="0.8" max="2.0" step="0.1" bind:value={$params.wallThickness} class={inputClass} />
		</label>
	</div>

	<hr class="border-zinc-700" />

	<div class="space-y-2">
		<label class="flex items-center gap-2 text-sm text-zinc-400">
			<input type="checkbox" bind:checked={$params.magnetHoles} class="accent-blue-500" />
			Magnet holes
		</label>

		<label class="flex items-center gap-2 text-sm text-zinc-400">
			<input type="checkbox" bind:checked={$params.screwHoles} class="accent-blue-500" />
			Screw holes
		</label>

		<label class="flex items-center gap-2 text-sm text-zinc-400">
			<input type="checkbox" bind:checked={$params.labelTab} class="accent-blue-500" />
			Label tab
		</label>

		<label class="block">
			<span class="text-sm text-zinc-400">Scoop wall</span>
			<select bind:value={$params.scoopWall} class={inputClass}>
				<option value="none">None</option>
				<option value="back">Back</option>
				<option value="front">Front</option>
				<option value="left">Left</option>
				<option value="right">Right</option>
			</select>
		</label>

		{#if $params.scoopWall !== 'none'}
			<label class="block">
				<span class="text-sm text-zinc-400">Scoop radius ({$params.scoopRadius || 'auto'}mm)</span>
				<input type="number" min="0" max="20" step="0.5" bind:value={$params.scoopRadius} class={inputClass} />
			</label>
		{/if}
	</div>

	<hr class="border-zinc-700" />

	<label class="block">
		<span class="text-sm text-zinc-400">Stacking lip</span>
		<select bind:value={$params.stackingLip} class={inputClass}>
			<option value="standard">Standard</option>
			<option value="reduced">Reduced</option>
			<option value="none">None</option>
		</select>
	</label>

	<hr class="border-zinc-700" />

	<div class="space-y-3">
		<label class="block">
			<span class="text-sm text-zinc-400">Dividers X</span>
			<input type="number" min="0" max="5" step="1" bind:value={$params.dividersX} class={inputClass} />
		</label>

		<label class="block">
			<span class="text-sm text-zinc-400">Dividers Y</span>
			<input type="number" min="0" max="5" step="1" bind:value={$params.dividersY} class={inputClass} />
		</label>
	</div>

	<hr class="border-zinc-700" />

	<div class="flex gap-2">
		<button
			onclick={() => onexport('step')}
			disabled={exporting || loading}
			class="flex-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
		>
			{exporting ? 'Exporting...' : 'STEP'}
		</button>
		<button
			onclick={() => onexport('stl')}
			disabled={exporting || loading}
			class="flex-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
		>
			{exporting ? 'Exporting...' : 'STL'}
		</button>
	</div>

	<div class="rounded bg-zinc-700/50 px-3 py-2 text-xs text-zinc-400">
		<div>~{estimate.filamentGrams}g PLA · ~{estimate.filamentMeters}m filament</div>
		<div>~{estimate.printTimeMinutes} min print time · {estimate.volumeCm3} cm³</div>
	</div>
</div>
