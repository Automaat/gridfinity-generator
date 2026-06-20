// Lazy OpenCascade Skadis-box path — STEP export only (BRep kernel). Mirrors
// skadis-manifold.ts in replicad; importing it pulls the ~4.6MB WASM, so the
// worker dynamic-imports it on demand, exactly like occt.ts / baseplate-occt.ts.
import { draw, drawCircle, drawRoundedRectangle, makeCompound, setOC, type Solid, type Sketch } from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import type { SkadisParams } from '$lib/stores/params';
import { planSkadis, outerDims, frontWallCutZ, sideWallCutZ, BOARD_THICKNESS } from './skadis-layout';
import { hexPolygon, hexCells, HEX_CUT_OVERSHOOT } from './hex-lattice';

// Conventional Skadis hook geometry (mm) — MUST match skadis-manifold.ts (see the
// mechanism note there). Arm through the slot + lip down behind the board; print with
// supports.
const HOOK_W = 4.4;
const ARM_OVERLAP = 1.2;
const ARM_TOP = 2;
const ARM_THICK = 3;
const CATCH_FRONT_Y = BOARD_THICKNESS + 0.4;
const LIP_THICK = 2;
const LIP_DROP = 8;

// M5 screw-mount geometry (mm) — MUST match skadis-manifold.ts. Plain flush hole.
const SCREW_CLEAR_R = 2.75;

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

// Conventional Skadis hook (mirror skadis-manifold.ts buildHook): a Y-Z profile
// extruded HOOK_W along X (sketched on the YZ plane like the side-wall hex cutters).
function buildHookSolid(x: number, z: number): Solid {
	const top = z + ARM_TOP;
	const armBottom = top - ARM_THICK;
	const armReach = CATCH_FRONT_Y + LIP_THICK;
	const profile: [number, number][] = [
		[ARM_OVERLAP, top],
		[-armReach, top],
		[-armReach, z - LIP_DROP],
		[-CATCH_FRONT_Y, z - LIP_DROP],
		[-CATCH_FRONT_Y, armBottom],
		[ARM_OVERLAP, armBottom]
	];
	let dw = draw(profile[0]);
	for (let i = 1; i < profile.length; i++) dw = dw.lineTo(profile[i]!);
	return (dw.close().sketchOnPlane('YZ', x - HOOK_W / 2) as Sketch).extrude(HOOK_W) as Solid;
}

// A cylinder whose axis runs along world +Y: a circle on the XZ plane at yStart,
// extruded +Y by length, centered on (x, z). Mirror of cylinderAlongY in the manifold path.
function cylinderAlongY(radius: number, yStart: number, length: number, x: number, z: number): Solid {
	return (drawCircle(radius).sketchOnPlane('XZ', yStart) as Sketch).extrude(length).translate(x, 0, z) as Solid;
}

// M5 clearance hole at (x, z): a plain bore through the back wall, flush (mirror
// skadis-manifold.ts buildScrewHole).
function buildScrewHoleSolid(x: number, z: number, t: number): Solid {
	return cylinderAlongY(SCREW_CLEAR_R, -1, t + 2, x, z);
}

export async function buildOcctSkadis(p: SkadisParams): Promise<Solid> {
	await init();
	const t = p.wallThickness;
	const { outerW, outerD, outerH } = outerDims(p);
	const layout = planSkadis(p);

	let solid = boxSolid(outerW, outerD, outerH, 0, outerD / 2, 0);
	const cavity = boxSolid(p.width, p.depth, p.height + 1, 0, outerD / 2, t);
	solid = solid.cut(cavity) as Solid;

	// Access cuts (mirror skadis-manifold.ts): front cut spans interior width, side cuts
	// span interior depth, so a closed neighbour keeps its shared corner full height.
	const frontH = p.openFront ? frontWallCutZ(p) : outerH;
	const sideZ = p.openSides ? sideWallCutZ(p) : outerH;
	if (p.openFront) {
		const cut = boxSolid(p.width, t + 2, outerH, 0, outerD - t / 2, frontH);
		solid = solid.cut(cut) as Solid;
	}
	if (p.openSides) {
		const cutL = boxSolid(t + 2, p.depth, outerH, -outerW / 2 + t / 2, outerD / 2, sideZ);
		const cutR = boxSolid(t + 2, p.depth, outerH, outerW / 2 - t / 2, outerD / 2, sideZ);
		solid = (solid.cut(cutL) as Solid).cut(cutR) as Solid;
	}
	// Drop the two front corner posts when both adjacent walls are open so they don't
	// stand alone as poles; the back corners belong to the full-height back wall.
	if (p.openFront && p.openSides) {
		const cornerZ = Math.max(frontH, sideZ);
		const cornerL = boxSolid(t + 2, t + 2, outerH, -outerW / 2 + t / 2, outerD - t / 2, cornerZ);
		const cornerR = boxSolid(t + 2, t + 2, outerH, outerW / 2 - t / 2, outerD - t / 2, cornerZ);
		solid = (solid.cut(cornerL) as Solid).cut(cornerR) as Solid;
	}

	// Hex lattice through every wall + the floor; the back wall keeps a solid mount
	// band around the hook rows.
	if (p.lightweightWalls) {
		const frontFaceH = frontH - t, sideFaceH = sideZ - t; // exposed wall heights (== outerH-t when closed)
		const lowestHookZ = layout.hooks.length > 0 ? Math.min(...layout.hooks.map((h) => h.z)) : outerH;
		const backFaceH = lowestHookZ - MOUNT_BAND - t;
		const cutters = [
			...wallHexCuttersSolid('X', p.depth, sideFaceH, t, -outerW / 2 + t / 2, outerD / 2, t + sideFaceH / 2),
			...wallHexCuttersSolid('X', p.depth, sideFaceH, t, outerW / 2 - t / 2, outerD / 2, t + sideFaceH / 2),
			...wallHexCuttersSolid('Y', p.width, frontFaceH, t, 0, outerD - t / 2, t + frontFaceH / 2),
			...wallHexCuttersSolid('Y', p.width, backFaceH, t, 0, t / 2, t + backFaceH / 2),
			...wallHexCuttersSolid('Z', p.width, p.depth, t, 0, outerD / 2, t / 2)
		];
		if (cutters.length > 0) solid = solid.cut(makeCompound(cutters) as Solid) as Solid;
	}

	// Mounts: hooks weld onto the solid band; screws bore a plain flush clearance hole.
	if (p.mountType === 'screw') {
		const holes = layout.hooks.map(({ x, z }) => buildScrewHoleSolid(x, z, t));
		if (holes.length > 0) solid = solid.cut(makeCompound(holes) as Solid) as Solid;
	} else {
		const hooks = layout.hooks.map(({ x, z }) => buildHookSolid(x, z));
		if (hooks.length > 0) solid = solid.fuse(makeCompound(hooks) as Solid) as Solid;
	}

	return solid;
}
