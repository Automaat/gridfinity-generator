import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { params, defaultParams, dimensions, serializeParams, deserializeParams, type BinParams } from './params';

describe('defaultParams', () => {
	it('has correct default values', () => {
		expect(defaultParams).toEqual({
			width: 2,
			length: 1,
			height: 3,
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
			wallCutRun: 0.6
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
			wallCutRun: 0.75
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

	it('assigns a unique short key to every param', () => {
		// non-default value per param, chosen to stay in range so a key is emitted
		const nonDefault: BinParams = {
			width: 3,
			length: 2,
			height: 4,
			wallThickness: 1.6,
			magnetHoles: true,
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
			wallCutRun: 0.5
		};
		const urlKeys = new Set<string>();
		for (const param of Object.keys(defaultParams) as (keyof BinParams)[]) {
			const sp = serializeParams({ ...defaultParams, [param]: nonDefault[param] });
			const emitted = [...sp.keys()];
			expect(emitted).toHaveLength(1); // exactly one param differs -> one key
			expect(emitted[0]).not.toBe(''); // guard against an empty/missing codec key
			urlKeys.add(emitted[0]);
		}
		expect(urlKeys.size).toBe(Object.keys(defaultParams).length);
	});
});
