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
	oc, roundedPrism, box, unitBase, setSegments,
	BASE_PROFILE_HEIGHT, MAGNET_HOLE_DIAMETER, MAGNET_HOLE_DEPTH,
	SCREW_HOLE_DIAMETER, HOLE_DISTANCE_FROM_EDGE
} from './manifold-bin';
import { planBaseplate, PITCH, seamCellCenters, type BaseplateTile, type Seam } from './baseplate-layout';

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

// In-plane dovetail snap-tab (jigsaw style): a trapezoid through the full plate
// thickness, narrow at the seam mouth and wider at the tip so a pressed joint
// locks. Kept small/subtle. One tab per shared cell.
const DT_DEPTH = 4; // mm the tail reaches past the seam
const DT_NECK = 5; // mm tab width at the seam mouth
const DT_TIP = 8; // mm tab width at the tip (must exceed neck to lock)
const DT_ANCHOR = 1.5; // mm the tab roots back into its own tile body
const DT_CLEARANCE = 0.15; // mm added to the female pocket per side

// Side-pin connectors: a solid wall along each seam edge with one horizontal hole
// per shared cell. `screw` = M3 bolt clearance; `filament` = a 1.75mm filament
// scrap pushed through both tiles as a dowel pin (no hardware). Holes sit at
// mid-height, below the receiving profile, so the grid surface is untouched.
const SCREW_WALL = 6; // mm rail reaches into the tile body
const SCREW_R = 1.7; // M3 clearance radius
const FIL_WALL = 4;
const FIL_R = 0.9; // 1.8mm — snug on 1.75mm filament

function pinParams(connector: BaseplateParams['connector']): { wall: number; r: number } {
	return connector === 'screw' ? { wall: SCREW_WALL, r: SCREW_R } : { wall: FIL_WALL, r: FIL_R };
}

// Gap between spread-out tiles in the single combined STL — must clear the male
// tabs / rails, which protrude past the footprint.
const COMBINED_GAP = SCREW_WALL + 8;

// Skeletonized cell: each cell floor is opened through the plate (the canonical
// gridfinity-rebuilt baseplate look — an airy frame, far less filament than a
// solid slab). The opening leaves a rim around the receiving profile; the magnet
// style adds scalloped corner bosses that bulge into the opening to hold magnets.
const SKEL_OPENING = 33; // rounded-square through-cut side (mm)
const SKEL_CORNER_R = 7;
const MAGNET_BOSS_R = MAGNET_HOLE_DIAMETER / 2 + 2; // 5.25mm pad around the pocket
const HOLE_INSET = PITCH / 2 - HOLE_DISTANCE_FROM_EDGE; // 13mm from the cell center
const CORNER_OFFSETS: [number, number][] = [
	[HOLE_INSET, HOLE_INSET],
	[-HOLE_INSET, HOLE_INSET],
	[HOLE_INSET, -HOLE_INSET],
	[-HOLE_INSET, -HOLE_INSET]
];

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

// One dovetail tab at `along` on a seam, through the full plate thickness. Male =
// a protruding tail rooted in this tile; female = the matching pocket (clearance-
// enlarged) cut into the abutting tile. Narrow at the mouth, wider at the tip.
function dovetailTab(seam: Seam, along: number, thickness: number, female: boolean): Manifold {
	const { Manifold, CrossSection } = oc();
	const c = female ? DT_CLEARANCE : 0;
	const neck = DT_NECK / 2 + c;
	const tip = DT_TIP / 2 + c;
	const depth = DT_DEPTH + c;
	// Male tail extends away from the body (-bodyDir); female pocket into it (+bodyDir).
	const dir = female ? seam.bodyDir : -seam.bodyDir;
	const anchor = female ? 0 : DT_ANCHOR; // female mouth sits flush on the seam
	const pNeck = seam.pos - dir * anchor;
	const pTip = seam.pos + dir * depth;
	const poly: [number, number][] = [
		[pNeck, along - neck],
		[pNeck, along + neck],
		[pTip, along + tip],
		[pTip, along - tip]
	];
	const ptsXY: [number, number][] = seam.axis === 'x' ? poly : poly.map(([p, q]) => [q, p]);
	const cs = new CrossSection(ensureCCW(ptsXY));
	const h = female ? thickness + 0.2 : thickness;
	return Manifold.extrude(cs, h).translate([0, 0, female ? -0.1 : 0]);
}

