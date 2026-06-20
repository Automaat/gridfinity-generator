import { describe, it, expect } from 'vitest';
import { planBinSplit } from './bin-split';
import { PITCH } from './baseplate-layout';

const TOL = 0.5;
const bodyW = (units: number) => units * PITCH - TOL;

describe('planBinSplit', () => {
	it('fits one bed -> single piece, no split', () => {
		const plan = planBinSplit(6, 6, 256, 256, 'ideal');
		expect(plan.tilesX).toBe(1);
		expect(plan.tilesY).toBe(1);
		expect(plan.multiTile).toBe(false);
		expect(plan.pieces).toHaveLength(1);
		// the single piece is the whole footprint, centered on the origin
		const pc = plan.pieces[0]!;
		expect(pc.w).toBeCloseTo(bodyW(6), 6);
		expect(pc.cx).toBeCloseTo(0, 6);
	});

	it('splits an oversized bin into a piece grid for the bed', () => {
		// floor(220/42) = 5 cells/piece -> 6 cols => 2 pieces, 6 rows => 2 pieces
		const plan = planBinSplit(6, 6, 220, 220, 'ideal');
		expect(plan.tilesX).toBe(2);
		expect(plan.tilesY).toBe(2);
		expect(plan.pieces).toHaveLength(4);
		expect(plan.multiTile).toBe(true);
	});

	it('pieces cover the full footprint with no gaps or overlap', () => {
		const plan = planBinSplit(6, 5, 180, 180, 'ideal');
		const area = plan.pieces.reduce((sum, p) => sum + p.w * p.l, 0);
		expect(area).toBeCloseTo(bodyW(6) * bodyW(5), 3);
		const minX = Math.min(...plan.pieces.map((p) => p.x0));
		const maxX = Math.max(...plan.pieces.map((p) => p.x1));
		const minY = Math.min(...plan.pieces.map((p) => p.y0));
		const maxY = Math.max(...plan.pieces.map((p) => p.y1));
		expect(minX).toBeCloseTo(-bodyW(6) / 2, 6);
		expect(maxX).toBeCloseTo(bodyW(6) / 2, 6);
		expect(minY).toBeCloseTo(-bodyW(5) / 2, 6);
		expect(maxY).toBeCloseTo(bodyW(5) / 2, 6);
	});

	it('keeps every piece within the printer bed', () => {
		for (const [w, l] of [[6, 6], [6, 4], [5, 6], [4, 3]] as const) {
			const plan = planBinSplit(w, l, 180, 180, 'ideal');
			for (const p of plan.pieces) {
				expect(p.w).toBeLessThanOrEqual(180 + 1e-6);
				expect(p.l).toBeLessThanOrEqual(180 + 1e-6);
			}
		}
	});

	it('cuts land on internal grid lines (multiples of 42 about the center)', () => {
		const plan = planBinSplit(6, 1, 220, 220, 'ideal'); // 3+3 -> one interior cut at x=0
		const interiorX = plan.pieces.map((p) => p.x1).filter((x) => Math.abs(x) < bodyW(6) / 2 - 1e-6);
		expect(interiorX).toEqual([0]); // grid line between cell 2 and 3 sits at the origin
	});

	it('incremental packs to the bed; ideal balances pieces', () => {
		const packed = planBinSplit(6, 1, 220, 220, 'incremental'); // 5 + 1 cells
		const balanced = planBinSplit(6, 1, 220, 220, 'ideal'); // 3 + 3 cells
		const packedW = packed.pieces.map((p) => p.w).toSorted((a, b) => a - b);
		const balancedW = balanced.pieces.map((p) => p.w).toSorted((a, b) => a - b);
		// packed: a tiny 1-cell remainder + a big 5-cell piece
		expect(packedW[0]).toBeCloseTo(PITCH - TOL / 2, 6); // edge cell: 42 - 0.25
		// balanced: two near-equal pieces
		expect(balancedW[1]! - balancedW[0]!).toBeLessThan(1);
	});

	it('single-row bins never split in the unused axis', () => {
		const plan = planBinSplit(6, 1, 180, 180, 'ideal');
		expect(plan.tilesY).toBe(1);
	});
});
