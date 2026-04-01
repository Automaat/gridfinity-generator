<script lang="ts">
	import { params, dimensions } from '$lib/stores/params';

	let dims = $derived($dimensions);
	let p = $derived($params);
</script>

<div class="absolute bottom-4 left-4 z-20 rounded bg-zinc-900/70 px-3 py-2 text-xs text-zinc-300">
	<div class="font-medium">{dims.widthMm} × {dims.lengthMm} × {dims.heightMm} mm</div>
	<div class="text-zinc-400">{p.width}×{p.length} grid · {p.height}U tall</div>
</div>
