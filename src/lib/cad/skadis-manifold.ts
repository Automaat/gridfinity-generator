// Manifold Skadis-box geometry — the preview + STL path (mirrors manifold-bin.ts
// for bins). A plain hollow box with snap-in hooks on the back that engage an
// IKEA Skadis pegboard. Reuses the bin builder's manifold primitives (it owns the
// engine handle), so `setBinManifold` must have run first — the worker does that
// on init.
//
// Coordinate frame (matches the bin/baseplate builders' Z-up CAD space): the box
// is centered on X, its back face sits at Y=0 (flush against the board), the body
// extends to +Y, and the hooks protrude into -Y through the board's slots. The
// box bottom rests at Z=0. Box dimensions are INTERIOR; walls + floor are added on
// top via outerDims().
import type { Manifold } from 'manifold-3d';
import type { SkadisParams } from '$lib/stores/params';
import { oc, box, prismAlongX, prismAlongY } from './manifold-bin';
import { planSkadis, outerDims, frontWallCutZ, sideWallCutZ, BOARD_THICKNESS } from './skadis-layout';
import { hexPolygon, hexCells, HEX_CUT_OVERSHOOT } from './hex-lattice';

// Snap-hook geometry (mm). The hook is a wedge: a flat top slides over the slot
// bridge, the tip reaches behind the board, and the underside is a single 45° ramp
// down to the back wall — so it prints support-free with the box floor down. A small
// nub on top, just behind the board, gives push-past retention. MUST match skadis-occt.ts.
const HOOK_W = 4.4; // X width — clears the 5mm slot with print tolerance
const HOOK_TOP = 2; // hook top rises this far above the row center z (Z)
const ARM_OVERLAP = 1.2; // root welded into the back wall (+Y)
const ARM_REACH = BOARD_THICKNESS + 2.5; // tip reach behind the board front face (-Y)
const TIP_THICK = 1.4; // hook thickness (Z) at the tip; the 45° underside ramps up from the wall to here
const NUB_Y = 2; // retention nub length (Y)
const NUB_H = 0.9; // retention nub height above the hook top (Z)
const NUB_Y_CENTER = -(BOARD_THICKNESS + 1); // nub sits just behind the board back face

// Solid back-wall band kept around the hook rows so the Skadis mount stays strong;
// measured downward from the lowest hook center.
const MOUNT_BAND = 12;

// Hex lattice cut through one panel. `axis` is the panel's thickness direction
// (X = side wall, Y = back/front wall, Z = floor); (cx, cy, cz) is the panel center
// in world space; faceW/faceH are its in-plane extents (faceH is the cell `v` axis:
// Z for walls, Y for the floor). Returns null when the panel is too small for a hex.
function wallHexCutters(axis: 'X' | 'Y' | 'Z', faceW: number, faceH: number, thickness: number, cx: number, cy: number, cz: number): Manifold | null {
	const cells = hexCells(faceW, faceH);
	if (cells.length === 0) return null;
	const hex = hexPolygon();
	const cutDepth = thickness + 2 * HEX_CUT_OVERSHOOT;
	const cutters = cells.map(({ u, v }) => {
		if (axis === 'X') return prismAlongX(hex, cutDepth).translate([cx - cutDepth / 2, cy + u, cz + v]);
		if (axis === 'Y') return prismAlongY(hex, cutDepth).translate([cx + u, cy - cutDepth / 2, cz + v]);
		// Z: hex lies in the X-Y plane, extruded down through the floor (v maps to Y).
		return oc().Manifold.extrude(new (oc().CrossSection)(hex), cutDepth).translate([cx + u, cy + v, cz - cutDepth / 2]);
	});
	return oc().Manifold.union(cutters);
}

