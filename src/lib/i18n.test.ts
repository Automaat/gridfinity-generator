import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

interface MockStorage {
	value: string | null;
	getItem: ReturnType<typeof vi.fn<(key: string) => string | null>>;
	setItem: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
}

async function loadI18n(browser: boolean, stored: string | null = null) {
	vi.resetModules();
	vi.doMock('$app/environment', () => ({ browser }));

	const storage: MockStorage = {
		value: stored,
		getItem: vi.fn<(key: string) => string | null>(() => storage.value),
		setItem: vi.fn<(key: string, value: string) => void>((_, value) => {
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
	it('defaults to English during server rendering', async () => {
		const { mod } = await loadI18n(false);

		expect(get(mod.language)).toBe('en');
	});

	it('restores and persists a supported browser language', async () => {
		const { mod, storage, documentElement } = await loadI18n(true, 'pl');

		expect(get(mod.language)).toBe('pl');
		expect(storage.getItem).toHaveBeenCalledWith('gridfinity-language');
		expect(storage.setItem).toHaveBeenCalledWith('gridfinity-language', 'pl');
		expect(documentElement.lang).toBe('pl');

		mod.language.set('en');

		expect(storage.setItem).toHaveBeenLastCalledWith('gridfinity-language', 'en');
		expect(documentElement.lang).toBe('en');
	});

	it('falls back to English for an unsupported stored language', async () => {
		const { mod, storage, documentElement } = await loadI18n(true, 'de');

		expect(get(mod.language)).toBe('en');
		expect(storage.setItem).toHaveBeenCalledWith('gridfinity-language', 'en');
		expect(documentElement.lang).toBe('en');
	});

	it('provides English and Polish UI copy', async () => {
		const { mod } = await loadI18n(false);

		expect(mod.text.en.language).toBe('Language');
		expect(mod.text.pl.language).toBe('Język');
		expect(mod.text.pl.magnetHoles).toBe('Otwory na magnesy');
	});
});
