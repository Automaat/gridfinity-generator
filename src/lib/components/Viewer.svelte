<script lang="ts">
	import { browser } from '$app/environment';
	import { Canvas, T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { BufferGeometry, BufferAttribute, DoubleSide } from 'three';
	import DimensionOverlay from './DimensionOverlay.svelte';
	import DividerGizmos from './DividerGizmos.svelte';

	// Cap device pixel ratio: phones report dpr 3, which renders 9× the pixels of
	// dpr 1 for no visible gain on this simple scene. 2 is the quality/fillrate knee.
	const dpr = browser ? Math.min(window.devicePixelRatio || 1, 2) : 1;

	interface Props {
		vertices: Float32Array | null;
		triangles: Uint32Array | null;
		normals: Float32Array | null;
		edges: Float32Array | null;
		loading: boolean;
		error?: { title: string; message: string } | null;
	}

	let { vertices, triangles, normals, edges, loading, error = null }: Props = $props();

	// True while a divider handle is hovered/dragged — freezes OrbitControls so
	// grabbing a divider repositions it instead of orbiting the camera.
	let dividerDragging = $state(false);

	let meshGeometry = $derived.by(() => {
		if (!vertices || !triangles || !normals) return null;
		const geo = new BufferGeometry();
		geo.setAttribute('position', new BufferAttribute(vertices, 3));
		geo.setAttribute('normal', new BufferAttribute(normals, 3));
		geo.setIndex(new BufferAttribute(triangles, 1));
		geo.computeBoundingBox();
		return geo;
	});

	let edgeGeometry = $derived.by(() => {
		if (!edges) return null;
		const geo = new BufferGeometry();
		geo.setAttribute('position', new BufferAttribute(edges, 3));
		return geo;
	});

	// Each rebuild produces a fresh BufferGeometry; Three uploads it to the GPU but
	// won't free the previous one. Dispose the outgoing geometry when it's replaced
	// (and on unmount) so a slider-dragging session can't leak dozens of VBOs.
	$effect(() => {
		const geo = meshGeometry;
		return () => geo?.dispose();
	});
	$effect(() => {
		const geo = edgeGeometry;
		return () => geo?.dispose();
	});
</script>

<div
	class="relative h-full w-full"
	style="background: radial-gradient(120% 90% at 50% -10%, #2a3a52 0%, #14202f 45%, #080b11 100%)"
>
	{#if loading && !meshGeometry}
		<div class="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
			<div class="flex items-center gap-3 rounded-lg bg-zinc-800 px-4 py-3">
				<div class="h-5 w-5 animate-spin rounded-full border-2 border-zinc-500 border-t-blue-400"></div>
				<span class="text-sm text-zinc-300">Generating...</span>
			</div>
		</div>
	{:else if loading}
		<!-- A mesh is already on screen (placeholder or prior build); don't hide it -->
		<div class="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full bg-zinc-800/90 px-3 py-1.5 shadow-lg">
			<div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-500 border-t-blue-400"></div>
			<span class="text-xs text-zinc-300">Generating...</span>
		</div>
	{/if}

	{#if error}
		<div class="absolute inset-x-0 top-0 z-10 flex justify-center p-4" role="alert">
			<div class="max-w-md rounded-lg border border-red-500/50 bg-red-950/90 px-4 py-3 shadow-lg">
				<p class="text-sm font-semibold text-red-300">{error.title}</p>
				<p class="mt-1 break-words text-xs text-red-200/80">{error.message}</p>
			</div>
		</div>
	{/if}

	<DimensionOverlay />

	<Canvas {dpr}>
		<T.PerspectiveCamera makeDefault position={[120, 80, 120]} fov={45} near={0.1} far={10000}>
			<OrbitControls
				enabled={!dividerDragging}
				enableDamping
				minDistance={10}
				maxDistance={1000}
				maxPolarAngle={Infinity}
			/>
		</T.PerspectiveCamera>

		<T.AmbientLight intensity={0.4} />
		<T.DirectionalLight position={[100, 200, 100]} intensity={0.8} />
		<T.DirectionalLight position={[-50, -100, -50]} intensity={0.3} />

		<!-- Rotate Z-up (CAD) to Y-up (Three.js) -->
		<T.Group rotation.x={-Math.PI / 2}>
			{#if meshGeometry}
				<T.Mesh geometry={meshGeometry}>
					<T.MeshStandardMaterial color="#4a9eff" roughness={0.5} metalness={0.1} side={DoubleSide} />
				</T.Mesh>
			{/if}

			{#if edgeGeometry}
				<T.LineSegments geometry={edgeGeometry}>
					<T.LineBasicMaterial color="#1a1a2e" />
				</T.LineSegments>
			{/if}

			<DividerGizmos onDraggingChange={(v) => (dividerDragging = v)} />
		</T.Group>

		<T.GridHelper args={[500, 50, '#3a4a63', '#1c2433']} />
	</Canvas>
</div>
