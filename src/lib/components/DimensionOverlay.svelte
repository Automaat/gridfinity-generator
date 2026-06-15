<script lang="ts">
	import { params, dimensions } from '$lib/stores/params';

	let dims = $derived($dimensions);
	let p = $derived($params);
</script>

<div
	class="pointer-events-none absolute bottom-4 left-4 z-20 rounded-xl border border-white/10 bg-zinc-950/50 px-3.5 py-2.5 shadow-lg backdrop-blur-md"
>
	<div class="text-sm font-semibold tracking-tight text-zinc-50">
		{dims.widthMm} × {dims.lengthMm} × {dims.heightMm} <span class="text-zinc-500">mm</span>
	</div>
	<div class="mt-0.5 text-xs text-zinc-400">{p.width}×{p.length} grid · {p.height}U tall</div>
</div>
