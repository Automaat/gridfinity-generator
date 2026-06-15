import type { BinParams, BaseplateParams } from '$lib/stores/params';

export interface Preset {
	name: string;
	description: string;
	params: BinParams;
}

export interface BaseplatePreset {
	name: string;
	description: string;
	params: BaseplateParams;
}

// Build-plate sizes (mm) for common printers — selecting one fills bed W×D in the
// baseplate tiler. Usable area; trim a few mm for clips/skirt if your slicer warns.
export interface PrinterBed {
	name: string;
	w: number;
	d: number;
}

export const printerBeds: PrinterBed[] = [
	{ name: 'Bambu Lab H2D', w: 350, d: 320 },
	{ name: 'Bambu Lab X1 / P1 / A1', w: 256, d: 256 },
	{ name: 'Bambu Lab A1 mini', w: 180, d: 180 },
	{ name: 'Prusa MK4 / MK3S', w: 250, d: 210 },
	{ name: 'Prusa XL', w: 360, d: 360 },
	{ name: 'Prusa Mini+', w: 180, d: 180 },
	{ name: 'Creality Ender 3 / K1', w: 220, d: 220 },
	{ name: 'Creality K1 Max', w: 300, d: 300 },
	{ name: 'Voron 2.4 (350)', w: 350, d: 350 }
];

export const presets: Preset[] = [
	{
		name: 'Small Parts',
		description: '2×2 bin with magnet holes and label tab',
		params: {
			width: 2,
			length: 2,
			height: 3,
			wallThickness: 1.2,
			magnetHoles: true,
			screwHoles: false,
			stackingLip: 'standard',
			labelTab: true,
			dividersX: 0,
			dividersY: 0,
			lightweightDividers: false,
			scoopWalls: [],
			scoopRadius: 0,
			wallCut: false,
			wallCutSide: 'front',
			wallCutLowFraction: 0,
			wallCutRun: 1
		}
	},
	{
		name: 'Hardware Organizer',
		description: '3×2 divided bin with labels and screw holes',
		params: {
			width: 3,
			length: 2,
			height: 3,
			wallThickness: 1.2,
			magnetHoles: false,
			screwHoles: true,
			stackingLip: 'standard',
			labelTab: true,
			dividersX: 2,
			dividersY: 1,
			lightweightDividers: false,
			scoopWalls: ['back'],
			scoopRadius: 0,
			wallCut: false,
			wallCutSide: 'front',
			wallCutLowFraction: 0,
			wallCutRun: 1
		}
	},
	{
		name: 'Tool Holder',
		description: '1×1 tall bin with thick walls, no lip',
		params: {
			width: 1,
			length: 1,
			height: 6,
			wallThickness: 2.0,
			magnetHoles: false,
			screwHoles: false,
			stackingLip: 'none',
			labelTab: false,
			dividersX: 0,
			dividersY: 0,
			lightweightDividers: false,
			scoopWalls: [],
			scoopRadius: 0,
			wallCut: false,
			wallCutSide: 'front',
			wallCutLowFraction: 0,
			wallCutRun: 1
		}
	},
	{
		name: 'Deep Bin',
		description: '2×2 tall bin for larger items',
		params: {
			width: 2,
			length: 2,
			height: 7,
			wallThickness: 1.2,
			magnetHoles: false,
			screwHoles: false,
			stackingLip: 'standard',
			labelTab: false,
			dividersX: 0,
			dividersY: 0,
			lightweightDividers: false,
			scoopWalls: [],
			scoopRadius: 0,
			wallCut: false,
			wallCutSide: 'front',
			wallCutLowFraction: 0,
			wallCutRun: 1
		}
	},
	{
		name: 'Divided Tray',
		description: '4×2 shallow tray with dividers and scoops',
		params: {
			width: 4,
			length: 2,
			height: 2,
			wallThickness: 1.2,
			magnetHoles: false,
			screwHoles: false,
			stackingLip: 'reduced',
			labelTab: true,
			dividersX: 3,
			dividersY: 1,
			lightweightDividers: false,
			scoopWalls: ['back'],
			scoopRadius: 0,
			wallCut: false,
			wallCutSide: 'front',
			wallCutLowFraction: 0,
			wallCutRun: 1
		}
	}
];

export const baseplatePresets: BaseplatePreset[] = [
	{
		name: 'IKEA Alex drawer',
		description: 'Magnetic baseplate for an Alex drawer (~552×360mm), split for a 220mm bed',
		params: {
			drawerWidth: 552, drawerDepth: 360, alignX: 'center', alignY: 'center',
			style: 'magnet', screwHoles: false, bedWidth: 220, bedDepth: 220,
			splitAlgorithm: 'ideal', connector: 'dovetail', exportLayout: 'zip'
		}
	},
	{
		name: 'Small drawer (simple)',
		description: 'Single-piece no-magnet grid, fits a 256mm bed',
		params: {
			drawerWidth: 252, drawerDepth: 210, alignX: 'center', alignY: 'center',
			style: 'simple', screwHoles: false, bedWidth: 256, bedDepth: 256,
			splitAlgorithm: 'ideal', connector: 'dovetail', exportLayout: 'zip'
		}
	}
];
