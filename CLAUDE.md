# Gridfinity Generator

Browser-based parametric Gridfinity bin generator with live 3D preview and STEP/STL export. Runs entirely client-side using OpenCascade WASM in a Web Worker.

## Project Structure

```
src/
├── lib/
│   ├── cad/
│   │   ├── gridfinity.ts      # Parametric bin geometry (replicad API)
│   │   ├── gridfinity.test.ts  # Geometry unit tests
│   │   ├── worker.ts           # Web Worker: builds mesh, exports STEP/STL
│   │   └── opencascade.d.ts    # WASM type declarations
│   ├── components/
│   │   ├── Viewer.svelte       # Threlte 3D viewport
│   │   ├── Controls.svelte     # Parameter panel (sliders, toggles)
│   │   └── DimensionOverlay.svelte
│   ├── stores/
│   │   └── params.ts           # Svelte store + URL serialization
│   ├── utils/
│   │   └── print-estimate.ts   # Filament/time estimation
│   └── presets.ts              # Common bin configurations
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
- Magnet holes: 6.5mm dia x 2.4mm deep at grid corners
- Screw holes: 3mm dia x 6mm deep
- Hole offset: 8mm from each edge

When modifying geometry, cross-reference constants at top of `gridfinity.ts` against the OpenSCAD reference.

## Geometry Gotchas

- **Fillet failures:** replicad throws when fillet radius exceeds available edge length — always `Math.max(0.2, computed_radius)` as floor
- **Loft vs extrude:** Use `loft({ ruled: true })` for chamfer sections, plain `extrude()` for constant cross-sections. Mixing them up produces wrong profiles.
- **Boolean order matters:** `fuse` before `cut` — cutting from unfused parts can leave geometry artifacts
- **Coordinate system:** Origin is at center of grid footprint. Multi-unit grids offset by `((units - 1) * 42) / 2`
- **Stacking lip:** Female cavity mirrors base profile inverted. The lip offset constants (`LIP_OFFSET_BOTTOM=2.95`, `LIP_OFFSET_MID=0.8`) must match base profile exactly or bins won't stack.
- **Zero-size sketches:** `drawRoundedRectangle` with radius=0 works but produces sharp corners — use it intentionally for divider walls

## Quality Gates

Before committing:

- [ ] `npm run test` — all unit tests pass
- [ ] `npm run check` — Svelte type checking passes
- [ ] `npm run lint` — oxlint clean
- [ ] Visual check in browser — 3D preview renders without artifacts
- [ ] For geometry changes: verify dimensions match Gridfinity spec

## Deployment Constraints

- **Static only:** No server-side code. Everything runs client-side (WASM + Worker)
- **Mobile:** Must work on mobile browsers. WASM memory is limited — avoid holding multiple Solid instances simultaneously
- **Bundle size:** OpenCascade WASM binary is ~15MB. Loaded async in worker, not blocking initial render
- **WASM format:** Worker uses ES module format (`worker: { format: 'es' }` in vite config). Assets include `*.wasm` files (`assetsInclude: ['**/*.wasm']`)

## Anti-Patterns

- **Don't skip visual verification** — unit tests verify geometry builds without error, but visual correctness requires checking the 3D preview
- **Don't modify spec constants** without cross-referencing the OpenSCAD source — wrong dimensions break Gridfinity compatibility
- **Don't create Solid objects on main thread** — all replicad/OpenCascade calls must happen in the worker
- **Don't hold references to transferred buffers** — after `postMessage` with transfer list, the source ArrayBuffer is detached
- **Don't add non-geometry imports to `gridfinity.ts`** — it runs in worker context, no DOM/Svelte APIs available
