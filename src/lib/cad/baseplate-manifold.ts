// Manifold baseplate geometry — the preview + STL path (mirrors manifold-bin.ts
// for bins). A baseplate is a flat plate with a Gridfinity receiving socket cut
// into each 42mm cell; it auto-splits into printer-bed tiles joined by in-plane
// dovetail snap-tabs, in a magnet (corner pockets) or simple (no-hole) style.
//
// Reuses the bin builder's manifold primitives (it owns the engine handle), so
// `setBinManifold` must have run first — the worker does that on init.
import type { Manifold } from 'manifold-3d';
import type { BaseplateParams } from '$lib/stores/params';
import {
	oc, roundedPrism, unitBase, setSegments,
	BASE_PROFILE_HEIGHT, MAGNET_HOLE_DIAMETER, MAGNET_HOLE_DEPTH,
	SCREW_HOLE_DIAMETER, HOLE_DISTANCE_FROM_EDGE
} from './manifold-bin';
import {
	planBaseplate, PITCH, DT_DEPTH, DT_NECK, DT_TIP, DT_ANCHOR, DT_CLEARANCE,
	type BaseplateTile, type Dovetail
} from './baseplate-layout';

const PREVIEW_SEGMENTS = 32;
const EXPORT_SEGMENTS = 64;

// Plate thickness = full socket profile + a floor. Magnet style adds room for a
// 2.4mm magnet pocket plus a skin below the socket (cross-ref reference plates:
// thin ≈4.75, screw-together ≈6.75).
const SOCKET_DEPTH = BASE_PROFILE_HEIGHT; // 4.75
const SIMPLE_FLOOR = 1.25;
const MAGNET_SKIN = 0.8;
const THICKNESS_SIMPLE = SOCKET_DEPTH + SIMPLE_FLOOR; // 6.0
const THICKNESS_MAGNET = SOCKET_DEPTH + MAGNET_HOLE_DEPTH + MAGNET_SKIN; // 7.95

// Gap between spread-out tiles in the single combined STL — must clear the male
// tabs, which protrude DT_DEPTH past the footprint.
const COMBINED_GAP = DT_DEPTH + 6;

// Skeletonized cell: each cell floor is opened through the plate (the canonical
// gridfinity-rebuilt baseplate look — an airy frame, far less filament than a
// solid slab). The opening leaves a rim around the receiving profile; the magnet
// style adds scalloped corner bosses that bulge into the opening to hold magnets.
const SKEL_OPENING = 30; // rounded-square through-cut side (mm)
const SKEL_CORNER_R = 5;
const MAGNET_BOSS_R = MAGNET_HOLE_DIAMETER / 2 + 2; // 5.25mm boss around the pocket
const HOLE_INSET = PITCH / 2 - HOLE_DISTANCE_FROM_EDGE; // 13mm from the cell center

function tileThickness(bp: BaseplateParams): number {
	return bp.style === 'magnet' ? THICKNESS_MAGNET : THICKNESS_SIMPLE;
}

// CrossSection reads a clockwise contour as a hole; normalize to CCW (winding of
// the tab polygon flips with the seam direction).
function ensureCCW(pts: [number, number][]): [number, number][] {
	let area = 0;
	for (let i = 0; i < pts.length; i++) {
		const [x1, y1] = pts[i]!;
		const [x2, y2] = pts[(i + 1) % pts.length]!;
		area += x1 * y2 - x2 * y1;
	}
	return area < 0 ? pts.toReversed() : pts;
}

