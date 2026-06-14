import { describe, it, expect } from 'vitest';
import { classifyError, validateParams, InvalidParamsError } from './worker-errors';
import { defaultParams } from '$lib/stores/params';

describe('validateParams', () => {
	it('accepts default params', () => {
		expect(() => validateParams(defaultParams)).not.toThrow();
	});

	it('rejects non-finite dimensions', () => {
		expect(() => validateParams({ ...defaultParams, width: NaN })).toThrow(InvalidParamsError);
		expect(() => validateParams({ ...defaultParams, height: Infinity })).toThrow(InvalidParamsError);
	});

	it('rejects sub-unit dimensions', () => {
		expect(() => validateParams({ ...defaultParams, length: 0 })).toThrow(InvalidParamsError);
	});

	it('rejects non-positive wall thickness', () => {
		expect(() => validateParams({ ...defaultParams, wallThickness: 0 })).toThrow(InvalidParamsError);
	});

	it('rejects negative divider counts', () => {
		expect(() => validateParams({ ...defaultParams, dividersX: -1 })).toThrow(InvalidParamsError);
	});

	it('rejects negative scoop radius', () => {
		expect(() => validateParams({ ...defaultParams, scoopRadius: -1 })).toThrow(InvalidParamsError);
	});
});

describe('classifyError', () => {
	it('maps InvalidParamsError to InvalidParams', () => {
		expect(classifyError(new InvalidParamsError('bad'))).toEqual({ code: 'InvalidParams', message: 'bad' });
	});

	it('detects out-of-memory failures', () => {
		expect(classifyError(new Error('Cannot enlarge memory arrays')).code).toBe('OutOfMemory');
		expect(classifyError(new Error('OOM during allocation')).code).toBe('OutOfMemory');
	});

	it('detects WASM/OpenCascade failures', () => {
		expect(classifyError(new Error('abort(OOB)')).code).toBe('WASMError');
		expect(classifyError(new Error('Standard_ConstructionError: OpenCascade')).code).toBe('WASMError');
		expect(classifyError(new Error('std::out_of_range')).code).toBe('WASMError');
	});

	it('falls back to Unknown for vague/unrecognized errors', () => {
		expect(classifyError(new Error('something odd')).code).toBe('Unknown');
		// bare "exception" is too vague to attribute to the engine
		expect(classifyError(new Error('uncaught exception')).code).toBe('Unknown');
	});

	it('handles non-Error throwables', () => {
		expect(classifyError('plain string')).toEqual({ code: 'Unknown', message: 'plain string' });
	});
});