// Solid wall along a seam edge — material to pin/bolt through.
function pinRail(seam: Seam, thickness: number, wall: number): Manifold {
	const len = seam.max - seam.min;
	const mid = (seam.min + seam.max) / 2;
	const into = seam.pos + (seam.bodyDir * wall) / 2; // rail center, inside the body
	return seam.axis === 'x' ? box(wall, len, thickness, into, mid, 0) : box(len, wall, thickness, mid, into, 0);
}

// Horizontal hole through a seam rail at mid-height, from the seam face into the body.
function pinHole(seam: Seam, along: number, thickness: number, wall: number, r: number, segments: number): Manifold {
	const len = wall + 0.4;
	const cyl = oc().Manifold.cylinder(len, r, r, segments);
	const aligned = seam.axis === 'x' ? cyl.rotate([0, 90, 0]) : cyl.rotate([-90, 0, 0]); // spans +x / +y over [0, len]
	const start = seam.bodyDir > 0 ? seam.pos - 0.2 : seam.pos - len + 0.2;
	const z = thickness / 2;
	return seam.axis === 'x' ? aligned.translate([start, along, z]) : aligned.translate([along, start, z]);
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

	// Skeletonize: open each cell through the floor, leaving a frame around the
	// receiving profile. For the magnet style the four corner pads are preserved
	// (subtracted from the opening tool) so they stay full-height and integrated
	// with the frame — the scalloped magnet corners of a gridfinity baseplate.
	const magnet = bp.style === 'magnet';
	const openings = tile.cells.map((cell) => {
		let op = roundedPrism(SKEL_OPENING, SKEL_OPENING, SKEL_CORNER_R, thickness + 0.4, -0.2).translate([cell.x, cell.y, 0]);
		if (magnet) {
			const pads = CORNER_OFFSETS.map(([ox, oy]) =>
				Manifold.cylinder(thickness + 0.6, MAGNET_BOSS_R, MAGNET_BOSS_R, segments).translate([cell.x + ox, cell.y + oy, -0.1])
			);
			op = op.subtract(Manifold.union(pads));
		}
		return op;
	});
	if (openings.length > 0) solid = solid.subtract(openings.length === 1 ? openings[0]! : Manifold.union(openings));

	// Magnet pockets open upward from the cavity floor (socketZ) so the magnet faces
	// the bin's foot magnet — the gridfinity convention. A thin floor stays below it.
	// Optional M3 holes pass all the way through for mounting the plate down.
	if (magnet) {
		const cutters = cellCorners(tile).map(([x, y]) => {
			const parts: Manifold[] = [
				Manifold.cylinder(MAGNET_HOLE_DEPTH + 0.1, MAGNET_HOLE_DIAMETER / 2, MAGNET_HOLE_DIAMETER / 2, segments).translate([0, 0, socketZ - MAGNET_HOLE_DEPTH])
			];
			if (bp.screwHoles) {
				parts.push(Manifold.cylinder(thickness + 0.2, SCREW_HOLE_DIAMETER / 2, SCREW_HOLE_DIAMETER / 2, segments).translate([0, 0, -0.1]));
			}
			return (parts.length === 1 ? parts[0]! : Manifold.union(parts)).translate([x, y, 0]);
		});
		if (cutters.length > 0) solid = solid.subtract(Manifold.union(cutters));
	}

	// Tile connectors, last, so they stay solid through the full thickness.
	if (bp.connector === 'dovetail') {
		const adds: Manifold[] = [];
		const cuts: Manifold[] = [];
		for (const seam of tile.seams) {
			for (const along of seamCellCenters(seam)) {
				if (seam.male) adds.push(dovetailTab(seam, along, thickness, false));
				else cuts.push(dovetailTab(seam, along, thickness, true));
			}
		}
		if (adds.length > 0) solid = solid.add(Manifold.union(adds));
		if (cuts.length > 0) solid = solid.subtract(Manifold.union(cuts));
	} else if (bp.connector === 'screw' || bp.connector === 'filament') {
		const { wall, r } = pinParams(bp.connector);
		if (tile.seams.length > 0) solid = solid.add(Manifold.union(tile.seams.map((s) => pinRail(s, thickness, wall))));
		const holes: Manifold[] = [];
		for (const seam of tile.seams) {
			for (const along of seamCellCenters(seam)) holes.push(pinHole(seam, along, thickness, wall, r, segments));
		}
		if (holes.length > 0) solid = solid.subtract(Manifold.union(holes));
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
