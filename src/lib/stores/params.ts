import { writable, derived } from 'svelte/store';

export interface BinParams {
	width: number;
	length: number;
	height: number;
	wallThickness: number;
	magnetHoles: boolean;
	// Restrict magnet holes to the bin's 4 outer corners instead of every tile.
	magnetCornersOnly: boolean;
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
	// Per-divider positions as fractions (0..1) across the interior, measured from
	// the low wall. Optional: absent or length≠count means even spacing (the
	// default until a divider is dragged in the 3D view).
	dividerPosX?: number[] | undefined;
	dividerPosY?: number[] | undefined;
}

export const defaultParams: BinParams = {
	width: 2,
	length: 1,
	height: 3,
	wallThickness: 1.2,
	magnetHoles: false,
	magnetCornersOnly: false,
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

function num(min: number, max: number, round = false): Omit<Codec<'width'>, 'key'> {
	return {
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

// Divider position arrays: each fraction encoded as an integer 0..1000, joined by
// '.', e.g. [0.25, 0.6] -> "250.600". Compact and URL-safe.
function fracsEncode(v: number[] | undefined): string {
	return (v ?? []).map((f) => Math.round(clamp(f, 0, 1) * 1000)).join('.');
}
function fracsDecode(raw: string): number[] {
	return raw
		? raw
				.split('.')
				.map((s) => clamp(parseInt(s, 10) / 1000, 0, 1))
				.filter((x) => !Number.isNaN(x))
		: [];
}

// -? strips the optional modifier so every param (incl. the optional position
// arrays) is guaranteed a codec — keeps CODECS[param] non-undefined.
type Codecs = { [K in keyof BinParams]-?: Codec<K> };

const CODECS: Codecs = {
	width: { ...num(1, 6, true), key: 'w' },
	length: { ...num(1, 6, true), key: 'l' },
	height: { ...num(1, 10, true), key: 'h' },
	wallThickness: { ...num(0.8, 2.0), key: 'wt' },
	magnetHoles: { ...bool, key: 'mh' },
	magnetCornersOnly: { ...bool, key: 'mc' },
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
		decode: (raw) => Array.from(raw, (c) => CHAR_TO_WALL[c]).filter((w): w is NonNullable<typeof w> => w !== undefined)
	},
	scoopRadius: { ...num(0, 20), key: 'sr' },
	wallCut: { ...bool, key: 'wc' },
	wallCutSide: {
		key: 'wcs',
		encode: (v) => WALL_TO_CHAR[v],
		decode: (raw, def) => CHAR_TO_WALL[raw] ?? def
	},
	wallCutLowFraction: { ...num(0, 0.95), key: 'wcf' },
	wallCutRun: { ...num(0.1, 1), key: 'wcr' },
	dividerPosX: { key: 'px', encode: fracsEncode, decode: (raw) => fracsDecode(raw) },
	dividerPosY: { key: 'py', encode: fracsEncode, decode: (raw) => fracsDecode(raw) }
};

const PARAM_KEYS = Object.keys(CODECS) as (keyof BinParams)[];

// Generic helpers preserve the per-field link between a param key and its codec.
// Inside a single type parameter K, `CODECS[param]` is `Codec<K>`, so encode's
// argument and decode's result line up with `BinParams[K]` — no casts needed.
function encodeField<K extends keyof BinParams>(p: BinParams, param: K): string {
	// Indexing the mapped type with a generic key widens to a union of codecs;
	// re-narrow to Codec<K> so encode's argument lines up with BinParams[K].
	const codec = CODECS[param] as unknown as Codec<K>;
	return codec.encode(p[param]);
}

function decodeField<K extends keyof BinParams>(p: BinParams, param: K, raw: string): void {
	const codec = CODECS[param] as unknown as Codec<K>;
	p[param] = codec.decode(raw, defaultParams[param]);
}

export function serializeParams(p: BinParams): URLSearchParams {
	const sp = new URLSearchParams();
	for (const param of PARAM_KEYS) {
		if (p[param] === defaultParams[param]) continue;
		sp.set(CODECS[param].key, encodeField(p, param));
	}
	return sp;
}

export function deserializeParams(search: URLSearchParams): BinParams {
	const p = { ...defaultParams };
	for (const param of PARAM_KEYS) {
		const raw = search.get(CODECS[param].key);
		if (raw === null) continue;
		decodeField(p, param, raw);
	}
	return p;
}

// ---------------------------------------------------------------------------
// Baseplate (drawer-insert) generator — a second top-level mode. A baseplate is
// the grid bins drop into; it auto-splits into printer-bed-sized tiles joined by
// dovetails, in magnet or simple (no-hole) styles. Kept structurally separate
// from BinParams so the bin flow is untouched.
// ---------------------------------------------------------------------------

export type AppMode = 'bin' | 'baseplate';
export type Align = 'low' | 'center' | 'high';

export interface BaseplateParams {
	drawerWidth: number; // mm — interior drawer width to fill
	drawerDepth: number; // mm — interior drawer depth to fill
	alignX: Align; // how leftover (skirt) margin is distributed in X
	alignY: Align;
	style: 'simple' | 'magnet'; // magnet => corner magnet pockets
	screwHoles: boolean; // extra M3 pockets (magnet style only)
	bedWidth: number; // mm — printer bed size, the split target
	bedDepth: number;
	splitAlgorithm: 'ideal' | 'incremental';
	connector: 'none' | 'filament' | 'dovetail' | 'screw'; // how split tiles join (no-op when a single tile)
	exportLayout: 'zip' | 'combined'; // multi-tile STL delivery
}

export const defaultBaseplate: BaseplateParams = {
	drawerWidth: 336,
	drawerDepth: 252,
	alignX: 'center',
	alignY: 'center',
	style: 'magnet',
	screwHoles: false,
	bedWidth: 220,
	bedDepth: 220,
	splitAlgorithm: 'ideal',
	connector: 'filament',
	exportLayout: 'zip'
};

export const mode = writable<AppMode>('bin');
export const baseplateParams = writable<BaseplateParams>({ ...defaultBaseplate });

export const baseplateGrid = derived(baseplateParams, ($b) => ({
	cols: Math.max(1, Math.floor($b.drawerWidth / 42)),
	rows: Math.max(1, Math.floor($b.drawerDepth / 42))
}));

const ALIGN_TO_CHAR = { low: 'l', center: 'c', high: 'h' } as const;
const STYLE_TO_CHAR = { simple: 's', magnet: 'm' } as const;
const ALGO_TO_CHAR = { ideal: 'i', incremental: 'n' } as const;
const LAYOUT_TO_CHAR = { zip: 'z', combined: 'c' } as const;
const CONNECTOR_TO_CHAR = { none: 'n', filament: 'f', dovetail: 'd', screw: 's' } as const;
const CHAR_TO_ALIGN = invert(ALIGN_TO_CHAR);
const CHAR_TO_STYLE = invert(STYLE_TO_CHAR);
const CHAR_TO_ALGO = invert(ALGO_TO_CHAR);
const CHAR_TO_LAYOUT = invert(LAYOUT_TO_CHAR);
const CHAR_TO_CONNECTOR = invert(CONNECTOR_TO_CHAR);

type BpCodec<K extends keyof BaseplateParams> = {
	key: string;
	encode: (value: BaseplateParams[K]) => string;
	decode: (raw: string, def: BaseplateParams[K]) => BaseplateParams[K];
};
type BpCodecs = { [K in keyof BaseplateParams]-?: BpCodec<K> };

// Baseplate URL keys are chosen to never collide with the bin keys above, so a
// single URLSearchParams can hold either set unambiguously.
const BP_CODECS: BpCodecs = {
	drawerWidth: { ...num(42, 2000, true), key: 'dw' },
	drawerDepth: { ...num(42, 2000, true), key: 'dd' },
	alignX: { key: 'ax', encode: (v) => ALIGN_TO_CHAR[v], decode: (raw, def) => CHAR_TO_ALIGN[raw] ?? def },
	alignY: { key: 'ay', encode: (v) => ALIGN_TO_CHAR[v], decode: (raw, def) => CHAR_TO_ALIGN[raw] ?? def },
	style: { key: 'st', encode: (v) => STYLE_TO_CHAR[v], decode: (raw, def) => CHAR_TO_STYLE[raw] ?? def },
	screwHoles: { ...bool, key: 'bsh' },
	bedWidth: { ...num(42, 1000, true), key: 'bw' },
	bedDepth: { ...num(42, 1000, true), key: 'bd' },
	splitAlgorithm: { key: 'sa', encode: (v) => ALGO_TO_CHAR[v], decode: (raw, def) => CHAR_TO_ALGO[raw] ?? def },
	connector: { key: 'cn', encode: (v) => CONNECTOR_TO_CHAR[v], decode: (raw, def) => CHAR_TO_CONNECTOR[raw] ?? def },
	exportLayout: { key: 'el', encode: (v) => LAYOUT_TO_CHAR[v], decode: (raw, def) => CHAR_TO_LAYOUT[raw] ?? def }
};

const BP_KEYS = Object.keys(BP_CODECS) as (keyof BaseplateParams)[];

function bpEncode<K extends keyof BaseplateParams>(p: BaseplateParams, param: K): string {
	const codec = BP_CODECS[param] as unknown as BpCodec<K>;
	return codec.encode(p[param]);
}
function bpDecode<K extends keyof BaseplateParams>(p: BaseplateParams, param: K, raw: string): void {
	const codec = BP_CODECS[param] as unknown as BpCodec<K>;
	p[param] = codec.decode(raw, defaultBaseplate[param]);
}

function serializeBaseplate(p: BaseplateParams): URLSearchParams {
	const sp = new URLSearchParams();
	for (const param of BP_KEYS) {
		if (p[param] === defaultBaseplate[param]) continue;
		sp.set(BP_CODECS[param].key, bpEncode(p, param));
	}
	return sp;
}

function deserializeBaseplate(search: URLSearchParams): BaseplateParams {
	const p = { ...defaultBaseplate };
	for (const param of BP_KEYS) {
		const raw = search.get(BP_CODECS[param].key);
		if (raw === null) continue;
		bpDecode(p, param, raw);
	}
	return p;
}

// Combined (de)serialization: a single `m` marker selects the active mode; only
// that mode's params are written, so existing bin-only URLs stay byte-identical.
export function serializeAll(m: AppMode, bin: BinParams, bp: BaseplateParams): URLSearchParams {
	if (m === 'baseplate') {
		const sp = serializeBaseplate(bp);
		sp.set('m', 'bp');
		return sp;
	}
	return serializeParams(bin);
}

export function deserializeAll(search: URLSearchParams): { mode: AppMode; bin: BinParams; baseplate: BaseplateParams } {
	return {
		mode: search.get('m') === 'bp' ? 'baseplate' : 'bin',
		bin: deserializeParams(search),
		baseplate: deserializeBaseplate(search)
	};
}
