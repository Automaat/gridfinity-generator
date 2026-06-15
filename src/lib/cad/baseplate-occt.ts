// Lazy OpenCascade baseplate path — STEP export only (BRep kernel). Mirrors
// baseplate-manifold.ts in replicad; importing it pulls the ~4.6MB WASM, so the
// worker dynamic-imports it on demand, exactly like occt.ts does for bins.
import { draw, drawCircle, drawRoundedRectangle, makeCompound, setOC, type Solid, type Sketch } from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { buildUnitBase } from './gridfinity';
import type { BaseplateParams } from '$lib/stores/params';
import {
	planBaseplate, PITCH, DT_DEPTH, DT_NECK, DT_TIP, DT_ANCHOR, DT_CLEARANCE,
	type BaseplateTile, type Dovetail
} from './baseplate-layout';

// Mirror baseplate-manifold.ts constants.
const SOCKET_DEPTH = 4.75;
const THICKNESS_SIMPLE = SOCKET_DEPTH + 1.25; // 6.0
const THICKNESS_MAGNET = SOCKET_DEPTH + 2.4 + 0.8; // 7.95
const MAGNET_HOLE_DIAMETER = 6.5;
const MAGNET_HOLE_DEPTH = 2.4;
const SCREW_HOLE_DIAMETER = 3;
const HOLE_DISTANCE_FROM_EDGE = 8;
// Skeletonization (mirror baseplate-manifold.ts).
const SKEL_OPENING = 30;
const SKEL_CORNER_R = 5;
const MAGNET_BOSS_R = MAGNET_HOLE_DIAMETER / 2 + 2;
const HOLE_INSET = PITCH / 2 - HOLE_DISTANCE_FROM_EDGE;

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

function dovetailSolid(d: Dovetail, tile: BaseplateTile, thickness: number, female: boolean): Solid {
	const c = female ? DT_CLEARANCE : 0;
	const neck = DT_NECK / 2 + c;
	const tip = DT_TIP / 2 + c;
	const depth = DT_DEPTH + c;
	const seam = d.axis === 'x' ? d.x : d.y;
	const along = d.axis === 'x' ? d.y : d.x;
	const tilePerp = d.axis === 'x' ? tile.cx : tile.cy;
	const dir = female ? Math.sign(tilePerp - seam) : Math.sign(seam - tilePerp);
	const anchor = female ? 0 : DT_ANCHOR;
	const pNeck = seam - dir * anchor;
	const pTip = seam + dir * depth;
	const poly: [number, number][] = [
		[pNeck, along - neck],
		[pNeck, along + neck],
		[pTip, along + tip],
		[pTip, along - tip]
	];
	const ptsXY: [number, number][] = d.axis === 'x' ? poly : poly.map(([p, q]) => [q, p]);
	let dw = draw(ptsXY[0]);
	for (let i = 1; i < ptsXY.length; i++) dw = dw.lineTo(ptsXY[i]!);
	const z0 = female ? -0.1 : 0;
	const h = female ? thickness + 0.2 : thickness;
	return (dw.close().sketchOnPlane('XY', z0) as Sketch).extrude(h) as Solid;
}

function buildTileSolid(tile: BaseplateTile, bp: BaseplateParams, thickness: number, foot: Solid): Solid {
	let solid = (drawRoundedRectangle(tile.w, tile.l, 0).sketchOnPlane('XY') as Sketch)
		.extrude(thickness)
		.translate(tile.cx, tile.cy, 0) as Solid;

	const socketZ = thickness - SOCKET_DEPTH;
	const sockets = tile.cells.map((cell) => foot.clone().translate(cell.x, cell.y, socketZ) as Solid);
	solid = solid.cut(makeCompound(sockets) as Solid) as Solid;

	// Skeletonize: open each cell through the floor.
	const skel = tile.cells.map(
		(cell) =>
			(drawRoundedRectangle(SKEL_OPENING, SKEL_OPENING, SKEL_CORNER_R).sketchOnPlane('XY', -0.2) as Sketch)
				.extrude(thickness + 0.4)
				.translate(cell.x, cell.y, 0) as Solid
	);
	solid = solid.cut(makeCompound(skel) as Solid) as Solid;

	if (bp.style === 'magnet') {
		const corners = cellCorners(tile);
		const bossH = thickness - SOCKET_DEPTH + 0.6;
		const bosses = corners.map(
			([x, y]) => (drawCircle(MAGNET_BOSS_R).sketchOnPlane('XY') as Sketch).extrude(bossH).translate(x, y, 0) as Solid
		);
		solid = solid.fuse(makeCompound(bosses) as Solid) as Solid;
		const cutters = corners.map(([x, y]) => {
			let cutter = (drawCircle(MAGNET_HOLE_DIAMETER / 2).sketchOnPlane('XY') as Sketch)
				.extrude(MAGNET_HOLE_DEPTH)
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

	if (tile.males.length > 0) {
		const tabs = tile.males.map((d) => dovetailSolid(d, tile, thickness, false));
		solid = solid.fuse(makeCompound(tabs) as Solid) as Solid;
	}
	if (tile.females.length > 0) {
		const pockets = tile.females.map((d) => dovetailSolid(d, tile, thickness, true));
		solid = solid.cut(makeCompound(pockets) as Solid) as Solid;
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
