import { describe, it, expect } from 'vitest';
import { estimatePrint } from './print-estimate';
import { defaultParams, type BinParams } from '$lib/stores/params';

function makeParams(overrides: Partial<BinParams> = {}): BinParams {
	return { ...defaultParams, ...overrides };
}

describe('estimatePrint', () => {
	it('returns positive values for default params', () => {
		const est = estimatePrint(makeParams());
		expect(est.volumeCm3).toBeGreaterThan(0);
		expect(est.filamentGrams).toBeGreaterThan(0);
		expect(est.filamentMeters).toBeGreaterThan(0);
		expect(est.printTimeMinutes).toBeGreaterThan(0);
	});

	it('increases with larger bin', () => {
		const small = estimatePrint(makeParams({ width: 1, length: 1 }));
		const large = estimatePrint(makeParams({ width: 4, length: 4 }));
		expect(large.volumeCm3).toBeGreaterThan(small.volumeCm3);
		expect(large.filamentGrams).toBeGreaterThan(small.filamentGrams);
	});

	it('increases with dividers', () => {
		const none = estimatePrint(makeParams());
		const divs = estimatePrint(makeParams({ dividersX: 2, dividersY: 1 }));
		expect(divs.volumeCm3).toBeGreaterThan(none.volumeCm3);
	});

	it('increases with stacking lip', () => {
		const noLip = estimatePrint(makeParams({ stackingLip: 'none' }));
		const lip = estimatePrint(makeParams({ stackingLip: 'standard' }));
		expect(lip.volumeCm3).toBeGreaterThan(noLip.volumeCm3);
	});

	it('handles minimum 1x1x1 bin', () => {
		const est = estimatePrint(makeParams({ width: 1, length: 1, height: 1, stackingLip: 'none' }));
		expect(est.volumeCm3).toBeGreaterThan(0);
		expect(est.printTimeMinutes).toBeGreaterThanOrEqual(0);
	});

	it('handles reduced lip', () => {
		const reduced = estimatePrint(makeParams({ stackingLip: 'reduced' }));
		const standard = estimatePrint(makeParams({ stackingLip: 'standard' }));
		expect(reduced.volumeCm3).toBeLessThan(standard.volumeCm3);
	});
});
