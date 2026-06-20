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
import { planSkadis, outerDims, hexPolygon, hexCells, BOARD_THICKNESS } from './skadis-layout';

// Snap-hook geometry (mm). The horizontal arm slides into a slot; the barb at the
// far end drops behind the board so the box weight locks it; a small top nub adds
// push-past retention against vibration. MUST match skadis-occt.ts.
const HOOK_W = 4.4; // X width — clears the 5mm slot with print tolerance
const ARM_H = 4; // arm height (Z)
const ARM_OVERLAP = 1.2; // arm root welded into the back wall (+Y)
const ARM_REACH = BOARD_THICKNESS + 2.5; // arm reach behind the board front face (-Y)
const BARB_Y = 2; // barb thickness (Y)
const BARB_DROP = 4.5; // barb drop below the arm (Z)
const NUB_Y = 2; // retention nub length (Y)
const NUB_H = 0.8; // retention nub height (Z)

const HEX_CUT_OVERSHOOT = 0.1;
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

// One snap hook at (x, z) on the back wall; back face at Y=0, board into -Y.
function buildHook(x: number, z: number): Manifold {
	const { Manifold } = oc();
	const armLen = ARM_REACH + ARM_OVERLAP;
	const arm = box(HOOK_W, armLen, ARM_H, x, (ARM_OVERLAP - ARM_REACH) / 2, z - ARM_H / 2);
	const barb = box(HOOK_W, BARB_Y, ARM_H + BARB_DROP, x, -(ARM_REACH - BARB_Y / 2), z - ARM_H / 2 - BARB_DROP);
	const nub = box(HOOK_W, NUB_Y, NUB_H, x, -(NUB_Y / 2 + 0.5), z + ARM_H / 2 - 0.05);
	return Manifold.union([arm, barb, nub]);
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

	// Optional access cut: lower the front wall (between the side walls) so the box
	// is easy to reach into.
	if (p.openFront) {
		const frontH = Math.min(outerH - t, Math.max(15, outerH * 0.45));
		const cut = box(p.width, t + 2, outerH, 0, outerD - t / 2, frontH);
		solid = solid.subtract(cut);
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
