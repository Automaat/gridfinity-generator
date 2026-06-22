// Lazy OpenCascade Skadis-box path — STEP export only (BRep kernel). Mirrors
// skadis-manifold.ts in replicad; importing it pulls the ~4.6MB WASM, so the
// worker dynamic-imports it on demand, exactly like occt.ts / baseplate-occt.ts.
import { draw, drawCircle, drawRoundedRectangle, makeCompound, setOC, type Solid, type Sketch } from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import type { SkadisParams } from '$lib/stores/params';
import { planSkadis, outerDims, skadisAccessCutBoxes } from './skadis-layout';
import { hexPanelCutters, hexPolygon, type HexPanelCutter } from './hex-lattice';
import {
	SKADIS_HOOK_WIDTH,
	skadisHexPanels,
	skadisHookProfile,
	skadisScrewHoleSpec,
	type SkadisHexPanel
} from './skadis-mounts';

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

// Hex lattice cutters for one panel (mirror skadis-manifold.ts wallHexCutters).
// axis: X = side wall, Y = back/front wall, Z = floor.
function buildHexCutterSolid(hex: [number, number][], cutter: HexPanelCutter): Solid {
	let dw = draw(hex[0]);
	for (let i = 1; i < hex.length; i++) dw = dw.lineTo(hex[i]!);
	const sketch = dw.close();
	if (cutter.axis === 'X') return (sketch.sketchOnPlane('YZ', cutter.x) as Sketch).extrude(cutter.cutDepth).translate(0, cutter.y, cutter.z) as Solid;
	if (cutter.axis === 'Y') return (sketch.sketchOnPlane('XZ', cutter.y) as Sketch).extrude(cutter.cutDepth).translate(cutter.x, 0, cutter.z) as Solid;
	return (sketch.sketchOnPlane('XY', cutter.z) as Sketch).extrude(cutter.cutDepth).translate(cutter.x, cutter.y, 0) as Solid;
}

function wallHexCuttersSolid(panel: SkadisHexPanel): Solid[] {
	const cutterSpecs = hexPanelCutters(panel.axis, panel.faceW, panel.faceH, panel.thickness, panel.cx, panel.cy, panel.cz);
	if (cutterSpecs.length === 0) return [];
	const hex = hexPolygon();
	return cutterSpecs.map((cutter) => buildHexCutterSolid(hex, cutter));
}

// Conventional Skadis hook (mirror skadis-manifold.ts buildHook): a Y-Z profile
// extruded along X (sketched on the YZ plane like the side-wall hex cutters).
function buildHookSolid(x: number, z: number): Solid {
	const profile = skadisHookProfile(z);
	let dw = draw(profile[0]);
	for (let i = 1; i < profile.length; i++) dw = dw.lineTo(profile[i]!);
	return (dw.close().sketchOnPlane('YZ', x - SKADIS_HOOK_WIDTH / 2) as Sketch).extrude(SKADIS_HOOK_WIDTH) as Solid;
}

// A cylinder whose axis runs along world +Y: a circle on the XZ plane at yStart,
// extruded +Y by length, centered on (x, z). Mirror of cylinderAlongY in the manifold path.
function cylinderAlongY(radius: number, yStart: number, length: number, x: number, z: number): Solid {
	return (drawCircle(radius).sketchOnPlane('XZ', yStart) as Sketch).extrude(length).translate(x, 0, z) as Solid;
}

// M5 clearance hole at (x, z): a plain bore through the back wall, flush (mirror
// skadis-manifold.ts buildScrewHole).
function buildScrewHoleSolid(x: number, z: number, t: number): Solid {
	const spec = skadisScrewHoleSpec(x, z, t);
	return cylinderAlongY(spec.radius, spec.yStart, spec.length, spec.x, spec.z);
}

export async function buildOcctSkadis(p: SkadisParams): Promise<Solid> {
	await init();
	const t = p.wallThickness;
	const { outerW, outerD, outerH } = outerDims(p);
	const layout = planSkadis(p);

	let solid = boxSolid(outerW, outerD, outerH, 0, outerD / 2, 0);
	const cavity = boxSolid(p.width, p.depth, p.height + 1, 0, outerD / 2, t);
	solid = solid.cut(cavity) as Solid;

	// Access cuts lower front/side walls and remove isolated front corner posts.
	for (const cut of skadisAccessCutBoxes(p)) {
		solid = solid.cut(boxSolid(cut.width, cut.depth, cut.height, cut.x, cut.y, cut.z)) as Solid;
	}

	// Hex lattice through every wall + the floor; the back wall keeps a solid mount
	// band around the hook rows.
	if (p.lightweightWalls) {
		const cutters = skadisHexPanels(p, layout).flatMap((panel) => wallHexCuttersSolid(panel));
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
