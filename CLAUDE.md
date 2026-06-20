# Gridfinity Generator

Browser-based parametric Gridfinity bin generator with live 3D preview and STEP/STL export. Runs entirely client-side using OpenCascade WASM in a Web Worker.

## Project Structure

```
src/
├── lib/
│   ├── cad/
│   │   ├── gridfinity.ts      # Parametric bin geometry (replicad API)
│   │   ├── gridfinity.test.ts  # Geometry unit tests
│   │   ├── manifold-bin.ts     # Fast bin geometry + shared manifold primitives
│   │   ├── bin-split.ts        # Pure bin print-in-parts math (engine-free, tested)
│   │   ├── bin-split-manifold.ts # Splits the full bin into bed-sized pieces (manifold)
│   │   ├── baseplate-layout.ts # Pure tile-split/dovetail/skirt math (engine-free, tested)
│   │   ├── baseplate-manifold.ts # Baseplate preview + STL (manifold), uses manifold-bin prims
│   │   ├── baseplate-occt.ts   # Baseplate STEP (replicad, lazy), reuses gridfinity buildUnitBase
│   │   ├── worker.ts           # Web Worker: builds mesh, exports STEP/STL (bin + baseplate)
│   │   └── opencascade.d.ts    # WASM type declarations
│   ├── components/
│   │   ├── Viewer.svelte       # Threlte 3D viewport (overlays bin-mode only)
│   │   ├── Controls.svelte     # Bin/Baseplate mode toggle + bin parameter panel
│   │   ├── BaseplateControls.svelte # Drawer/bed/style/tiling panel
│   │   └── DimensionOverlay.svelte
│   ├── stores/
│   │   └── params.ts           # BinParams + BaseplateParams stores, mode, URL serialization
│   ├── utils/
│   │   └── print-estimate.ts   # Filament/time estimation
│   └── presets.ts              # Common bin + baseplate configurations
├── routes/
│   ├── +page.svelte            # Main app layout
│   └── +layout.svelte
e2e/
└── app.test.ts                 # Playwright e2e tests
```

## Tech Stack

- **Framework:** SvelteKit (Svelte 5 runes mode) + Vite 8
- **CAD Engine:** replicad (OpenCascade.js WASM, runs in Web Worker)
- **3D Viewer:** Threlte (Svelte + Three.js)
- **Styling:** Tailwind CSS v4
- **Testing:** Vitest (unit), Playwright (e2e)
- **Linting:** oxlint
- **Runtime:** Node 24 (via mise)
- **Deployment:** Static (no backend) — Vercel / Cloudflare Pages

