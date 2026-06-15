<script lang="ts">
	import { browser } from '$app/environment';
	import { T, useThrelte } from '@threlte/core';
	import { interactivity, HTML, type IntersectionEvent } from '@threlte/extras';
	import {
		BufferGeometry,
		BufferAttribute,
		Vector2,
		Vector3,
		Raycaster,
		Plane,
		LineBasicMaterial
	} from 'three';
	import { onDestroy } from 'svelte';
	import { params } from '$lib/stores/params';
	import {
		interiorBox,
		dividerCoords,
		resolveFractions,
		compartmentEdges,
		redistributeGaps,
		clamp
	} from '$lib/cad/divider-layout';

	// Rendered INSIDE the Z-up→Y-up group, so all positions here are model coords.
	let { onDraggingChange }: { onDraggingChange: (active: boolean) => void } = $props();

	// Pointer interactivity touches window/document; only wire it in the browser
	// so server-side rendering can't trip over it.
	if (browser) interactivity();
	const { camera, renderer, invalidate } = useThrelte();

	// Handles float just above the rim; the drag plane sits at the same height so
	// the grab point and subsequent moves map consistently.
	const HANDLE_Z = 2; // hit-volume centre / drag-plane height above the rim
	const GRAB = 9; // invisible grab-volume width (mm) — generous hit target
	const DIM_OFFSET = 8; // dimension row distance outside the bin
	const DIM_Z = 2; // dimension height above the rim
	const TICK = 2.2;

	let box = $derived(interiorBox($params));
	let active = $derived(box.wallHeight > 0); // collapsed bins have no dividers
	let xs = $derived(active ? dividerCoords($params.dividersX, $params.dividerPosX, box.innerW) : []);
	let ys = $derived(active ? dividerCoords($params.dividersY, $params.dividerPosY, box.innerL) : []);

	let hoverKey = $state<string | null>(null);
	let dragging = $state<{ axis: 'x' | 'y'; index: number; offset: number } | null>(null);

	// Disable OrbitControls whenever a handle is hovered or dragged — set before any
	// pointerdown reaches the controls, so grabbing a handle never starts an orbit.
	$effect(() => {
		onDraggingChange(hoverKey !== null || dragging !== null);
		invalidate(); // repaint handles on hover/drag state change (demand frameloop)
		const el = renderer?.domElement;
		if (el) el.style.cursor = dragging ? 'grabbing' : hoverKey ? 'grab' : '';
	});
	onDestroy(() => {
		const el = renderer?.domElement;
		if (el) el.style.cursor = '';
	});

	const raycaster = new Raycaster();
	const ndc = new Vector2();
	const hit = new Vector3();
	const UP = new Vector3(0, 1, 0);
	const dragPlane = new Plane();

	// Project a screen pointer onto the rim-height plane, returning the model-space
	// coordinate along the drag axis (model x for X dividers, model y for Y).
	function pointerModel(ev: PointerEvent, axis: 'x' | 'y'): number | null {
		const rect = renderer.domElement.getBoundingClientRect();
		ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
		ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(ndc, camera.current);
		dragPlane.set(UP, -(box.topZ + HANDLE_Z)); // world y === model z under the group rotation
		if (!raycaster.ray.intersectPlane(dragPlane, hit)) return null;
		return axis === 'x' ? hit.x : -hit.z; // model y = -world z
	}

	function startDrag(axis: 'x' | 'y', index: number, grabModel: number, ev: PointerEvent) {
		const coords = axis === 'x' ? xs : ys;
		dragging = { axis, index, offset: coords[index] - grabModel };
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp, { once: true });
	}

	function onMove(ev: PointerEvent) {
		if (!dragging) return;
		const { axis, index, offset } = dragging;
		const inner = axis === 'x' ? box.innerW : box.innerL;
		const m = pointerModel(ev, axis);
		if (m === null) return;
		let frac = (m + offset + inner / 2) / inner;
		const count = axis === 'x' ? $params.dividersX : $params.dividersY;
		const cur = resolveFractions(
			count,
			axis === 'x' ? $params.dividerPosX : $params.dividerPosY
		).slice();
		// Keep a wall-plus-margin between neighbours so dividers never collide/reorder.
		const minGap = ($params.wallThickness + 1) / inner;
		const lo = index > 0 ? cur[index - 1] + minGap : minGap;
		const hi = index < cur.length - 1 ? cur[index + 1] - minGap : 1 - minGap;
		cur[index] = clamp(frac, lo, Math.max(lo, hi));
		params.update((p) => (axis === 'x' ? { ...p, dividerPosX: cur } : { ...p, dividerPosY: cur }));
		invalidate();
	}

	function onUp() {
		dragging = null;
		window.removeEventListener('pointermove', onMove);
	}

	onDestroy(() => window.removeEventListener('pointermove', onMove));

	// Handle appearance by interaction state: dragged = amber, hovered = white,
	// idle = soft sky. Read $state inside so the template re-evaluates reactively.
	function isDragKey(key: string): boolean {
		return dragging !== null && `${dragging.axis}${dragging.index}` === key;
	}
	function handleColor(key: string): string {
		return isDragKey(key) ? '#fde68a' : hoverKey === key ? '#ffffff' : '#bae6fd';
	}
	function handleEmissive(key: string): string {
		return isDragKey(key) ? '#f59e0b' : '#0ea5e9';
	}
	function handleGlow(key: string): number {
		return isDragKey(key) ? 1 : hoverKey === key ? 0.85 : 0.4;
	}

	// --- Dimension lines (one LineSegments per axis: a spanning line + edge ticks) ---
	const dimMaterial = new LineBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.4 });

	function dimGeometry(edges: number[], axis: 'x' | 'y'): BufferGeometry {
		const z = box.topZ + DIM_Z;
		const pts: number[] = [];
		const a = edges[0];
		const b = edges[edges.length - 1];
		if (axis === 'x') {
			const y = box.innerL / 2 + DIM_OFFSET;
			pts.push(a, y, z, b, y, z);
			for (const e of edges) pts.push(e, y - TICK, z, e, y + TICK, z);
		} else {
			const x = box.innerW / 2 + DIM_OFFSET;
			pts.push(x, a, z, x, b, z);
			for (const e of edges) pts.push(x - TICK, e, z, x + TICK, e, z);
		}
		const g = new BufferGeometry();
		g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
		return g;
	}

	let xEdges = $derived(compartmentEdges(xs, box.innerW));
	let yEdges = $derived(compartmentEdges(ys, box.innerL));
	let dimXGeo = $derived(xs.length > 0 ? dimGeometry(xEdges, 'x') : null);
	let dimYGeo = $derived(ys.length > 0 ? dimGeometry(yEdges, 'y') : null);
	$effect(() => {
		const g = dimXGeo;
		return () => g?.dispose();
	});
	$effect(() => {
		const g = dimYGeo;
		return () => g?.dispose();
	});
	onDestroy(() => dimMaterial.dispose());

	// --- Editable compartment sizes ---
	// Returns false if the input wasn't a usable number (caller resets the field).
	function commitGap(axis: 'x' | 'y', index: number, raw: string): boolean {
		const value = parseFloat(raw.replace(',', '.'));
		if (Number.isNaN(value)) return false;
		const inner = axis === 'x' ? box.innerW : box.innerL;
		const count = axis === 'x' ? $params.dividersX : $params.dividersY;
		if (count < 1) return false;
		const coords = dividerCoords(count, axis === 'x' ? $params.dividerPosX : $params.dividerPosY, inner);
		const edges = compartmentEdges(coords, inner);
		const gaps = edges.slice(1).map((e, i) => e - edges[i]);
		const next = redistributeGaps(gaps, index, value, inner, $params.wallThickness + 1);
		let cum = 0;
		const fracs: number[] = [];
		for (let i = 0; i < next.length - 1; i++) {
			cum += next[i];
			fracs.push(clamp(cum / inner, 0, 1));
		}
		params.update((p) => (axis === 'x' ? { ...p, dividerPosX: fracs } : { ...p, dividerPosY: fracs }));
		invalidate();
		return true;
	}
