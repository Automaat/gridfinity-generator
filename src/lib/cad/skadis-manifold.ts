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

// Snap-hook geometry (mm). A conventional Skadis hook: a horizontal arm passes through
// the slot and a lip drops down behind the board, so the inside corner captures the
// board (box back wall holds the front face, the lip's front face holds the back face).
// Install = slide the arms into the slots, then lower the box so the lips drop behind
// the bridges below them. The arm underside + lip bottom are overhangs — print with
// supports. MUST match skadis-occt.ts.
const HOOK_W = 4.4; // X width — clears the 5mm slot with print tolerance
const ARM_OVERLAP = 1.2; // root welded into the back wall (+Y)
const ARM_TOP = 2; // arm top rises this far above the row center z (Z)
const ARM_THICK = 3; // arm thickness (Z)
const CATCH_FRONT_Y = BOARD_THICKNESS + 0.4; // lip front (catch) face: 0.4mm behind the board back (-Y), |value|
const LIP_THICK = 2; // lip thickness (Y); arm reaches CATCH_FRONT_Y + LIP_THICK behind the board front
const LIP_DROP = 8; // lip bottom drops this far below the row center (Z)

// Solid back-wall band kept around the hook/screw rows so the Skadis mount stays
// strong; measured downward from the lowest mount center.
const MOUNT_BAND = 12;

// M5 screw-mount geometry (mm) — the alternative to snap hooks. A plain clearance hole
// straight through the back wall, FLUSH with the wall (no boss, no counterbore — a thin
// wall has no meat to recess a head into). The shaft exits through a slot; a washer + nut
// clamp behind the board. MUST match skadis-occt.ts.
const SCREW_CLEAR_R = 2.75; // M5 clearance hole (Ø5.5)
const SCREW_SEG = 48; // circle tessellation for screw cylinders

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

// Y-Z profile of one drop-catch hook centered on row z; back wall outer face at Y=0,
// board into -Y. Shared by both geometry paths (kept here, mirrored in skadis-occt.ts).
function hookProfile(z: number): [number, number][] {
	const top = z + ARM_TOP;
	const armBottom = top - ARM_THICK;
	const armReach = CATCH_FRONT_Y + LIP_THICK; // tip behind the board
	return [
		[ARM_OVERLAP, top], // root top (welds into the back wall, +Y)
		[-armReach, top], // arm tip top
		[-armReach, z - LIP_DROP], // down the back face of the lip
		[-CATCH_FRONT_Y, z - LIP_DROP], // lip bottom (overhang)
		[-CATCH_FRONT_Y, armBottom], // up the lip front (catch) face — captures the board back
		[ARM_OVERLAP, armBottom] // arm underside back to the wall (overhang)
	];
}

// One self-supporting drop-catch hook at (x, z); the profile is extruded HOOK_W along X.
function buildHook(x: number, z: number): Manifold {
	return prismAlongX(hookProfile(z), HOOK_W).translate([x - HOOK_W / 2, 0, 0]);
}

// A cylinder whose axis runs along world +Y, base at Y=0, centered on X/Z at the origin.
function cylinderAlongY(radius: number, length: number): Manifold {
	return oc().Manifold.cylinder(length, radius, radius, SCREW_SEG).rotate([-90, 0, 0]);
}

// M5 clearance hole at (x, z): a plain bore straight through the back wall (Y∈[0, t]),
// overshooting both faces so the boolean is clean. No boss/counterbore — flush wall.
function buildScrewHole(x: number, z: number, t: number): Manifold {
	return cylinderAlongY(SCREW_CLEAR_R, t + 2).translate([x, -1, z]);
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
	// hooks are added so they always weld onto the solid band. Front/side panels
	// are sized to the EXPOSED wall height (after any openFront/openSides lowering) and
	// centered within it, so the lattice keeps a solid band at the top edge: a clean
	// straight finish, never a hex sliced by the lowered rim.
	if (p.lightweightWalls) {
		const frontFaceH = frontH - t, sideFaceH = sideZ - t; // exposed wall heights (== outerH-t when closed)
		const lowestHookZ = layout.hooks.length > 0 ? Math.min(...layout.hooks.map((h) => h.z)) : outerH;
		const backFaceH = lowestHookZ - MOUNT_BAND - t; // floor up to just below the lowest hook
		const panels = [
			wallHexCutters('X', p.depth, sideFaceH, t, -outerW / 2 + t / 2, outerD / 2, t + sideFaceH / 2), // left
			wallHexCutters('X', p.depth, sideFaceH, t, outerW / 2 - t / 2, outerD / 2, t + sideFaceH / 2), // right
			wallHexCutters('Y', p.width, frontFaceH, t, 0, outerD - t / 2, t + frontFaceH / 2), // front
			wallHexCutters('Y', p.width, backFaceH, t, 0, t / 2, t + backFaceH / 2), // back (below the mount band)
			wallHexCutters('Z', p.width, p.depth, t, 0, outerD / 2, t / 2) // floor
		];
		for (const cutters of panels) if (cutters) solid = solid.subtract(cutters);
	}

	// Mounts land on the solid back-wall band (added/cut after the hex above). Hooks
	// weld on; screws bore a plain flush clearance hole through the wall.
	if (p.mountType === 'screw') {
		const holes = layout.hooks.map(({ x, z }) => buildScrewHole(x, z, t));
		if (holes.length > 0) solid = solid.subtract(holes.length === 1 ? holes[0]! : Manifold.union(holes));
	} else {
		const hooks = layout.hooks.map(({ x, z }) => buildHook(x, z));
		if (hooks.length > 0) solid = solid.add(hooks.length === 1 ? hooks[0]! : Manifold.union(hooks));
	}

	return solid;
}