// One dovetail tab through the full plate thickness. Male = a protruding tail
// rooted in this tile; female = the matching socket (clearance-enlarged) cut
// into the receiving tile. The tab narrows at the seam mouth and widens at the
// tip, so a pressed joint locks.
function dovetailPrism(d: Dovetail, tile: BaseplateTile, thickness: number, female: boolean): Manifold {
	const { Manifold, CrossSection } = oc();
	const c = female ? DT_CLEARANCE : 0;
	const neck = DT_NECK / 2 + c;
	const tip = DT_TIP / 2 + c;
	const depth = DT_DEPTH + c;
	const seam = d.axis === 'x' ? d.x : d.y;
	const along = d.axis === 'x' ? d.y : d.x;
	const tilePerp = d.axis === 'x' ? tile.cx : tile.cy;
	// Global direction from the seam toward the female tile (where the tail goes).
	const dir = female ? Math.sign(tilePerp - seam) : Math.sign(seam - tilePerp);
	const anchor = female ? 0 : DT_ANCHOR; // female mouth sits flush on the seam
	const pNeck = seam - dir * anchor;
	const pTip = seam + dir * depth;
	// Polygon in (perp, along) space, then mapped to (x, y) per seam axis.
	const poly: [number, number][] = [
		[pNeck, along - neck],
		[pNeck, along + neck],
		[pTip, along + tip],
		[pTip, along - tip]
	];
	const ptsXY: [number, number][] = d.axis === 'x' ? poly : poly.map(([p, q]) => [q, p]);
	const cs = new CrossSection(ensureCCW(ptsXY));
	// Female cuts slightly past both faces to avoid coplanar artifacts.
	const h = female ? thickness + 0.2 : thickness;
	return Manifold.extrude(cs, h).translate([0, 0, female ? -0.1 : 0]);
}

// Unique corner positions (magnet/screw sites) across the tile's cells — corners
// are shared by adjacent cells, so dedupe to avoid redundant booleans.
function cellCorners(tile: BaseplateTile): [number, number][] {
	const seen = new Set<string>();
	const out: [number, number][] = [];
	for (const cell of tile.cells) {
		for (const ox of [HOLE_INSET, -HOLE_INSET]) {
			for (const oy of [HOLE_INSET, -HOLE_INSET]) {
				const x = cell.x + ox;
				const y = cell.y + oy;
				const k = `${x.toFixed(2)}:${y.toFixed(2)}`;
				if (seen.has(k)) continue;
				seen.add(k);
				out.push([x, y]);
			}
		}
	}
	return out;
}

// One tile in assembled (drawer) coordinates.
function buildTile(tile: BaseplateTile, bp: BaseplateParams, thickness: number, segments: number): Manifold {
	const { Manifold } = oc();
	// Square-cornered slab so tiles butt together with no seam gap.
	let solid = roundedPrism(tile.w, tile.l, 0, thickness, 0).translate([tile.cx, tile.cy, 0]);

	// Receiving sockets: the bin-foot shape cut into the plate top, flush at top.
	const socketZ = thickness - SOCKET_DEPTH;
	const sockets = tile.cells.map((cell) => unitBase().translate([cell.x, cell.y, socketZ]));
	if (sockets.length > 0) solid = solid.subtract(sockets.length === 1 ? sockets[0]! : Manifold.union(sockets));

	// Skeletonize: open each cell through the floor, leaving a frame around the profile.
	const skel = tile.cells.map((cell) =>
		roundedPrism(SKEL_OPENING, SKEL_OPENING, SKEL_CORNER_R, thickness + 0.4, -0.2).translate([cell.x, cell.y, 0])
	);
	if (skel.length > 0) solid = solid.subtract(skel.length === 1 ? skel[0]! : Manifold.union(skel));

	if (bp.style === 'magnet') {
		const corners = cellCorners(tile);
		// Scalloped corner bosses (restore floor under the magnet, bulge into the opening).
		const bossH = thickness - SOCKET_DEPTH + 0.6;
		const bosses = corners.map(([x, y]) =>
			Manifold.cylinder(bossH, MAGNET_BOSS_R, MAGNET_BOSS_R, segments).translate([x, y, 0])
		);
		if (bosses.length > 0) solid = solid.add(Manifold.union(bosses));
		// Magnet pockets (+ optional M3 through-holes) drilled into the bosses from below.
		const cutters = corners.map(([x, y]) => {
			const parts: Manifold[] = [Manifold.cylinder(MAGNET_HOLE_DEPTH, MAGNET_HOLE_DIAMETER / 2, MAGNET_HOLE_DIAMETER / 2, segments)];
			if (bp.screwHoles) {
				parts.push(Manifold.cylinder(thickness + 0.2, SCREW_HOLE_DIAMETER / 2, SCREW_HOLE_DIAMETER / 2, segments).translate([0, 0, -0.1]));
			}
			return (parts.length === 1 ? parts[0]! : Manifold.union(parts)).translate([x, y, 0]);
		});
		if (cutters.length > 0) solid = solid.subtract(Manifold.union(cutters));
	}

	// Dovetails last so the male tabs stay solid through the full thickness.
	if (tile.males.length > 0) {
		const tabs = tile.males.map((d) => dovetailPrism(d, tile, thickness, false));
		solid = solid.add(tabs.length === 1 ? tabs[0]! : Manifold.union(tabs));
	}
	if (tile.females.length > 0) {
		const pockets = tile.females.map((d) => dovetailPrism(d, tile, thickness, true));
		solid = solid.subtract(pockets.length === 1 ? pockets[0]! : Manifold.union(pockets));
	}
	return solid;
}

