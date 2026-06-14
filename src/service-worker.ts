/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

// SvelteKit auto-registers this worker in production builds. Strategy:
// - App shell (hashed JS/CSS + static files) is precached on install so repeat
//   visits and offline navigations are instant.
// - The ~4.6 MB gzipped OpenCascade WASM is the dominant payload. It is NOT
//   precached (that would re-download it on every deploy); instead it is cached
//   on first fetch in a version-independent cache. Because the asset URL is
//   content-hashed, an unchanged engine keeps its URL across deploys and is
//   served from cache — no repeat download.

const sw = self as unknown as ServiceWorkerGlobalScope;

const APP_CACHE = `app-${version}`;
const WASM_CACHE = 'opencascade-wasm';

// Static host control files that are consumed by the platform, not served as
// fetchable assets — requesting them 404s on Cloudflare Pages / Netlify.
const NON_SERVED = new Set(['/_headers', '/_redirects']);

// Precache the app shell. The WASM is not part of `build`/`files` (it is a
// worker asset), so the `.wasm` filter is belt-and-suspenders; the real reason
// it stays out of the precache is that it is cached lazily on first fetch.
const APP_ASSETS = [...build, ...files].filter(
	(path) => !path.endsWith('.wasm') && !NON_SERVED.has(path)
);

const APP_ASSET_SET = new Set(APP_ASSETS);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(APP_CACHE);
			// Per-asset add so a single 404 can't abort the whole install (unlike addAll).
			await Promise.allSettled(APP_ASSETS.map((path) => cache.add(path)));
		})()
	);
});

// No skipWaiting/clients.claim: the new worker waits until open tabs close before
// activating, so deleting the previous version's cache here can't 404 a hashed
// asset that a still-running old client lazy-loads after a deploy.
sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== APP_CACHE && key !== WASM_CACHE) await caches.delete(key);
			}
		})()
	);
});

async function cacheFirst(cacheName: string, request: Request): Promise<Response> {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) await cache.put(request, response.clone());
	return response;
}

sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	if (url.origin !== sw.location.origin) return; // only manage our own assets

	if (url.pathname.endsWith('.wasm')) {
		event.respondWith(cacheFirst(WASM_CACHE, event.request));
		return;
	}
	if (APP_ASSET_SET.has(url.pathname)) {
		event.respondWith(cacheFirst(APP_CACHE, event.request));
	}
});