## Common Commands

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run check            # Svelte type checking
npm run lint             # oxlint ./src
npm run test             # Vitest unit tests
npm run test:watch       # Vitest watch mode
npm run test:coverage    # Vitest with v8 coverage
npm run test:e2e         # Playwright e2e (builds first)
```

## Development Workflow

### Adding a New Bin Parameter

1. Add field to `BinParams` interface in `src/lib/stores/params.ts`
2. Set default value in `defaultParams`
3. Add URL serialization key in `URL_KEYS`, `serializeParams`, `deserializeParams`
4. Write unit tests in `src/lib/cad/gridfinity.test.ts` for the geometry
5. Implement geometry in `src/lib/cad/gridfinity.ts` — `buildBin()` orchestrates all features
6. Add UI control in `src/lib/components/Controls.svelte`
7. Update presets in `src/lib/presets.ts` if relevant
8. Verify 3D preview renders correctly in browser

### Adding a New Preset

1. Add entry to `presets` array in `src/lib/presets.ts`
2. Provide all `BinParams` fields (no partial — full object required)
3. Add test case in `src/lib/presets.test.ts`

### TDD Workflow (Primary)

1. Write failing test for new geometry behavior in `gridfinity.test.ts`
2. Implement in `gridfinity.ts` until test passes
3. Run `npm run test` to verify
4. Check visual correctness in browser (`npm run dev`)
5. Run full suite: `npm run check && npm run test && npm run lint`

## Architecture: Worker Message Passing

The CAD engine runs in a Web Worker to keep UI responsive.

**Request types:** `build` (mesh), `exportSTEP`, `exportSTL`
**Response types:** `mesh` (Float32Array vertices/normals + Uint32Array triangles + edges), `exportSTEP`/`exportSTL` (Blob), `error`, `ready`

- Worker initializes WASM on load, signals `ready`
- Mesh data uses transferable buffers for zero-copy
- 150ms debounce on slider input before triggering rebuild
- WASM computation typically 200-500ms per rebuild

## Gridfinity Spec Reference

From [gridfinity-rebuilt-openscad](https://github.com/kennetek/gridfinity-rebuilt-openscad) (MIT):

- Grid unit: 42mm x 42mm (41.5mm body + 0.5mm tolerance)
- Height unit: 7mm
- Base profile: 4-level lofted platform (0→0.8→2.6→4.75mm)
- Corner radius: 3.75mm outer
- Stacking lip: protrudes above nominal — total Z = units×7 + 3.551mm (lip sits on top, not absorbed)
- Magnet holes: 6.5mm dia x 2.4mm deep at grid corners
- Screw holes: 3mm dia x 6mm deep
- Hole offset: 8mm from each edge

When modifying geometry, cross-reference constants at top of `gridfinity.ts` against the OpenSCAD reference.

## Geometry Gotchas

- **Fillet failures:** replicad throws when fillet radius exceeds available edge length — always `Math.max(0.2, computed_radius)` as floor
- **Loft vs extrude:** Use `loft({ ruled: true })` for chamfer sections, plain `extrude()` for constant cross-sections. Mixing them up produces wrong profiles.
- **Boolean order matters:** `fuse` before `cut` — cutting from unfused parts can leave geometry artifacts
- **Coordinate system:** Origin is at center of grid footprint. Multi-unit grids offset by `((units - 1) * 42) / 2`
- **Stacking lip:** Female cavity mirrors base profile inverted. The lip offset constants (`LIP_OFFSET_BOTTOM=2.95`, `LIP_OFFSET_MID=0.8`) must match base profile exactly or bins won't stack. The lip **protrudes above** `height×7` (`STACKING_LIP_PROTRUSION=3.551`): a lipped bin's total Z is `units×7 + 3.551`. Wall fills the nominal height; the lip base overlaps the rim ~1.2mm as support. Both geometry paths (`manifold-bin.ts` STL + `gridfinity.ts` STEP) must change together.
- **Zero-size sketches:** `drawRoundedRectangle` with radius=0 works but produces sharp corners — use it intentionally for divider walls
- **Bin splitting (print-in-parts):** an oversized bin (only X/Y can exceed a bed — height caps ~73.5mm) is cut into bed-sized pieces along internal grid lines. Strategy: build the full bin once (`buildBinManifold`), then `intersect` it with a per-piece clip box — pieces are **flush** (glue the cut faces), so nothing is added/removed and the pieces' total volume equals the whole bin's (a tested invariant). Split math lives in the engine-free `bin-split.ts` (reuses `baseplate-layout.ts`'s `tileSpans`); geometry in `bin-split-manifold.ts` (preview explodes pieces by a small gap so seams show; STL zip/combined). Opt-in via `BinParams.splitToFit` — the default bin flow is untouched. **STL only**: the OCCT/STEP path (`gridfinity.ts`) still exports the whole bin.
- **Baseplate sockets:** The receiving socket is the bin foot (`unitBase()`/`buildUnitBase()`) subtracted from the plate top, flush at top. Plates are **skeletonized** (each cell floor opened through the plate — the canonical gridfinity-rebuilt look, far less filament); the magnet style preserves scalloped corner pads inside the opening (full-height, `MAGNET_BOSS_R`) and the **magnet pocket opens upward from the cavity floor** (`socketZ`), facing the bin foot's magnet — NOT downward. Both baseplate paths (`baseplate-manifold.ts` STL/preview + `baseplate-occt.ts` STEP) must change together, and the tile/seam/skirt math lives in the engine-free `baseplate-layout.ts` (the single tested source; it emits generic `Seam`s, geometry turns them into the chosen connector). Tiles use square corners (r=0) so they butt seamlessly. Connectors (`BaseplateParams.connector`): `filament` (default — Ø1.8 horizontal holes for a 1.75mm filament-scrap dowel pin, placed LOW (`FIL_Z`) in the existing seam floor so NO rib is added and the grid surface stays clean cells), `screw` (a solid seam rail `pinRail` + horizontal M3 holes at mid-height, gridfinity-rebuilt style — has visible seam walls), `dovetail` (small in-plane snap-tabs in the rim), or `none`. Filament keeps the seam clean; only `screw` adds a visible rib (M3 needs the meat). Filament suits thicker (magnet) plates; thin simple plates have little floor below the profile.

## Quality Gates

Before committing:

- [ ] `npm run test` — all unit tests pass
- [ ] `npm run check` — Svelte type checking passes
- [ ] `npm run lint` — oxlint clean
- [ ] Visual check in browser — 3D preview renders without artifacts
- [ ] For geometry changes: verify dimensions match Gridfinity spec
- [ ] `reference-parity.test.ts` passes — cross-checks exported STL bbox/volume against committed gridfinity-rebuilt reference (refresh fixtures via `scripts/refresh-reference-fixtures.mjs`)

CI runs `lint` → `check` → tests → build → e2e (`.github/workflows/ci.yml`). Lint fails on any warning (`--max-warnings 0`).

### Strictness Config

- **TS:** `tsconfig.json` enables full `strict` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`. In tight mesh/geometry loops over typed arrays, indexed reads are `T|undefined` — read once into a local `const x = arr[i]!` (provably in-bounds by loop construction); never add `@ts-ignore`.
- **oxlint** (`.oxlintrc.json`, JSONC — comments allowed): `correctness`=error, `suspicious`=warn, plugins `typescript/unicorn/import/promise/oxc`. Test files get a `vitest` override (`no-focused-tests`, `no-disabled-tests`, `no-identical-title`, `valid-expect`) so a committed `.only` fails CI. Rules disabled as false positives for this architecture — do NOT re-enable or "fix" their sites:
  - `unicorn/require-post-message-target-origin` — Web Worker `postMessage`'s 2nd arg is the transfer list, not an origin; the autofix corrupts transferables.
  - `import/no-unassigned-import` — CSS side-effect imports (`import '../app.css'`) are intentional.
  - `unicorn/require-module-specifiers` — `export {}` is the canonical module marker in `app.d.ts`; its autofix produces invalid syntax.
  - `typescript/no-unsafe-type-assertion` — replicad/OCCT's fluent API returns broad base types; `as Solid`/`as Sketch` narrowing casts are unavoidable (type-aware only).
  - `typescript/no-unnecessary-type-parameters` — the single-use generic in `encode/decodeField` deliberately links a param key to its codec type (type-aware only).
