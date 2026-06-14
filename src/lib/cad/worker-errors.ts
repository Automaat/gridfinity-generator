import type { BinParams } from '$lib/stores/params';

// Timeout is detected on the main thread, but shares this vocabulary so the UI
// can present every failure uniformly.
export type WorkerErrorCode = 'InvalidParams' | 'WASMError' | 'OutOfMemory' | 'Timeout' | 'Unknown';

export class InvalidParamsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidParamsError';
	}
}

// Reject obviously unbuildable params before handing them to OpenCascade, where
// the failure would surface as an opaque WASM abort.
export function validateParams(p: BinParams): void {
	if (!Number.isFinite(p.width) || !Number.isFinite(p.length) || !Number.isFinite(p.height)) {
		throw new InvalidParamsError('Grid dimensions must be finite numbers');
	}
	if (p.width < 1 || p.length < 1 || p.height < 1) {
		throw new InvalidParamsError('Grid dimensions must be at least 1 unit');
	}
	if (!Number.isFinite(p.wallThickness) || p.wallThickness <= 0) {
		throw new InvalidParamsError('Wall thickness must be a positive number');
	}
	if (!Number.isInteger(p.dividersX) || !Number.isInteger(p.dividersY) || p.dividersX < 0 || p.dividersY < 0) {
		throw new InvalidParamsError('Divider counts must be non-negative integers');
	}
	if (!Number.isFinite(p.scoopRadius) || p.scoopRadius < 0) {
		throw new InvalidParamsError('Scoop radius must be a non-negative number');
	}
}

// OpenCascade/WASM surface failures as plain Errors; classify them so the UI can
// distinguish a recoverable bad-input case from a fatal engine crash.
export function classifyError(err: unknown): { code: WorkerErrorCode; message: string } {
	if (err instanceof InvalidParamsError) {
		return { code: 'InvalidParams', message: err.message };
	}
	const message = err instanceof Error ? err.message : String(err);
	const lower = message.toLowerCase();
	if (
		lower.includes('out of memory') ||
		lower.includes('oom') ||
		lower.includes('enlarge memory') ||
		lower.includes('bad_alloc')
	) {
		return { code: 'OutOfMemory', message };
	}
	if (
		lower.includes('abort(') ||
		lower.includes('wasm') ||
		lower.includes('opencascade') ||
		lower.includes('std::') ||
		lower.includes('standard_')
	) {
		return { code: 'WASMError', message };
	}
	return { code: 'Unknown', message };
}