</script>

{#snippet handle(key: string, pos: [number, number, number], railLen: number, along: 'x' | 'y')}
	{@const rot = along === 'x' ? 0 : Math.PI / 2}
	<!-- slim glowing rail, shown only while the divider is hovered/dragged -->
	<T.Mesh position={[pos[0], pos[1], pos[2] + 1.3]} rotation={[0, 0, rot]}>
		<T.CapsuleGeometry args={[1, Math.max(1, railLen - 6), 6, 16]} />
		<T.MeshStandardMaterial
			color={handleColor(key)}
			emissive={handleEmissive(key)}
			emissiveIntensity={handleGlow(key)}
			roughness={0.25}
			metalness={0.1}
		/>
	</T.Mesh>
{/snippet}

{#snippet dimLabel(axis: 'x' | 'y', k: number, size: number, position: [number, number, number])}
	<HTML {position} center pointerEvents="auto">
		<div
			class="flex items-center gap-0.5 rounded-full border border-white/15 bg-slate-900/80 px-2 py-[3px] text-[11px] font-medium leading-none text-sky-50 shadow-lg backdrop-blur-md tabular-nums focus-within:border-sky-400/60 focus-within:ring-1 focus-within:ring-sky-400/40"
		>
			<input
				class="w-10 cursor-text bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
				value={size.toFixed(1)}
				inputmode="decimal"
				aria-label="Compartment size in millimetres"
				onpointerdown={(e) => e.stopPropagation()}
				onfocus={(e) => e.currentTarget.select()}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						e.currentTarget.blur();
					}
				}}
				onchange={(e) => {
					if (!commitGap(axis, k, e.currentTarget.value)) e.currentTarget.value = size.toFixed(1);
				}}
			/>
			<span class="text-sky-300/60">mm</span>
		</div>
	</HTML>
{/snippet}

