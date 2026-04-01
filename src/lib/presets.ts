import type { BinParams } from '$lib/stores/params';

export interface Preset {
	name: string;
	description: string;
	params: BinParams;
}

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
			scoopWall: 'none',
			scoopRadius: 0
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
			scoopWall: 'back',
			scoopRadius: 0
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
			scoopWall: 'none',
			scoopRadius: 0
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
			scoopWall: 'none',
			scoopRadius: 0
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
			scoopWall: 'back',
			scoopRadius: 0
		}
	}
];
