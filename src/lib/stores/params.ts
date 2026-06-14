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
	wallCut: boolean;
	wallCutSide: 'back' | 'front' | 'left' | 'right';
	wallCutLowFraction: number;
	wallCutRun: number;
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
	scoopRadius: 0,
	wallCut: false,
	wallCutSide: 'front',
	wallCutLowFraction: 0,
	wallCutRun: 1
};

export const params = writable<BinParams>({ ...defaultParams });

export const dimensions = derived(params, ($p) => ({
	widthMm: $p.width * 42,
	lengthMm: $p.length * 42,
	heightMm: $p.height * 7
}));

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

// Source-of-truth enum mappings (param value -> URL char). Reverse indices are
// generated, so adding an enum member never requires touching a second table.
const LIP_TO_CHAR = { standard: 's', reduced: 'r', none: 'n' } as const;
const WALL_TO_CHAR = { back: 'b', front: 'f', left: 'l', right: 'r' } as const;

function invert<V extends string, K extends string>(map: Record<K, V>): Record<string, K> {
	return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) as Record<string, K>;
}

const CHAR_TO_LIP = invert(LIP_TO_CHAR);
const CHAR_TO_WALL = invert(WALL_TO_CHAR);

// Per-field codec: short URL key + bidirectional encode/decode. Single source
// of truth — adding a param means adding one entry here (plus the interface).
interface Codec<K extends keyof BinParams> {
	key: string;
	encode: (value: BinParams[K]) => string;
	decode: (raw: string, def: BinParams[K]) => BinParams[K];
}

function num(min: number, max: number, round = false): Codec<'width'> {
	return {
		key: '',
		encode: (v) => String(v),
		decode: (raw, def) => {
			const parsed = parseFloat(raw);
			const base = Number.isNaN(parsed) ? def : parsed;
			return clamp(round ? Math.round(base) : base, min, max);
		}
	};
}

const bool: Omit<Codec<'magnetHoles'>, 'key'> = {
	encode: (v) => (v ? '1' : '0'),
	decode: (raw) => raw === '1'
};

type Codecs = { [K in keyof BinParams]: Codec<K> };

const CODECS: Codecs = {
	width: { ...num(1, 6, true), key: 'w' },
	length: { ...num(1, 6, true), key: 'l' },
	height: { ...num(1, 10, true), key: 'h' },
	wallThickness: { ...num(0.8, 2.0), key: 'wt' },
	magnetHoles: { ...bool, key: 'mh' },
	screwHoles: { ...bool, key: 'sh' },
	stackingLip: {
		key: 'sl',
		encode: (v) => LIP_TO_CHAR[v],
		decode: (raw, def) => CHAR_TO_LIP[raw] ?? def
	},
	labelTab: { ...bool, key: 'lt' },
	dividersX: { ...num(0, 5, true), key: 'dx' },
	dividersY: { ...num(0, 5, true), key: 'dy' },
	lightweightDividers: { ...bool, key: 'ld' },
	scoopWalls: {
		key: 'sw',
		encode: (v) => v.map((w) => WALL_TO_CHAR[w]).join(''),
		decode: (raw) => [...raw].map((c) => CHAR_TO_WALL[c]).filter(Boolean)
	},
	scoopRadius: { ...num(0, 20), key: 'sr' },
	wallCut: { ...bool, key: 'wc' },
	wallCutSide: {
		key: 'wcs',
		encode: (v) => WALL_TO_CHAR[v],
		decode: (raw, def) => CHAR_TO_WALL[raw] ?? def
	},
	wallCutLowFraction: { ...num(0, 0.95), key: 'wcf' },
	wallCutRun: { ...num(0.1, 1), key: 'wcr' }
};

const PARAM_KEYS = Object.keys(CODECS) as (keyof BinParams)[];

export function serializeParams(p: BinParams): URLSearchParams {
	const sp = new URLSearchParams();
	for (const param of PARAM_KEYS) {
		const value = p[param];
		if (value === defaultParams[param]) continue;
		const codec = CODECS[param] as Codec<typeof param>;
		sp.set(codec.key, codec.encode(value));
	}
	return sp;
}

export function deserializeParams(search: URLSearchParams): BinParams {
	const p = { ...defaultParams };
	for (const param of PARAM_KEYS) {
		const codec = CODECS[param] as Codec<typeof param>;
		const raw = search.get(codec.key);
		if (raw === null) continue;
		(p[param] as BinParams[typeof param]) = codec.decode(raw, defaultParams[param]);
	}
	return p;
}
