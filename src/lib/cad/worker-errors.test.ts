import { describe, it, expect } from 'vitest';
import { classifyError, validateParams, validateBaseplate, validateSkadis, InvalidParamsError } from './worker-errors';
import { defaultParams, defaultBaseplate, defaultSkadis } from '$lib/stores/params';

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

	it('rejects non-positive or non-finite wall thickness', () => {
		expect(() => validateParams({ ...defaultParams, wallThickness: 0 })).toThrow(InvalidParamsError);
		expect(() => validateParams({ ...defaultParams, wallThickness: NaN })).toThrow(InvalidParamsError);
		expect(() => validateParams({ ...defaultParams, wallThickness: Infinity })).toThrow(InvalidParamsError);
	});

	it('rejects negative, fractional, or non-finite divider counts', () => {
		expect(() => validateParams({ ...defaultParams, dividersX: -1 })).toThrow(InvalidParamsError);
		expect(() => validateParams({ ...defaultParams, dividersX: 1.5 })).toThrow(InvalidParamsError);
		expect(() => validateParams({ ...defaultParams, dividersY: NaN })).toThrow(InvalidParamsError);
	});

	it('rejects negative or non-finite scoop radius', () => {
		expect(() => validateParams({ ...defaultParams, scoopRadius: -1 })).toThrow(InvalidParamsError);
		expect(() => validateParams({ ...defaultParams, scoopRadius: NaN })).toThrow(InvalidParamsError);
	});
});

describe('validateBaseplate', () => {
	it('accepts default baseplate params', () => {
		expect(() => validateBaseplate(defaultBaseplate)).not.toThrow();
	});

	it('rejects non-finite or sub-cell drawer dimensions', () => {
		expect(() => validateBaseplate({ ...defaultBaseplate, drawerWidth: NaN })).toThrow(InvalidParamsError);
		expect(() => validateBaseplate({ ...defaultBaseplate, drawerDepth: 30 })).toThrow(InvalidParamsError);
	});

	it('rejects a bed smaller than one cell', () => {
		expect(() => validateBaseplate({ ...defaultBaseplate, bedWidth: 30 })).toThrow(InvalidParamsError);
	});

	it('rejects a bed too small for one tile once skirt is added', () => {
		// drawer 43mm -> 1mm skirt; a 42mm bed cannot hold the 43mm edge tile
		expect(() => validateBaseplate({ ...defaultBaseplate, drawerWidth: 43, bedWidth: 42 })).toThrow(InvalidParamsError);
		// same drawer with a bed that clears the skirt is fine
		expect(() => validateBaseplate({ ...defaultBaseplate, drawerWidth: 43, bedWidth: 43 })).not.toThrow();
	});
});

describe('validateSkadis', () => {
	it('accepts default skadis params', () => {
		expect(() => validateSkadis(defaultSkadis)).not.toThrow();
	});

	it('rejects non-finite or sub-minimum box dimensions', () => {
		expect(() => validateSkadis({ ...defaultSkadis, width: NaN })).toThrow(InvalidParamsError);
		expect(() => validateSkadis({ ...defaultSkadis, depth: 2 })).toThrow(InvalidParamsError);
	});

	it('rejects non-positive or non-finite wall thickness', () => {
		expect(() => validateSkadis({ ...defaultSkadis, wallThickness: 0 })).toThrow(InvalidParamsError);
		expect(() => validateSkadis({ ...defaultSkadis, wallThickness: NaN })).toThrow(InvalidParamsError);
	});

	it('rejects fractional, non-finite, or sub-one hook rows', () => {
		expect(() => validateSkadis({ ...defaultSkadis, hookRows: 1.5 })).toThrow(InvalidParamsError);
		expect(() => validateSkadis({ ...defaultSkadis, hookRows: NaN })).toThrow(InvalidParamsError);
		expect(() => validateSkadis({ ...defaultSkadis, hookRows: 0 })).toThrow(InvalidParamsError);
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