- **Type-aware lint** (`npm run lint:types`): `oxlint --type-aware` via `oxlint-tsgolint` (TS7 engine). Catches `no-floating-promises`, `no-misused-promises`, etc. Alpha — kept out of CI for now; run locally. Errors fail; it currently emits ~11 advisory `no-unnecessary-type-assertion` warnings on replicad casts (TS7 disagrees with the TS6 `check` gate — don't remove the casts, they keep `npm run check` green).

## Deployment Constraints

- **Static only:** No server-side code. Everything runs client-side (WASM + Worker)
- **Mobile:** Must work on mobile browsers. WASM memory is limited — avoid holding multiple Solid instances simultaneously
- **Bundle size:** OpenCascade WASM binary is ~15MB raw (~4.6MB gzipped) — ~85% of the client payload. Loaded async in worker, not blocking initial render
- **WASM format:** Worker uses ES module format (`worker: { format: 'es' }` in vite config). Assets include `*.wasm` files (`assetsInclude: ['**/*.wasm']`)
- **WASM loading strategy:** The WASM is imported via `?url` (`worker.ts`), so Vite emits it as a content-hashed immutable asset under `/_app/immutable`. Caching layers:
  - **HTTP:** `static/_headers` sets `Cache-Control: immutable, max-age=1y` for `/_app/immutable/*` and `*.wasm` (Cloudflare Pages / Netlify; Vercel applies immutable headers to `/_app/immutable` automatically)
  - **Service worker** (`src/service-worker.ts`, auto-registered in prod): precaches the app shell on install; caches the WASM on first fetch in a version-independent `opencascade-wasm` cache. Because the URL is content-hashed, an unchanged engine survives deploys with no re-download. First visit is unchanged; repeat visits and offline navigations are instant
  - **Don't precache the WASM on SW install** — that re-downloads ~4.6MB on every deploy. Cache it lazily on first fetch instead

## Anti-Patterns

- **Don't skip visual verification** — unit tests verify geometry builds without error, but visual correctness requires checking the 3D preview
- **Don't modify spec constants** without cross-referencing the OpenSCAD source — wrong dimensions break Gridfinity compatibility
- **Don't create Solid objects on main thread** — all replicad/OpenCascade calls must happen in the worker
- **Don't hold references to transferred buffers** — after `postMessage` with transfer list, the source ArrayBuffer is detached
- **Don't add non-geometry imports to `gridfinity.ts`** — it runs in worker context, no DOM/Svelte APIs available
