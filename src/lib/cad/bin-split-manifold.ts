// Bin splitting geometry — partitions a too-big bin into printer-bed-sized pieces
// for printing in parts. Strategy: build the full bin once (manifold-bin.ts), then
// intersect it with a bed-sized clip box per piece (bin-split.ts gives the bounds).
// Cuts land on grid lines; pieces are flush (glue the cut faces). Nothing is added
// or removed, so the pieces' total volume equals the whole bin's.
//
// Reuses the bin builder's manifold primitives, so `setBinManifold` must have run
// first — the worker does that on init.
import type { Manifold } from 'manifold-3d';
import type { BinParams } from '$lib/stores/params';
import { buildBinManifold, oc, box } from './manifold-bin';
import { planBinSplit, type BinPiece } from './bin-split';
import {
	combinedGridPlacements,
	EXPORT_SEGMENTS,
	gridExportName,
	PREVIEW_SEGMENTS,
	type BuildOpts,
	type NamedSolid
} from './split-export';

// Clip box height — far taller than any bin (≤10U·7 + lip ≈ 73.5mm), so a single
// box value clips every piece through its full Z without per-bin sizing.
const CLIP_Z = 1000;
// Exploded-preview gap: spread pieces apart so the cut seams are visible in the
// live view without making the bin unrecognizable.
const PREVIEW_GAP = 6;
// Combined-export gap: pieces laid flat on one plate, clearly separated for slicing.
const COMBINED_GAP = 12;

// The bed-sized region this piece keeps, as a tall box covering the full bin Z.
function clipBox(piece: BinPiece): Manifold {
	return box(piece.w, piece.l, CLIP_Z, piece.cx, piece.cy, -CLIP_Z / 2);
}

// Centered offset for a piece index so an N-piece row spreads symmetrically about
// the origin: indices 0..N-1 map to −(N−1)/2 .. +(N−1)/2.
function explodeShift(idx: number, n: number): number {
	return idx - (n - 1) / 2;
}

// Live preview: pieces clipped from the full bin and pushed apart by a small gap
// so the user sees where the bin will be cut. Single-piece bins return as-is.
export function buildBinSplitPreview(p: BinParams, { segments = PREVIEW_SEGMENTS }: BuildOpts = {}): Manifold {
	const { Manifold } = oc();
	const plan = planBinSplit(p.width, p.length, p.bedWidth, p.bedDepth, p.splitAlgorithm);
	const full = buildBinManifold(p, { segments });
	if (!plan.multiTile) return full;
	const pieces = plan.pieces.map((pc) => {
		const dx = explodeShift(pc.col, plan.tilesX) * PREVIEW_GAP;
		const dy = explodeShift(pc.row, plan.tilesY) * PREVIEW_GAP;
		return full.intersect(clipBox(pc)).translate([dx, dy, 0]);
	});
	return pieces.length === 1 ? pieces[0]! : Manifold.union(pieces);
}

// Each piece localized to its own origin — for per-file (ZIP) STL export.
export function buildBinSplitTiles(p: BinParams, { segments = EXPORT_SEGMENTS }: BuildOpts = {}): NamedSolid[] {
	const plan = planBinSplit(p.width, p.length, p.bedWidth, p.bedDepth, p.splitAlgorithm);
	const full = buildBinManifold(p, { segments });
	return plan.pieces.map((pc) => ({
		name: gridExportName('piece', pc),
		solid: full.intersect(clipBox(pc)).translate([-pc.cx, -pc.cy, 0])
	}));
}

// All pieces spread apart on one plate — for the single combined STL.
export function buildBinSplitCombined(p: BinParams, { segments = EXPORT_SEGMENTS }: BuildOpts = {}): Manifold {
	const { Manifold } = oc();
	const plan = planBinSplit(p.width, p.length, p.bedWidth, p.bedDepth, p.splitAlgorithm);
	const full = buildBinManifold(p, { segments });

	const placed = combinedGridPlacements(plan.pieces, COMBINED_GAP).map(({ item: pc, x, y }) => {
		const local = full.intersect(clipBox(pc)).translate([-pc.cx, -pc.cy, 0]);
		return local.translate([x, y, 0]);
	});
	return placed.length === 1 ? placed[0]! : Manifold.union(placed);
}
