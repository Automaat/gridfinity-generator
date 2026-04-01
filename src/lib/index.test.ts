import { describe, it, expect } from 'vitest';
import { params, defaultParams, dimensions } from './index';
import type { BinParams } from './index';
import { get } from 'svelte/store';

describe('lib index exports', () => {
	it('exports params store', () => {
		expect(params).toBeDefined();
		expect(get(params)).toEqual(defaultParams);
	});

	it('exports defaultParams', () => {
		expect(defaultParams.width).toBe(2);
	});

	it('exports dimensions derived store', () => {
		const dims = get(dimensions);
		expect(dims.widthMm).toBeDefined();
		expect(dims.lengthMm).toBeDefined();
		expect(dims.heightMm).toBeDefined();
	});

	it('exports BinParams type correctly', () => {
		const p: BinParams = { ...defaultParams };
		expect(p.stackingLip).toBe('standard');
	});
});
