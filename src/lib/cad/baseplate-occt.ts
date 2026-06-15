// Lazy OpenCascade baseplate path — STEP export only (BRep kernel). Mirrors
// baseplate-manifold.ts in replicad; importing it pulls the ~4.6MB WASM, so the
// worker dynamic-imports it on demand, exactly like occt.ts does for bins.
import { draw, drawCircle, drawRoundedRectangle, makeCompound, setOC, type Solid, type Sketch } from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { buildUnitBase } from './gridfinity';
import type { BaseplateParams } from '$lib/stores/params';
import { planBaseplate, PITCH, seamCellCenters, type BaseplateTile, type Seam } from './baseplate-layout';

// Mirror baseplate-manifold.ts constants.
const SOCKET_DEPTH = 4.75;
const THICKNESS_SIMPLE = SOCKET_DEPTH + 1.25; // 6.0
const THICKNESS_MAGNET = SOCKET_DEPTH + 2.4 + 0.8; // 7.95
const MAGNET_HOLE_DIAMETER = 6.5;
const MAGNET_HOLE_DEPTH = 2.4;
const SCREW_HOLE_DIAMETER = 3;
const HOLE_DISTANCE_FROM_EDGE = 8;
// Skeletonization (mirror baseplate-manifold.ts).
const SKEL_OPENING = 33;
const SKEL_CORNER_R = 7;
const MAGNET_BOSS_R = MAGNET_HOLE_DIAMETER / 2 + 2;
const HOLE_INSET = PITCH / 2 - HOLE_DISTANCE_FROM_EDGE;
const CORNER_OFFSETS: [number, number][] = [
	[HOLE_INSET, HOLE_INSET],
	[-HOLE_INSET, HOLE_INSET],
	[HOLE_INSET, -HOLE_INSET],
	[-HOLE_INSET, -HOLE_INSET]
];
// Connectors (mirror baseplate-manifold.ts).
const DT_DEPTH = 4;
const DT_NECK = 5;
const DT_TIP = 8;
const DT_ANCHOR = 1.5;
const DT_CLEARANCE = 0.15;
const SCREW_WALL = 6;
const SCREW_R = 1.7;
const FIL_DEPTH = 5;
const FIL_R = 0.9;
const FIL_Z = 1.6;

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

function tileThickness(bp: BaseplateParams): number {
	return bp.style === 'magnet' ? THICKNESS_MAGNET : THICKNESS_SIMPLE;
}

function dovetailTabSolid(seam: Seam, along: number, thickness: number, female: boolean): Solid {
	const c = female ? DT_CLEARANCE : 0;
	const neck = DT_NECK / 2 + c;
	const tip = DT_TIP / 2 + c;
	const depth = DT_DEPTH + c;
	const dir = female ? seam.bodyDir : -seam.bodyDir;
	const anchor = female ? 0 : DT_ANCHOR;
	const pNeck = seam.pos - dir * anchor;
	const pTip = seam.pos + dir * depth;
	const poly: [number, number][] = [
		[pNeck, along - neck],
		[pNeck, along + neck],
		[pTip, along + tip],
		[pTip, along - tip]
	];
	const ptsXY: [number, number][] = seam.axis === 'x' ? poly : poly.map(([p, q]) => [q, p]);
	let dw = draw(ptsXY[0]);
	for (let i = 1; i < ptsXY.length; i++) dw = dw.lineTo(ptsXY[i]!);
	const z0 = female ? -0.1 : 0;
	const h = female ? thickness + 0.2 : thickness;
	return (dw.close().sketchOnPlane('XY', z0) as Sketch).extrude(h) as Solid;
}

function pinRailSolid(seam: Seam, thickness: number, wall: number): Solid {
	const len = seam.max - seam.min;
	const mid = (seam.min + seam.max) / 2;
	const into = seam.pos + (seam.bodyDir * wall) / 2;
	const w = seam.axis === 'x' ? wall : len;
	const l = seam.axis === 'x' ? len : wall;
	const cx = seam.axis === 'x' ? into : mid;
	const cy = seam.axis === 'x' ? mid : into;
	return (drawRoundedRectangle(w, l, 0).sketchOnPlane('XY') as Sketch).extrude(thickness).translate(cx, cy, 0) as Solid;
}

function pinHoleSolid(seam: Seam, along: number, depth: number, r: number, z: number): Solid {
	const len = depth + 0.4;
	const start = seam.bodyDir > 0 ? seam.pos - 0.2 : seam.pos - len + 0.2;
	// Horizontal hole: sketch on the plane normal to the seam, extrude into the body.
	return seam.axis === 'x'
		? ((drawCircle(r).sketchOnPlane('YZ', start) as Sketch).extrude(len).translate(0, along, z) as Solid)
		: ((drawCircle(r).sketchOnPlane('XZ', start) as Sketch).extrude(len).translate(along, 0, z) as Solid);
}