{#if active}
	<!-- X dividers: slide along width -->
	{#each xs as x, i (i)}
		{@const key = `x${i}`}
		<T.Mesh
			position={[x, 0, box.topZ + HANDLE_Z]}
			onpointerdown={(e: IntersectionEvent<PointerEvent>) => {
				e.stopPropagation();
				startDrag('x', i, e.point.x, e.nativeEvent);
			}}
			onpointerenter={() => (hoverKey = key)}
			onpointerleave={() => (hoverKey = hoverKey === key ? null : hoverKey)}
		>
			<T.BoxGeometry args={[GRAB, box.innerL, 9]} />
			<T.MeshBasicMaterial transparent opacity={0} depthWrite={false} />
		</T.Mesh>
		{#if hoverKey === key || isDragKey(key)}
			{@render handle(key, [x, 0, box.topZ], box.innerL, 'x')}
		{/if}
	{/each}

	<!-- Y dividers: slide along length -->
	{#each ys as y, i (i)}
		{@const key = `y${i}`}
		<T.Mesh
			position={[0, y, box.topZ + HANDLE_Z]}
			onpointerdown={(e: IntersectionEvent<PointerEvent>) => {
				e.stopPropagation();
				startDrag('y', i, -e.point.z, e.nativeEvent);
			}}
			onpointerenter={() => (hoverKey = key)}
			onpointerleave={() => (hoverKey = hoverKey === key ? null : hoverKey)}
		>
			<T.BoxGeometry args={[box.innerW, GRAB, 9]} />
			<T.MeshBasicMaterial transparent opacity={0} depthWrite={false} />
		</T.Mesh>
		{#if hoverKey === key || isDragKey(key)}
			{@render handle(key, [0, y, box.topZ], box.innerW, 'y')}
		{/if}
	{/each}

	<!-- Dimension guides + labels (mm gaps between walls/dividers) -->
	{#if dimXGeo}
		<T.LineSegments geometry={dimXGeo} material={dimMaterial} />
		{#each xEdges.slice(1) as b, k (k)}
			{@render dimLabel('x', k, b - xEdges[k], [(xEdges[k] + b) / 2, box.innerL / 2 + DIM_OFFSET, box.topZ + DIM_Z])}
		{/each}
	{/if}
	{#if dimYGeo}
		<T.LineSegments geometry={dimYGeo} material={dimMaterial} />
		{#each yEdges.slice(1) as b, k (k)}
			{@render dimLabel('y', k, b - yEdges[k], [box.innerW / 2 + DIM_OFFSET, (yEdges[k] + b) / 2, box.topZ + DIM_Z])}
		{/each}
	{/if}
{/if}
