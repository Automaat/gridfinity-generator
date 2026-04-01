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
			scoopWall: 'none',
			scoopRadius: 0
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
			scoopWall: 'back',
			scoopRadius: 5
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
			scoopWall: 'back',
			scoopRadius: 5
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
});
