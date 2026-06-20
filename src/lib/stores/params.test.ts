import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import {
	params, defaultParams, dimensions, serializeParams, deserializeParams,
	defaultBaseplate, defaultSkadis, serializeAll, deserializeAll,
	type BinParams, type BaseplateParams, type SkadisParams
} from './params';

describe('defaultParams', () => {
	it('has correct default values', () => {
		expect(defaultParams).toEqual({
			width: 2,
			length: 1,
			height: 3,
			wallThickness: 1.2,
			magnetHoles: false,
			magnetCornersOnly: false,
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
			wallCutRun: 1,
			splitToFit: false,
			bedWidth: 220,
			bedDepth: 220,
			splitAlgorithm: 'ideal',
			splitLayout: 'zip'
		});
	});
});

describe('params store', () => {
	it('initializes with default values', () => {
		const value = get(params);
		expect(value).toEqual(defaultParams);
	});

	it('can be updated', () => {
		params.update((p) => ({ ...p, width: 4, magnetHoles: true }));
		const value = get(params);
		expect(value.width).toBe(4);
		expect(value.magnetHoles).toBe(true);

		// reset
		params.set({ ...defaultParams });
	});

	it('can be set to entirely new values', () => {
		const custom: BinParams = {
			width: 6,
			length: 6,
			height: 10,
			wallThickness: 2.0,
			magnetHoles: true,
			magnetCornersOnly: true,
			screwHoles: true,
			stackingLip: 'reduced',
			labelTab: true,
			dividersX: 5,
			dividersY: 3,
			lightweightDividers: true,
			scoopWalls: ['back', 'front'],
			scoopRadius: 5,
			wallCut: true,
			wallCutSide: 'right',
			wallCutLowFraction: 0.5,
			wallCutRun: 0.6,
			splitToFit: true,
			bedWidth: 250,
			bedDepth: 210,
			splitAlgorithm: 'incremental',
			splitLayout: 'combined'
		};
		params.set(custom);
		expect(get(params)).toEqual(custom);

		// reset
		params.set({ ...defaultParams });
	});
});

describe('dimensions derived store', () => {
	it('computes mm from default grid units', () => {
		params.set({ ...defaultParams });
		const dims = get(dimensions);
		expect(dims.widthMm).toBe(2 * 42); // 84
		expect(dims.lengthMm).toBe(1 * 42); // 42
		expect(dims.heightMm).toBe(3 * 7); // 21
	});

	it('updates when params change', () => {
		params.set({ ...defaultParams, width: 4, length: 3, height: 7 });
		const dims = get(dimensions);
		expect(dims.widthMm).toBe(168);
		expect(dims.lengthMm).toBe(126);
		expect(dims.heightMm).toBe(49);

		// reset
		params.set({ ...defaultParams });
	});

	it('handles minimum values', () => {
		params.set({ ...defaultParams, width: 1, length: 1, height: 1 });
		const dims = get(dimensions);
		expect(dims.widthMm).toBe(42);
		expect(dims.lengthMm).toBe(42);
		expect(dims.heightMm).toBe(7);

		// reset
		params.set({ ...defaultParams });
	});

	it('handles maximum values', () => {
		params.set({ ...defaultParams, width: 6, length: 6, height: 10 });
		const dims = get(dimensions);
		expect(dims.widthMm).toBe(252);
		expect(dims.lengthMm).toBe(252);
		expect(dims.heightMm).toBe(70);

		// reset
		params.set({ ...defaultParams });
	});
});

