# Gridfinity Bin Generator — Build Plan

Browser-based parametric Gridfinity bin generator with live 3D preview and STEP/STL export.

## Tech Stack

- **Framework:** SvelteKit + Vite
- **CAD Engine:** [replicad](https://replicad.xyz/) (OpenCascade.js WASM, runs in Web Worker)
- **3D Viewer:** [Threlte](https://threlte.xyz/) (Svelte + Three.js)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel / Cloudflare Pages (static, no backend)

## Gridfinity Spec (from OpenSCAD reference)

- Grid unit: 42mm × 42mm (41.5mm body + 0.5mm tolerance)
- Height unit: 7mm
- Base profile: 0.8mm bottom, 1.8mm + 2.15mm stepped platform
- Stacking lip: specific chamfer profile (~0.7mm × 45° + 1.8mm × 45° + 1.9mm vertical)
- Magnet holes: 6.5mm diameter × 2.4mm deep
- Screw holes: 3mm diameter through base
- Corner radius: 3.75mm outer, 1.6mm inner

**Reference:** [gridfinity-rebuilt-openscad](https://github.com/kennetek/gridfinity-rebuilt-openscad) (MIT) — exact dimensions in `gridfinity-rebuilt-utility.scad`

## Parameters (UI Controls)

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| Width | slider | 1–6 grid units | 2 |
| Length | slider | 1–6 grid units | 1 |
| Height | slider | 1–10 (×7mm) | 3 |
| Dividers X | slider | 0–5 | 0 |
| Dividers Y | slider | 0–5 | 0 |
| Magnet holes | toggle | on/off | off |
| Screw holes | toggle | on/off | off |
| Stacking lip | select | standard/none/reduced | standard |
| Label tab | toggle | on/off | off |
| Wall thickness | slider | 0.8–2.0mm | 1.2mm |

## Architecture

```
src/
├── lib/
│   ├── cad/
│   │   ├── worker.ts          # Web Worker running replicad
│   │   ├── gridfinity.ts      # Parametric bin geometry (replicad API)
│   │   ├── base-profile.ts    # Base/stacking lip profiles
│   │   └── export.ts          # STEP/STL export helpers
│   ├── components/
│   │   ├── Viewer.svelte      # Threlte 3D viewport
│   │   ├── Controls.svelte    # Parameter panel (sliders, toggles)
│   │   ├── ExportBar.svelte   # Download STEP/STL buttons
│   │   └── PresetPicker.svelte # Quick presets (e.g. "4×2 tall")
│   ├── stores/
│   │   └── params.ts          # Svelte store for bin parameters
│   └── presets.ts             # Common bin configurations
├── routes/
│   └── +page.svelte           # Main app layout
└── app.html
```

## Build Phases

### Phase 1 — Scaffold + Basic Bin ✦ MVP ✅

1. ✅ `npx sv create gridfinity-generator` (SvelteKit, TypeScript)
2. ✅ Install deps: `replicad`, `threlte`, `three`, `tailwindcss`, `oxlint`
3. ✅ Set up replicad Web Worker with message passing
4. ✅ Build basic box geometry: single 1×1 bin, no features
5. ✅ Wire Threlte viewer — render mesh from worker output
6. ✅ Add width/length/height inputs → trigger rebuild (150ms debounce)
7. ✅ STEP export button (replicad `blobSTEP()`)
8. ✅ STL export button (replicad `blobSTL()`)

**Goal:** adjustable box with live preview + file download

### Phase 2 — Accurate Gridfinity Profile ✅

1. ✅ Port exact base profile from OpenSCAD spec (lofted stepped platform)
2. ✅ Stacking lip chamfer profile (standard/reduced/none)
3. ✅ Add corner fillets (outer 3.75mm, inner 2.8mm)
4. ✅ Multi-unit grid: repeat base pattern across W×L units
5. Bottom scoop (optional, standard Gridfinity feature)

**Goal:** dimensionally accurate Gridfinity-compatible bins

### Phase 3 — Compartments + Features ✅

1. ✅ Compartment dividers (evenly spaced internal walls, X and Y)
2. ✅ Magnet holes (6.5mm × 2.4mm cylinder subtract at grid corners)
3. ✅ Screw holes (3mm × 6mm cylinder through base)
4. ✅ Label tab (angled surface at front of each compartment)
5. ✅ Wall thickness control (dynamic inner fillet)

**Goal:** fully configurable bins matching commercial generators

### Phase 4 — Polish

1. Presets: "small parts", "tool holder", "deep bin"
2. Dimension overlay on 3D view
3. Print time / filament estimate (based on volume)
4. URL-encoded params (share config via link)
5. Mobile-friendly layout
6. Loading state during geometry rebuild

## Key Technical Decisions

- **Web Worker for replicad** — geometry generation blocks main thread; worker keeps UI responsive
- **Debounce slider input** — 150ms debounce before triggering rebuild (WASM computation ~200-500ms)
- **Mesh transfer** — worker sends triangulated mesh (Float32Array via transferable) to main thread for Three.js
- **STEP export in worker** — replicad serializes BREP to STEP string, main thread creates download blob

## Reference Resources

- [replicad docs](https://replicad.xyz/docs/use-as-a-library/) — library usage
- [replicad studio](https://studio.replicad.xyz/workbench) — prototype geometry code here first
- [Threlte docs](https://threlte.xyz/docs/introduction) — Svelte Three.js
- [gridfinity-rebuilt-openscad](https://github.com/kennetek/gridfinity-rebuilt-openscad) — exact dimensions (MIT)
- [Gridfinity wiki](https://gridfinity.xyz/) — community spec reference
- [gridfinitycreator source](https://github.com/jeroen94704/gridfinitycreator) — CadQuery implementation reference

## Open Questions

- Support custom (non-rectangular) compartment layouts? (Phase 5+)
- Add baseplate generator too or bins only?
- Deploy under custom domain or GitHub Pages?
