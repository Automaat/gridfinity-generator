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
import { planSkadis, outerDims, skadisAccessCutBoxes } from './skadis-layout';
import { hexPanelCutters, hexPolygon, type HexPanelCutter } from './hex-lattice';
import {
	SKADIS_HOOK_WIDTH,
	SKADIS_SCREW_SEGMENTS,
	skadisHexPanels,
	skadisHookProfile,
	skadisScrewHoleSpec,
	type SkadisHexPanel
} from './skadis-mounts';

// Hex lattice cut through one panel. `axis` is the panel's thickness direction
// (X = side wall, Y = back/front wall, Z = floor); (cx, cy, cz) is the panel center
// in world space; faceW/faceH are its in-plane extents (faceH is the cell `v` axis:
// Z for walls, Y for the floor). Returns null when the panel is too small for a hex.
function buildHexCutter(hex: [number, number][], cutter: HexPanelCutter): Manifold {
	if (cutter.axis === 'X') return prismAlongX(hex, cutter.cutDepth).translate([cutter.x, cutter.y, cutter.z]);
	if (cutter.axis === 'Y') return prismAlongY(hex, cutter.cutDepth).translate([cutter.x, cutter.y, cutter.z]);
	return oc().Manifold.extrude(new (oc().CrossSection)(hex), cutter.cutDepth).translate([cutter.x, cutter.y, cutter.z]);
}

function wallHexCutters(panel: SkadisHexPanel): Manifold | null {
	const cutterSpecs = hexPanelCutters(panel.axis, panel.faceW, panel.faceH, panel.thickness, panel.cx, panel.cy, panel.cz);
	if (cutterSpecs.length === 0) return null;
	const hex = hexPolygon();
	const cutters = cutterSpecs.map((cutter) => buildHexCutter(hex, cutter));
	return oc().Manifold.union(cutters);
}

// One conventional hook at (x, z); the profile is extruded along X. Its arm
// underside + lip bottom are overhangs — prints with supports.
function buildHook(x: number, z: number): Manifold {
	return prismAlongX(skadisHookProfile(z), SKADIS_HOOK_WIDTH).translate([x - SKADIS_HOOK_WIDTH / 2, 0, 0]);
}

// A cylinder whose axis runs along world +Y, base at Y=0, centered on X/Z at the origin.
function cylinderAlongY(radius: number, length: number): Manifold {
	return oc().Manifold.cylinder(length, radius, radius, SKADIS_SCREW_SEGMENTS).rotate([-90, 0, 0]);
}

// M5 clearance hole at (x, z): a plain bore straight through the back wall (Y∈[0, t]),
// overshooting both faces so the boolean is clean. No boss/counterbore — flush wall.
function buildScrewHole(x: number, z: number, t: number): Manifold {
	const spec = skadisScrewHoleSpec(x, z, t);
	return cylinderAlongY(spec.radius, spec.length).translate([spec.x, spec.yStart, spec.z]);
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

	// Optional access cuts lower front/side walls and remove isolated front corner posts.
	for (const cut of skadisAccessCutBoxes(p)) {
		solid = solid.subtract(box(cut.width, cut.depth, cut.height, cut.x, cut.y, cut.z));
	}

	// Optional hex lattice through every wall + the floor. The back wall is hexed only
	// below the hook rows — a solid mount band stays around the hooks. Done before the
	// hooks are added so they always weld onto the solid band. Front/side panels
	// are sized to the EXPOSED wall height (after any openFront/openSides lowering) and
	// centered within it, so the lattice keeps a solid band at the top edge: a clean
	// straight finish, never a hex sliced by the lowered rim.
	if (p.lightweightWalls) {
		const panels = skadisHexPanels(p, layout).map((panel) => wallHexCutters(panel));
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
