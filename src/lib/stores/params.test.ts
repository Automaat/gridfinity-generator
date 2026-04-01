import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { params, defaultParams, dimensions, type BinParams } from './params';

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
			dividersY: 0
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
			dividersY: 3
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
