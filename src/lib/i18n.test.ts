import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

interface MockStorage {
	value: string | null;
	getItem: ReturnType<typeof vi.fn<(key: string) => string | null>>;
	setItem: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
}

interface LoadOptions {
	getThrows?: boolean;
	setThrows?: boolean;
}

async function loadI18n(browser: boolean, stored: string | null = null, options: LoadOptions = {}) {
	vi.resetModules();
	vi.doMock('$app/environment', () => ({ browser }));

	const storage: MockStorage = {
		value: stored,
		getItem: vi.fn<(key: string) => string | null>(() => {
			if (options.getThrows) throw new DOMException('blocked', 'SecurityError');
			return storage.value;
		}),
		setItem: vi.fn<(key: string, value: string) => void>((_, value) => {
			if (options.setThrows) throw new DOMException('blocked', 'SecurityError');
			storage.value = value;
		})
	};
	const documentElement = { lang: '' };

	vi.stubGlobal('localStorage', storage);
	vi.stubGlobal('document', { documentElement });

	return {
		mod: await import('./i18n'),
		storage,
		documentElement
	};
}

afterEach(() => {
	vi.doUnmock('$app/environment');
	vi.unstubAllGlobals();
});

describe('i18n language store', () => {
	it('defaults to Polish during server rendering', async () => {
		const { mod } = await loadI18n(false);

		expect(get(mod.language)).toBe('pl');
	});

	it('restores and persists a supported browser language', async () => {
		const { mod, storage, documentElement } = await loadI18n(true, 'en');

		expect(get(mod.language)).toBe('en');
		expect(storage.getItem).toHaveBeenCalledWith('gridfinity-language');
		expect(storage.setItem).toHaveBeenCalledWith('gridfinity-language', 'en');
		expect(documentElement.lang).toBe('en');

		mod.language.set('pl');

		expect(storage.setItem).toHaveBeenLastCalledWith('gridfinity-language', 'pl');
		expect(documentElement.lang).toBe('pl');
	});

	it('falls back to Polish for an unsupported stored language', async () => {
		const { mod, storage, documentElement } = await loadI18n(true, 'de');

		expect(get(mod.language)).toBe('pl');
		expect(storage.setItem).toHaveBeenCalledWith('gridfinity-language', 'pl');
		expect(documentElement.lang).toBe('pl');
	});

	it('falls back to Polish when reading local storage throws', async () => {
		const { mod, storage, documentElement } = await loadI18n(true, null, { getThrows: true });

		expect(get(mod.language)).toBe('pl');
		expect(storage.getItem).toHaveBeenCalledWith('gridfinity-language');
		expect(documentElement.lang).toBe('pl');
	});

	it('keeps the UI language when writing local storage throws', async () => {
		const { mod, storage, documentElement } = await loadI18n(true, 'pl', { setThrows: true });

		expect(get(mod.language)).toBe('pl');
		expect(storage.setItem).toHaveBeenCalledWith('gridfinity-language', 'pl');
		expect(documentElement.lang).toBe('pl');

		mod.language.set('en');

		expect(get(mod.language)).toBe('en');
		expect(documentElement.lang).toBe('en');
	});

	it('provides English and Polish UI copy', async () => {
		const { mod } = await loadI18n(false);

		expect(mod.text.en.language).toBe('Language');
		expect(mod.text.pl.language).toBe('Język');
		expect(mod.text.pl.magnetHoles).toBe('Otwory na magnesy');
		expect(mod.text.en.increase).toBe('Increase');
		expect(mod.text.pl.decrease).toBe('Zmniejsz');
	});
});