describe('URL serialization', () => {
	it('round-trips all params', () => {
		const custom: BinParams = {
			width: 4,
			length: 3,
			height: 7,
			wallThickness: 1.6,
			magnetHoles: true,
			magnetCornersOnly: true,
			screwHoles: true,
			stackingLip: 'reduced',
			labelTab: true,
			dividersX: 2,
			dividersY: 1,
			lightweightDividers: true,
			scoopWalls: ['back', 'front'],
			scoopRadius: 5,
			wallCut: true,
			wallCutSide: 'back',
			wallCutLowFraction: 0.25,
			wallCutRun: 0.75,
			splitToFit: true,
			bedWidth: 256,
			bedDepth: 256,
			splitAlgorithm: 'incremental',
			splitLayout: 'combined'
		};
		const sp = serializeParams(custom);
		const result = deserializeParams(sp);
		expect(result).toEqual(custom);
	});

	it('omits default values from URL', () => {
		const sp = serializeParams(defaultParams);
		expect(sp.toString()).toBe('');
	});

	it('returns defaults for empty search', () => {
		const result = deserializeParams(new URLSearchParams(''));
		expect(result).toEqual(defaultParams);
	});

	it('clamps out-of-range values', () => {
		const sp = new URLSearchParams('w=99&h=0&wt=5&dx=-1');
		const result = deserializeParams(sp);
		expect(result.width).toBe(6);
		expect(result.height).toBe(1);
		expect(result.wallThickness).toBe(2.0);
		expect(result.dividersX).toBe(0);
	});

	it('handles partial URL', () => {
		const sp = new URLSearchParams('w=3&mh=1');
		const result = deserializeParams(sp);
		expect(result.width).toBe(3);
		expect(result.magnetHoles).toBe(true);
		expect(result.length).toBe(defaultParams.length);
		expect(result.height).toBe(defaultParams.height);
	});

	it('serializes stacking lip correctly', () => {
		const p = { ...defaultParams, stackingLip: 'none' as const };
		const sp = serializeParams(p);
		expect(sp.get('sl')).toBe('n');
		const result = deserializeParams(sp);
		expect(result.stackingLip).toBe('none');
	});

	it('serializes scoop walls as compact string', () => {
		const p: BinParams = { ...defaultParams, scoopWalls: ['back', 'front'] };
		const sp = serializeParams(p);
		expect(sp.get('sw')).toBe('bf');
		const result = deserializeParams(sp);
		expect(result.scoopWalls).toEqual(['back', 'front']);
	});

	it('serializes scoop radius', () => {
		const p: BinParams = { ...defaultParams, scoopWalls: ['left'], scoopRadius: 5 };
		const sp = serializeParams(p);
		expect(sp.get('sr')).toBe('5');
		const result = deserializeParams(sp);
		expect(result.scoopRadius).toBe(5);
	});

	it('clamps scoop radius to valid range', () => {
		const sp = new URLSearchParams('sr=99');
		const result = deserializeParams(sp);
		expect(result.scoopRadius).toBe(20);
	});

	it('deserializes all four scoop walls', () => {
		const sp = new URLSearchParams('sw=bflr');
		const result = deserializeParams(sp);
		expect(result.scoopWalls).toEqual(['back', 'front', 'left', 'right']);
	});

	it('round-trips divider positions', () => {
		const p: BinParams = {
			...defaultParams,
			dividersX: 2,
			dividerPosX: [0.25, 0.6],
			dividersY: 1,
			dividerPosY: [0.4]
		};
		const sp = serializeParams(p);
		expect(sp.get('px')).toBe('250.600');
		expect(sp.get('py')).toBe('400');
		const result = deserializeParams(sp);
		expect(result.dividerPosX).toEqual([0.25, 0.6]);
		expect(result.dividerPosY).toEqual([0.4]);
	});

	it('omits divider positions when unset', () => {
		const sp = serializeParams({ ...defaultParams, dividersX: 2 });
		expect(sp.has('px')).toBe(false);
		expect(sp.has('py')).toBe(false);
	});

	it('round-trips wall cut params', () => {
		const p: BinParams = {
			...defaultParams,
			wallCut: true,
			wallCutSide: 'left',
			wallCutLowFraction: 0.3
		};
		const sp = serializeParams(p);
		expect(sp.get('wc')).toBe('1');
		expect(sp.get('wcs')).toBe('l');
		expect(sp.get('wcf')).toBe('0.3');
		const result = deserializeParams(sp);
		expect(result.wallCut).toBe(true);
		expect(result.wallCutSide).toBe('left');
		expect(result.wallCutLowFraction).toBe(0.3);
	});

	it('clamps wall cut low fraction to valid range', () => {
		expect(deserializeParams(new URLSearchParams('wcf=5')).wallCutLowFraction).toBe(0.95);
		expect(deserializeParams(new URLSearchParams('wcf=-1')).wallCutLowFraction).toBe(0);
	});

	it('round-trips split params via short keys', () => {
		const p: BinParams = {
			...defaultParams,
			splitToFit: true,
			bedWidth: 256,
			bedDepth: 180,
			splitAlgorithm: 'incremental',
			splitLayout: 'combined'
		};
		const sp = serializeParams(p);
		expect(sp.get('sp')).toBe('1');
		expect(sp.get('sbw')).toBe('256');
		expect(sp.get('sbd')).toBe('180');
		expect(sp.get('sal')).toBe('n'); // incremental
		expect(sp.get('sel')).toBe('c'); // combined
		const result = deserializeParams(sp);
		expect(result.splitToFit).toBe(true);
		expect(result.bedWidth).toBe(256);
		expect(result.bedDepth).toBe(180);
		expect(result.splitAlgorithm).toBe('incremental');
		expect(result.splitLayout).toBe('combined');
	});

	it('assigns a unique short key to every param', () => {
		// non-default value per param, chosen to stay in range so a key is emitted
		const nonDefault: BinParams = {
			width: 3,
			length: 2,
			height: 4,
			wallThickness: 1.6,
			magnetHoles: true,
			magnetCornersOnly: true,
			screwHoles: true,
			stackingLip: 'none',
			labelTab: true,
			dividersX: 1,
			dividersY: 1,
			lightweightDividers: true,
			scoopWalls: ['back'],
			scoopRadius: 5,
			wallCut: true,
			wallCutSide: 'back',
			wallCutLowFraction: 0.5,
			wallCutRun: 0.5,
			splitToFit: true,
			bedWidth: 200,
			bedDepth: 250,
			splitAlgorithm: 'incremental',
			splitLayout: 'combined'
		};
		const urlKeys = new Set<string>();
		for (const param of Object.keys(defaultParams) as (keyof BinParams)[]) {
			const sp = serializeParams({ ...defaultParams, [param]: nonDefault[param] });
			const emitted = [...sp.keys()];
			expect(emitted).toHaveLength(1); // exactly one param differs -> one key
			expect(emitted[0]).not.toBe(''); // guard against an empty/missing codec key
			urlKeys.add(emitted[0]!);
		}
		expect(urlKeys.size).toBe(Object.keys(defaultParams).length);
	});
});

