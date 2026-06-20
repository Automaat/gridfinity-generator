import type { Manifold } from 'manifold-3d';

export const PREVIEW_SEGMENTS = 32;
export const EXPORT_SEGMENTS = 64;

export interface BuildOpts {
	segments?: number;
}

export interface NamedSolid {
	name: string;
	solid: Manifold;
}

export interface GridExportItem {
	col: number;
	row: number;
	w: number;
	l: number;
}

export interface GridExportPlacement<TItem extends GridExportItem> {
	item: TItem;
	x: number;
	y: number;
}

export function gridExportName(prefix: string, item: Pick<GridExportItem, 'row' | 'col'>): string {
	return `${prefix}_r${item.row + 1}c${item.col + 1}.stl`;
}

export function combinedGridPlacements<TItem extends GridExportItem>(
	items: readonly TItem[],
	gap: number
): GridExportPlacement<TItem>[] {
	const colW: number[] = [];
	const rowL: number[] = [];
	for (const item of items) {
		colW[item.col] = Math.max(colW[item.col] ?? 0, item.w);
		rowL[item.row] = Math.max(rowL[item.row] ?? 0, item.l);
	}

	const colX: number[] = [];
	const rowY: number[] = [];
	let x = 0;
	for (let col = 0; col < colW.length; col++) {
		colX[col] = x;
		x += (colW[col] ?? 0) + gap;
	}
	let y = 0;
	for (let row = 0; row < rowL.length; row++) {
		rowY[row] = y;
		y += (rowL[row] ?? 0) + gap;
	}

	return items.map((item) => ({
		item,
		x: colX[item.col]! + item.w / 2,
		y: rowY[item.row]! + item.l / 2
	}));
}