export interface BuildOpts {
	segments?: number;
}

// Assembled plate (all tiles in place) — the live preview.
export function buildBaseplateAssembled(bp: BaseplateParams, { segments = PREVIEW_SEGMENTS }: BuildOpts = {}): Manifold {
	setSegments(segments);
	const layout = planBaseplate(bp);
	const t = tileThickness(bp);
	const tiles = layout.tiles.map((tile) => buildTile(tile, bp, t, segments));
	return tiles.length === 1 ? tiles[0]! : oc().Manifold.union(tiles);
}

export interface NamedSolid {
	name: string;
	solid: Manifold;
}

// Each tile localized to its own origin — for per-file (ZIP) STL export.
export function buildBaseplateTiles(bp: BaseplateParams, { segments = EXPORT_SEGMENTS }: BuildOpts = {}): NamedSolid[] {
	setSegments(segments);
	const layout = planBaseplate(bp);
	const t = tileThickness(bp);
	return layout.tiles.map((tile) => ({
		name: `tile_r${tile.row + 1}c${tile.col + 1}.stl`,
		solid: buildTile(tile, bp, t, segments).translate([-tile.cx, -tile.cy, 0])
	}));
}

// All tiles spread apart on one plate — for the single combined STL.
export function buildBaseplateCombined(bp: BaseplateParams, { segments = EXPORT_SEGMENTS }: BuildOpts = {}): Manifold {
	setSegments(segments);
	const layout = planBaseplate(bp);
	const t = tileThickness(bp);
	const colW: number[] = [];
	const rowL: number[] = [];
	for (const tile of layout.tiles) {
		colW[tile.col] = Math.max(colW[tile.col] ?? 0, tile.w);
		rowL[tile.row] = Math.max(rowL[tile.row] ?? 0, tile.l);
	}
	const colX: number[] = [];
	const rowY: number[] = [];
	let cx = 0;
	for (let c = 0; c < colW.length; c++) {
		colX[c] = cx;
		cx += (colW[c] ?? 0) + COMBINED_GAP;
	}
	let cy = 0;
	for (let r = 0; r < rowL.length; r++) {
		rowY[r] = cy;
		cy += (rowL[r] ?? 0) + COMBINED_GAP;
	}
	const placed = layout.tiles.map((tile) => {
		const local = buildTile(tile, bp, t, segments).translate([-tile.cx, -tile.cy, 0]);
		return local.translate([colX[tile.col]! + tile.w / 2, rowY[tile.row]! + tile.l / 2, 0]);
	});
	return placed.length === 1 ? placed[0]! : oc().Manifold.union(placed);
}