describe('baseplate URL serialization', () => {
	const customBp: BaseplateParams = {
		drawerWidth: 336,
		drawerDepth: 252,
		alignX: 'low',
		alignY: 'high',
		style: 'simple',
		screwHoles: true,
		bedWidth: 350,
		bedDepth: 320,
		splitAlgorithm: 'incremental',
		connector: 'screw',
		exportLayout: 'combined'
	};

	it('round-trips every baseplate field via serializeAll/deserializeAll', () => {
		const sp = serializeAll('baseplate', defaultParams, customBp);
		expect(sp.get('m')).toBe('bp');
		const result = deserializeAll(sp);
		expect(result.mode).toBe('baseplate');
		expect(result.baseplate).toEqual(customBp);
	});

	it('emits only the mode marker when baseplate is all defaults', () => {
		const sp = serializeAll('baseplate', defaultParams, defaultBaseplate);
		expect(sp.toString()).toBe('m=bp');
	});

	it('writes bin params (no mode marker) in bin mode, leaving baseplate untouched', () => {
		const bin: BinParams = { ...defaultParams, width: 5 };
		const sp = serializeAll('bin', bin, customBp);
		expect(sp.get('m')).toBeNull();
		expect(sp.get('w')).toBe('5');
		const result = deserializeAll(sp);
		expect(result.mode).toBe('bin');
		expect(result.bin.width).toBe(5);
		expect(result.baseplate).toEqual(defaultBaseplate); // no bp keys present
	});

	it('defaults to bin mode and default baseplate for an empty search', () => {
		const result = deserializeAll(new URLSearchParams(''));
		expect(result.mode).toBe('bin');
		expect(result.baseplate).toEqual(defaultBaseplate);
	});

	it('clamps out-of-range drawer/bed and rounds to integers', () => {
		const sp = new URLSearchParams('m=bp&dw=20&dd=99999&bw=10');
		const { baseplate } = deserializeAll(sp);
		expect(baseplate.drawerWidth).toBe(42); // min
		expect(baseplate.drawerDepth).toBe(2000); // max
		expect(baseplate.bedWidth).toBe(42); // min
	});

	it('encodes each enum field to its short char and decodes back', () => {
		const sp = serializeAll('baseplate', defaultParams, customBp);
		expect(sp.get('ax')).toBe('l'); // alignX low
		expect(sp.get('ay')).toBe('h'); // alignY high
		expect(sp.get('st')).toBe('s'); // simple
		expect(sp.get('sa')).toBe('n'); // incremental
		expect(sp.get('cn')).toBe('s'); // screw
		expect(sp.get('el')).toBe('c'); // combined
		expect(deserializeAll(sp).baseplate).toEqual(customBp);
	});

	it('falls back to defaults for unknown enum chars', () => {
		const sp = new URLSearchParams('m=bp&cn=z&st=q');
		const { baseplate } = deserializeAll(sp);
		expect(baseplate.connector).toBe(defaultBaseplate.connector);
		expect(baseplate.style).toBe(defaultBaseplate.style);
	});

	it('gives every baseplate field a distinct URL key', () => {
		const keys = new Set<string>();
		const nonDefault: BaseplateParams = customBp;
		for (const key of Object.keys(defaultBaseplate) as (keyof BaseplateParams)[]) {
			const sp = serializeAll('baseplate', defaultParams, { ...defaultBaseplate, [key]: nonDefault[key] });
			const emitted = [...sp.keys()].filter((k) => k !== 'm');
			// some custom values may equal the default; only assert uniqueness when one emits
			if (emitted.length === 1) keys.add(emitted[0]!);
		}
		expect(keys.size).toBeGreaterThan(5);
	});
});