// One self-supporting snap hook at (x, z) on the back wall; back face at Y=0, board
// into -Y. The wedge profile lives in the Y-Z plane and is extruded HOOK_W along X;
// its underside is a single 45° ramp (tip thin, root deep) so nothing overhangs.
function buildHook(x: number, z: number): Manifold {
	const { Manifold } = oc();
	const top = z + HOOK_TOP;
	const tipBottom = top - TIP_THICK;
	const rootBottom = tipBottom - (ARM_REACH + ARM_OVERLAP); // 45° underside back to the wall
	const profile: [number, number][] = [
		[ARM_OVERLAP, top], // wall top (root welds into the back wall, +Y)
		[-ARM_REACH, top], // tip top (flat top that rides over the slot bridge)
		[-ARM_REACH, tipBottom], // tip face (vertical)
		[ARM_OVERLAP, rootBottom] // 45° underside down to the wall — self-supporting
	];
	const wedge = prismAlongX(profile, HOOK_W).translate([x - HOOK_W / 2, 0, 0]);
	const nub = box(HOOK_W, NUB_Y, NUB_H, x, NUB_Y_CENTER, top - 0.05);
	return Manifold.union([wedge, nub]);
}

export function buildSkadisManifold(p: SkadisParams): Manifold {
	const { Manifold } = oc();
	const t = p.wallThickness;
	const { outerW, outerD, outerH } = outerDims(p);
	const layout = planSkadis(p);

	// Hollow box: the cavity is exactly the interior (width × depth × height) cut
	// from the outer shell, overshooting the rim so the top stays open.
	const shell = box(outerW, outerD, outerH, 0, outerD / 2, 0);
	const cavity = box(p.width, p.depth, p.height + 1, 0, outerD / 2, t);
	let solid = shell.subtract(cavity);

	// Optional access cuts. The front cut spans only the interior width and each side
	// cut only the interior depth, so a closed neighbour keeps its shared corner full
	// height. Cut height ≥ outerH is a no-op (the cutter clears the rim).
	const frontH = p.openFront ? frontWallCutZ(p) : outerH;
	const sideZ = p.openSides ? sideWallCutZ(p) : outerH;
	if (p.openFront) {
		const cut = box(p.width, t + 2, outerH, 0, outerD - t / 2, frontH);
		solid = solid.subtract(cut);
	}
	if (p.openSides) {
		const cutL = box(t + 2, p.depth, outerH, -outerW / 2 + t / 2, outerD / 2, sideZ);
		const cutR = box(t + 2, p.depth, outerH, outerW / 2 - t / 2, outerD / 2, sideZ);
		solid = solid.subtract(cutL).subtract(cutR);
	}
	// With both front and sides open the two FRONT corner posts are bounded only by
	// lowered walls, so they'd stand alone — drop them to the taller neighbour so they
	// blend in instead of becoming poles. The back corners belong to the full-height
	// back wall, so they're left intact.
	if (p.openFront && p.openSides) {
		const cornerZ = Math.max(frontH, sideZ);
		const cornerL = box(t + 2, t + 2, outerH, -outerW / 2 + t / 2, outerD - t / 2, cornerZ);
		const cornerR = box(t + 2, t + 2, outerH, outerW / 2 - t / 2, outerD - t / 2, cornerZ);
		solid = solid.subtract(cornerL).subtract(cornerR);
	}

	// Optional hex lattice through every wall + the floor. The back wall is hexed only
	// below the hook rows — a solid mount band stays around the hooks. Done before the
	// hooks are added so they always weld onto the solid band.
	if (p.lightweightWalls) {
		const wallCz = t + p.height / 2; // wall panel vertical center (interior height)
		const lowestHookZ = layout.hooks.length > 0 ? Math.min(...layout.hooks.map((h) => h.z)) : outerH;
		const backFaceH = lowestHookZ - MOUNT_BAND - t; // floor up to just below the lowest hook
		const panels = [
			wallHexCutters('X', p.depth, p.height, t, -outerW / 2 + t / 2, outerD / 2, wallCz), // left
			wallHexCutters('X', p.depth, p.height, t, outerW / 2 - t / 2, outerD / 2, wallCz), // right
			wallHexCutters('Y', p.width, p.height, t, 0, outerD - t / 2, wallCz), // front
			wallHexCutters('Y', p.width, backFaceH, t, 0, t / 2, t + backFaceH / 2), // back (below the mount band)
			wallHexCutters('Z', p.width, p.depth, t, 0, outerD / 2, t / 2) // floor
		];
		for (const cutters of panels) if (cutters) solid = solid.subtract(cutters);
	}

	const hooks = layout.hooks.map(({ x, z }) => buildHook(x, z));
	if (hooks.length > 0) solid = solid.add(hooks.length === 1 ? hooks[0]! : Manifold.union(hooks));

	return solid;
}
