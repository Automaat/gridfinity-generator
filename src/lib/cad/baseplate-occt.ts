// Lazy OpenCascade baseplate path — STEP export only (BRep kernel). Mirrors
// baseplate-manifold.ts in replicad; importing it pulls the ~4.6MB WASM, so the
// worker dynamic-imports it on demand, exactly like occt.ts does for bins.
import { draw, drawCircle, drawRoundedRectangle, makeCompound, setOC, type Solid, type Sketch } from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { buildUnitBase } from './gridfinity';
import type { BaseplateParams } from '$lib/stores/params';
import {
	baseplateCellCorners,
	baseplateThickness,
	CORNER_OFFSETS,
	FILAMENT_PIN_DEPTH as FIL_DEPTH,
	FILAMENT_PIN_RADIUS as FIL_R,
	FILAMENT_PIN_Z as FIL_Z,
	MAGNET_BOSS_RADIUS as MAGNET_BOSS_R,
	SCREW_CONNECTOR_RADIUS as SCREW_R,
	SCREW_CONNECTOR_WALL as SCREW_WALL,
	SKELETON_CORNER_RADIUS as SKEL_CORNER_R,
	SKELETON_OPENING as SKEL_OPENING,
	SOCKET_DEPTH
} from './baseplate-spec';
import { planBaseplate, seamCellCenters, type BaseplateTile, type Seam } from './baseplate-layout';
import { dovetailTabSpec, pinHoleSpec, pinRailSpec } from './baseplate-connectors';
import {
	MAGNET_HOLE_DEPTH,
	MAGNET_HOLE_DIAMETER,
	SCREW_HOLE_DIAMETER
} from './gridfinity-spec';

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

function dovetailTabSolid(seam: Seam, along: number, thickness: number, female: boolean): Solid {
	const spec = dovetailTabSpec(seam, along, thickness, female);
	let dw = draw(spec.points[0]);
	for (let i = 1; i < spec.points.length; i++) dw = dw.lineTo(spec.points[i]!);
	return (dw.close().sketchOnPlane('XY', spec.z) as Sketch).extrude(spec.height) as Solid;
}

function pinRailSolid(seam: Seam, thickness: number, wall: number): Solid {
	const spec = pinRailSpec(seam, wall);
	return (drawRoundedRectangle(spec.w, spec.l, 0).sketchOnPlane('XY') as Sketch).extrude(thickness).translate(spec.cx, spec.cy, 0) as Solid;
}

function pinHoleSolid(seam: Seam, along: number, depth: number, r: number, z: number): Solid {
	const spec = pinHoleSpec(seam, along, depth, z);
	// Horizontal hole: sketch on the plane normal to the seam, extrude into the body.
	return spec.axis === 'x'
		? ((drawCircle(r).sketchOnPlane('YZ', spec.start) as Sketch).extrude(spec.length).translate(0, spec.y, spec.z) as Solid)
		: ((drawCircle(r).sketchOnPlane('XZ', spec.start) as Sketch).extrude(spec.length).translate(spec.x, 0, spec.z) as Solid);
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
		const cutters = baseplateCellCorners(tile.cells).map(([x, y]) => {
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
	const thickness = baseplateThickness(bp.style);
	const foot = buildUnitBase();
	const tiles = layout.tiles.map((tile) => buildTileSolid(tile, bp, thickness, foot));
	return (tiles.length === 1 ? tiles[0]! : (makeCompound(tiles) as Solid));
}
