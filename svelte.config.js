import adapter from '@sveltejs/adapter-static';
import { relative, sep } from 'node:path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, except for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	kit: {
		// Fully client-side app (WASM + Worker, no backend) — emit a static
		// bundle so it serves from nginx in Docker as well as Vercel/Cloudflare.
		// fallback gives SPA routing for any non-prerendered path.
		adapter: adapter({ fallback: 'index.html', strict: false })
	}
};

export default config;
