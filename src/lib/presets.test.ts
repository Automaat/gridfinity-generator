import { describe, it, expect } from 'vitest';
import { presets } from './presets';

describe('presets', () => {
	it('has at least 3 presets', () => {
		expect(presets.length).toBeGreaterThanOrEqual(3);
	});

	it('each preset has required fields', () => {
		for (const p of presets) {
			expect(p.name).toBeTruthy();
			expect(p.description).toBeTruthy();
			expect(p.params).toBeDefined();
			expect(p.params.width).toBeGreaterThanOrEqual(1);
			expect(p.params.width).toBeLessThanOrEqual(6);
			expect(p.params.height).toBeGreaterThanOrEqual(1);
			expect(p.params.height).toBeLessThanOrEqual(10);
		}
	});

	it('has unique names', () => {
		const names = presets.map((p) => p.name);
		expect(new Set(names).size).toBe(names.length);
	});
});
