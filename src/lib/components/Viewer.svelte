<script lang="ts">
	import { Canvas, T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { BufferGeometry, BufferAttribute, DoubleSide } from 'three';

	interface Props {
		vertices: Float32Array | null;
		triangles: Uint32Array | null;
		normals: Float32Array | null;
		edges: Float32Array | null;
		loading: boolean;
	}

	let { vertices, triangles, normals, edges, loading }: Props = $props();

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
</script>

<div class="relative h-full w-full">
	{#if loading}
		<div class="absolute inset-0 z-10 flex items-center justify-center bg-black/20">
			<div class="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300">Generating...</div>
		</div>
	{/if}

	<Canvas>
		<T.PerspectiveCamera makeDefault position={[120, 80, 120]} fov={45} near={0.1} far={10000}>
			<OrbitControls
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
		</T.Group>

		<T.GridHelper args={[500, 50, '#333', '#222']} />
	</Canvas>
</div>