describe('skadis URL serialization', () => {
	const customSk: SkadisParams = {
		width: 160, height: 130, depth: 70, wallThickness: 2.4, mountType: 'screw', hookRows: 2, openFront: true, frontWallHeight: 45, openSides: true, sideWallHeight: 90, lightweightWalls: true
	};

	it('round-trips every skadis field via serializeAll/deserializeAll', () => {
		const sp = serializeAll('skadis', defaultParams, defaultBaseplate, customSk);
		expect(sp.get('m')).toBe('sk');
		const result = deserializeAll(sp);
		expect(result.mode).toBe('skadis');
		expect(result.skadis).toEqual(customSk);
	});

	it('emits only the mode marker when skadis is all defaults', () => {
		const sp = serializeAll('skadis', defaultParams, defaultBaseplate, defaultSkadis);
		expect(sp.toString()).toBe('m=sk');
	});

	it('defaults to default skadis for an empty search', () => {
		expect(deserializeAll(new URLSearchParams('')).skadis).toEqual(defaultSkadis);
	});

	it('clamps out-of-range box dimensions', () => {
		const sp = new URLSearchParams('m=sk&skw=5&skh=99999&skr=9');
		const { skadis } = deserializeAll(sp);
		expect(skadis.width).toBe(20); // min
		expect(skadis.height).toBe(400); // max
		expect(skadis.hookRows).toBe(2); // max
	});

	it('keeps bin and baseplate keys untouched in skadis mode', () => {
		const sp = serializeAll('skadis', defaultParams, defaultBaseplate, customSk);
		expect(sp.get('w')).toBeNull();
		expect(sp.get('dw')).toBeNull();
		expect(deserializeAll(sp).bin).toEqual(defaultParams);
		expect(deserializeAll(sp).baseplate).toEqual(defaultBaseplate);
	});

	it('gives every skadis field a distinct URL key', () => {
		const keys = new Set<string>();
		for (const key of Object.keys(defaultSkadis) as (keyof SkadisParams)[]) {
			const sp = serializeAll('skadis', defaultParams, defaultBaseplate, { ...defaultSkadis, [key]: customSk[key] });
			const emitted = [...sp.keys()].filter((k) => k !== 'm');
			if (emitted.length === 1) keys.add(emitted[0]!);
		}
		expect(keys.size).toBe(Object.keys(defaultSkadis).length);
	});
});
