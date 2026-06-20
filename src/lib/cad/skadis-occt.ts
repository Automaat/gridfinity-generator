// Lazy OpenCascade Skadis-box path — STEP export only (BRep kernel). Mirrors
// skadis-manifold.ts in replicad; importing it pulls the ~4.6MB WASM, so the
// worker dynamic-imports it on demand, exactly like occt.ts / baseplate-occt.ts.
import { draw, drawRoundedRectangle, makeCompound, setOC, type Solid, type Sketch } from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import type { SkadisParams } from '$lib/stores/params';
import { planSkadis, outerDims, hexPolygon, hexCells, BOARD_THICKNESS } from './skadis-layout';

// Snap-hook geometry (mm) — MUST match skadis-manifold.ts.
const HOOK_W = 4.4;
const ARM_H = 4;
const ARM_OVERLAP = 1.2;
const ARM_REACH = BOARD_THICKNESS + 2.5;
const BARB_Y = 2;
const BARB_DROP = 4.5;
const NUB_Y = 2;
const NUB_H = 0.8;

let ready: Promise<void> | null = null;
function init(): Promise<void> {
	if (!ready) {
		ready = (async () => {
			const OC = await opencascade({ locateFile: () => opencascadeWasm });
			setOC(OC as Parameters<typeof setOC>[0]);
		})();
	}
	return ready;
}

// Axis-aligned box centered in X/Y at (cx, cy), bottom resting at zBase — matches
// the manifold `box()` helper's semantics.
function boxSolid(w: number, l: number, h: number, cx: number, cy: number, zBase: number): Solid {
	return (drawRoundedRectangle(w, l, 0).sketchOnPlane('XY', zBase) as Sketch).extrude(h).translate(cx, cy, 0) as Solid;
}

const HEX_CUT_OVERSHOOT = 0.1;
const MOUNT_BAND = 12;

// Hex lattice cutters for one panel (mirror skadis-manifold.ts wallHexCutters).
// axis: X = side wall, Y = back/front wall, Z = floor.
function wallHexCuttersSolid(axis: 'X' | 'Y' | 'Z', faceW: number, faceH: number, thickness: number, cx: number, cy: number, cz: number): Solid[] {
	const cells = hexCells(faceW, faceH);
	if (cells.length === 0) return [];
	const hex = hexPolygon();
	const cutDepth = thickness + 2 * HEX_CUT_OVERSHOOT;
	return cells.map(({ u, v }) => {
		let dw = draw(hex[0]);
		for (let i = 1; i < hex.length; i++) dw = dw.lineTo(hex[i]!);
		const sketch = dw.close();
		if (axis === 'X') return (sketch.sketchOnPlane('YZ', cx - cutDepth / 2) as Sketch).extrude(cutDepth).translate(0, cy + u, cz + v) as Solid;
		if (axis === 'Y') return (sketch.sketchOnPlane('XZ', cy - cutDepth / 2) as Sketch).extrude(cutDepth).translate(cx + u, 0, cz + v) as Solid;
		return (sketch.sketchOnPlane('XY', cz - cutDepth / 2) as Sketch).extrude(cutDepth).translate(cx + u, cy + v, 0) as Solid;
	});
}

function buildHookSolid(x: number, z: number): Solid {
	const armLen = ARM_REACH + ARM_OVERLAP;
	const arm = boxSolid(HOOK_W, armLen, ARM_H, x, (ARM_OVERLAP - ARM_REACH) / 2, z - ARM_H / 2);
	const barb = boxSolid(HOOK_W, BARB_Y, ARM_H + BARB_DROP, x, -(ARM_REACH - BARB_Y / 2), z - ARM_H / 2 - BARB_DROP);
	const nub = boxSolid(HOOK_W, NUB_Y, NUB_H, x, -(NUB_Y / 2 + 0.5), z + ARM_H / 2 - 0.05);
	return arm.fuse(barb).fuse(nub) as Solid;
}

export async function buildOcctSkadis(p: SkadisParams): Promise<Solid> {
	await init();
	const t = p.wallThickness;
	const { outerW, outerD, outerH } = outerDims(p);
	const layout = planSkadis(p);

	let solid = boxSolid(outerW, outerD, outerH, 0, outerD / 2, 0);
	const cavity = boxSolid(p.width, p.depth, p.height + 1, 0, outerD / 2, t);
	solid = solid.cut(cavity) as Solid;

	if (p.openFront) {
		const frontH = Math.min(outerH - t, Math.max(15, outerH * 0.45));
		const cut = boxSolid(p.width, t + 2, outerH, 0, outerD - t / 2, frontH);
		solid = solid.cut(cut) as Solid;
	}

	// Hex lattice through every wall + the floor; the back wall keeps a solid mount
	// band around the hook rows.
	if (p.lightweightWalls) {
		const wallCz = t + p.height / 2;
		const lowestHookZ = layout.hooks.length > 0 ? Math.min(...layout.hooks.map((h) => h.z)) : outerH;
		const backFaceH = lowestHookZ - MOUNT_BAND - t;
		const cutters = [
			...wallHexCuttersSolid('X', p.depth, p.height, t, -outerW / 2 + t / 2, outerD / 2, wallCz),
			...wallHexCuttersSolid('X', p.depth, p.height, t, outerW / 2 - t / 2, outerD / 2, wallCz),
			...wallHexCuttersSolid('Y', p.width, p.height, t, 0, outerD - t / 2, wallCz),
			...wallHexCuttersSolid('Y', p.width, backFaceH, t, 0, t / 2, t + backFaceH / 2),
			...wallHexCuttersSolid('Z', p.width, p.depth, t, 0, outerD / 2, t / 2)
		];
		if (cutters.length > 0) solid = solid.cut(makeCompound(cutters) as Solid) as Solid;
	}

	const hooks = layout.hooks.map(({ x, z }) => buildHookSolid(x, z));
	if (hooks.length > 0) solid = solid.fuse(makeCompound(hooks) as Solid) as Solid;

	return solid;
}