function buildTileSolid(tile: BaseplateTile, bp: BaseplateParams, thickness: number, foot: Solid): Solid {
	let solid = (drawRoundedRectangle(tile.w, tile.l, 0).sketchOnPlane('XY') as Sketch)
		.extrude(thickness)
		.translate(tile.cx, tile.cy, 0) as Solid;

	const socketZ = thickness - SOCKET_DEPTH;
	const sockets = tile.cells.map((cell) => foot.clone().translate(cell.x, cell.y, socketZ) as Solid);
	solid = solid.cut(makeCompound(sockets) as Solid) as Solid;

	// Skeletonize, preserving magnet corner pads (cut the pads out of each opening
	// tool so they survive full-height and integrate with the frame).
	const magnet = bp.style === 'magnet';
	const openings = tile.cells.map((cell) => {
		let op = (drawRoundedRectangle(SKEL_OPENING, SKEL_OPENING, SKEL_CORNER_R).sketchOnPlane('XY', -0.2) as Sketch)
			.extrude(thickness + 0.4)
			.translate(cell.x, cell.y, 0) as Solid;
		if (magnet) {
			const pads = CORNER_OFFSETS.map(
				([ox, oy]) => (drawCircle(MAGNET_BOSS_R).sketchOnPlane('XY', -0.1) as Sketch).extrude(thickness + 0.6).translate(cell.x + ox, cell.y + oy, 0) as Solid
			);
			op = op.cut(makeCompound(pads) as Solid) as Solid;
		}
		return op;
	});
	solid = solid.cut(makeCompound(openings) as Solid) as Solid;

	if (magnet) {
		// Pockets open upward from the cavity floor (socketZ) toward the bin magnets.
		const cutters = cellCorners(tile).map(([x, y]) => {
			let cutter = (drawCircle(MAGNET_HOLE_DIAMETER / 2).sketchOnPlane('XY', socketZ - MAGNET_HOLE_DEPTH) as Sketch)
				.extrude(MAGNET_HOLE_DEPTH + 0.1)
				.translate(x, y, 0) as Solid;
			if (bp.screwHoles) {
				const screw = (drawCircle(SCREW_HOLE_DIAMETER / 2).sketchOnPlane('XY', -0.1) as Sketch)
					.extrude(thickness + 0.2)
					.translate(x, y, 0) as Solid;
				cutter = cutter.fuse(screw) as Solid;
			}
			return cutter;
		});
		if (cutters.length > 0) solid = solid.cut(makeCompound(cutters) as Solid) as Solid;
	}

	if (bp.connector === 'dovetail') {
		const adds: Solid[] = [];
		const cuts: Solid[] = [];
		for (const seam of tile.seams) {
			for (const along of seamCellCenters(seam)) {
				if (seam.male) adds.push(dovetailTabSolid(seam, along, thickness, false));
				else cuts.push(dovetailTabSolid(seam, along, thickness, true));
			}
		}
		if (adds.length > 0) solid = solid.fuse(makeCompound(adds) as Solid) as Solid;
		if (cuts.length > 0) solid = solid.cut(makeCompound(cuts) as Solid) as Solid;
	} else if (bp.connector === 'filament') {
		const holes: Solid[] = [];
		for (const seam of tile.seams) {
			for (const along of seamCellCenters(seam)) holes.push(pinHoleSolid(seam, along, FIL_DEPTH, FIL_R, FIL_Z));
		}
		if (holes.length > 0) solid = solid.cut(makeCompound(holes) as Solid) as Solid;
	} else if (bp.connector === 'screw') {
		if (tile.seams.length > 0) {
			solid = solid.fuse(makeCompound(tile.seams.map((s) => pinRailSolid(s, thickness, SCREW_WALL))) as Solid) as Solid;
		}
		const holes: Solid[] = [];
		for (const seam of tile.seams) {
			for (const along of seamCellCenters(seam)) holes.push(pinHoleSolid(seam, along, SCREW_WALL, SCREW_R, thickness / 2));
		}
		if (holes.length > 0) solid = solid.cut(makeCompound(holes) as Solid) as Solid;
	}
	return solid;
}

export async function buildOcctBaseplate(bp: BaseplateParams): Promise<Solid> {
	await init();
	const layout = planBaseplate(bp);
	const thickness = tileThickness(bp);
	const foot = buildUnitBase();
	const tiles = layout.tiles.map((tile) => buildTileSolid(tile, bp, thickness, foot));
	return (tiles.length === 1 ? tiles[0]! : (makeCompound(tiles) as Solid));
}
