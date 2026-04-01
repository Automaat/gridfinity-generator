import { writable, derived } from 'svelte/store';

export interface BinParams {
	width: number;
	length: number;
	height: number;
	wallThickness: number;
	magnetHoles: boolean;
	screwHoles: boolean;
	stackingLip: 'standard' | 'none' | 'reduced';
	labelTab: boolean;
	dividersX: number;
	dividersY: number;
}

export const defaultParams: BinParams = {
	width: 2,
	length: 1,
	height: 3,
	wallThickness: 1.2,
	magnetHoles: false,
	screwHoles: false,
	stackingLip: 'standard',
	labelTab: false,
	dividersX: 0,
	dividersY: 0
};

export const params = writable<BinParams>({ ...defaultParams });

export const dimensions = derived(params, ($p) => ({
	widthMm: $p.width * 42,
	lengthMm: $p.length * 42,
	heightMm: $p.height * 7
}));
