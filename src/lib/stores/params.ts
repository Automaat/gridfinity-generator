import { writable, derived } from 'svelte/store';

export interface BinParams {
	width: number;
	length: number;
	height: number;
	wallThickness: number;
	magnetHoles: boolean;
	screwHoles: boolean;
	stackingLip: 'standard' | 'none' | 'reduced';
	labelTab: boolean;
	dividersX: number;
	dividersY: number;
	lightweightDividers: boolean;
	scoopWalls: ('back' | 'front' | 'left' | 'right')[];
	scoopRadius: number;
}

export const defaultParams: BinParams = {
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
	scoopRadius: 0
};

export const params = writable<BinParams>({ ...defaultParams });

export const dimensions = derived(params, ($p) => ({
	widthMm: $p.width * 42,
	lengthMm: $p.length * 42,
	heightMm: $p.height * 7
}));

const URL_KEYS: Record<string, keyof BinParams> = {
	w: 'width',
	l: 'length',
	h: 'height',
	wt: 'wallThickness',
	mh: 'magnetHoles',
	sh: 'screwHoles',
	sl: 'stackingLip',
	lt: 'labelTab',
	dx: 'dividersX',
	dy: 'dividersY',
	ld: 'lightweightDividers',
	sw: 'scoopWalls',
	sr: 'scoopRadius'
};

const REVERSE_KEYS = Object.fromEntries(Object.entries(URL_KEYS).map(([k, v]) => [v, k]));

const LIP_SHORT: Record<string, BinParams['stackingLip']> = { s: 'standard', r: 'reduced', n: 'none' };
const LIP_TO_SHORT: Record<string, string> = { standard: 's', reduced: 'r', none: 'n' };

const SCOOP_CHAR_TO_WALL: Record<string, 'back' | 'front' | 'left' | 'right'> = { b: 'back', f: 'front', l: 'left', r: 'right' };
const WALL_TO_CHAR: Record<string, string> = { back: 'b', front: 'f', left: 'l', right: 'r' };

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

export function serializeParams(p: BinParams): URLSearchParams {
	const sp = new URLSearchParams();
	const d = defaultParams;

	for (const [param, short] of Object.entries(REVERSE_KEYS)) {
		const val = p[param as keyof BinParams];
		const def = d[param as keyof BinParams];
		if (val === def) continue;

		if (typeof val === 'boolean') {
			sp.set(short, val ? '1' : '0');
		} else if (param === 'stackingLip') {
			sp.set(short, LIP_TO_SHORT[val as string]);
		} else if (param === 'scoopWalls') {
			const walls = val as string[];
			sp.set(short, walls.map((w) => WALL_TO_CHAR[w]).join(''));
		} else {
			sp.set(short, String(val));
		}
	}
	return sp;
}

export function deserializeParams(search: URLSearchParams): BinParams {
	const p = { ...defaultParams };

	for (const [short, param] of Object.entries(URL_KEYS)) {
		const raw = search.get(short);
		if (raw === null) continue;

		if (param === 'stackingLip') {
			const mapped = LIP_SHORT[raw];
			if (mapped) p.stackingLip = mapped;
		} else if (param === 'scoopWalls') {
			p.scoopWalls = [...raw].map((c) => SCOOP_CHAR_TO_WALL[c]).filter(Boolean);
		} else if (param === 'scoopRadius') {
			const parsed = parseFloat(raw);
			p.scoopRadius = clamp(Number.isNaN(parsed) ? 0 : parsed, 0, 20);
		} else if (param === 'magnetHoles' || param === 'screwHoles' || param === 'labelTab' || param === 'lightweightDividers') {
			(p as Record<string, unknown>)[param] = raw === '1';
		} else if (param === 'wallThickness') {
			const parsed = parseFloat(raw);
			p.wallThickness = clamp(Number.isNaN(parsed) ? defaultParams.wallThickness : parsed, 0.8, 2.0);
		} else if (param === 'width' || param === 'length') {
			const parsed = parseFloat(raw);
			(p as Record<string, unknown>)[param] = clamp(Math.round(Number.isNaN(parsed) ? (defaultParams[param] as number) : parsed), 1, 6);
		} else if (param === 'height') {
			const parsed = parseFloat(raw);
			p.height = clamp(Math.round(Number.isNaN(parsed) ? defaultParams.height : parsed), 1, 10);
		} else if (param === 'dividersX' || param === 'dividersY') {
			const parsed = parseFloat(raw);
			(p as Record<string, unknown>)[param] = clamp(Math.round(Number.isNaN(parsed) ? 0 : parsed), 0, 5);
		}
	}
	return p;
}
