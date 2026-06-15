// Extracts the render mesh (positions, normals, feature edges) from a manifold-3d
// solid in the worker's typed-array format. Pure manifold — no OpenCascade.
//
// Normals are computed in JS rather than via manifold's `calculateNormals`, which
// is ~99% of extraction cost (6×6 bin: ~600ms vs ~25ms here). One getMesh and one
// face-normal pass feed both the (angle-split) normals and the feature edges.
import type { Manifold } from 'manifold-3d';

export interface BinMesh {
	vertices: Float32Array;
	triangles: Uint32Array;
	normals: Float32Array;
	edges: Float32Array;
}

// Faces meeting at less than `sharpAngleDeg` are averaged (smooth cylinders);
// sharper joints stay flat (crisp chamfers/corners). Output is non-indexed so each
// triangle corner carries its own normal. `edgeAngleDeg` selects the wireframe.
export function manifoldToMesh(
	solid: Manifold,
	{ sharpAngleDeg = 30, edgeAngleDeg = 25 }: { sharpAngleDeg?: number; edgeAngleDeg?: number } = {}
): BinMesh {
	const geo = solid.getMesh();
	const np = geo.numProp;
	const vp = geo.vertProperties;
	const tri = geo.triVerts;
	const nv = vp.length / np;
	const nTri = tri.length / 3;
	const px = (i: number) => vp[i * np];
	const py = (i: number) => vp[i * np + 1];
	const pz = (i: number) => vp[i * np + 2];

	// Per-face normals (shared by normal-averaging and edge detection).
	const fnx = new Float32Array(nTri);
	const fny = new Float32Array(nTri);
	const fnz = new Float32Array(nTri);
	for (let f = 0; f < nTri; f++) {
		const a = tri[3 * f], b = tri[3 * f + 1], c = tri[3 * f + 2];
		const ux = px(b) - px(a), uy = py(b) - py(a), uz = pz(b) - pz(a);
		const vx = px(c) - px(a), vy = py(c) - py(a), vz = pz(c) - pz(a);
		const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		const len = Math.hypot(nx, ny, nz) || 1;
		fnx[f] = nx / len;
		fny[f] = ny / len;
		fnz[f] = nz / len;
	}

	// Vertex → adjacent faces, in CSR form (offsets + flat adjacency array).
	const offsets = new Uint32Array(nv + 1);
	for (let t = 0; t < tri.length; t++) offsets[tri[t] + 1]++;
	for (let i = 0; i < nv; i++) offsets[i + 1] += offsets[i];
	const adj = new Uint32Array(tri.length);
	const cursor = offsets.slice(0, nv);
	for (let f = 0; f < nTri; f++) {
		for (let k = 0; k < 3; k++) adj[cursor[tri[3 * f + k]]++] = f;
	}

	const cosSharp = Math.cos((sharpAngleDeg * Math.PI) / 180);
	const vertices = new Float32Array(nTri * 9);
	const normals = new Float32Array(nTri * 9);
	const triangles = new Uint32Array(nTri * 3);
	for (let f = 0; f < nTri; f++) {
		const fx = fnx[f], fy = fny[f], fz = fnz[f];
		for (let k = 0; k < 3; k++) {
			const v = tri[3 * f + k];
			let nx = 0, ny = 0, nz = 0;
			for (let j = offsets[v]; j < offsets[v + 1]; j++) {
				const g = adj[j];
				if (fx * fnx[g] + fy * fny[g] + fz * fnz[g] > cosSharp) {
					nx += fnx[g];
					ny += fny[g];
					nz += fnz[g];
				}
			}
			const len = Math.hypot(nx, ny, nz) || 1;
			const o = (f * 3 + k) * 3;
			vertices[o] = px(v);
			vertices[o + 1] = py(v);
			vertices[o + 2] = pz(v);
			normals[o] = nx / len;
			normals[o + 1] = ny / len;
			normals[o + 2] = nz / len;
			triangles[f * 3 + k] = f * 3 + k;
		}
	}

	const edges = computeFeatureEdges(nv, nTri, tri, px, py, pz, fnx, fny, fnz, edgeAngleDeg);
	return { vertices, triangles, normals, edges };
}

// Binary STL straight from a manifold solid — no replicad/OCCT. manifold output
// is always a watertight 2-manifold, so the STL is valid by construction.
export function manifoldToStlBlob(solid: Manifold): Blob {
	const mesh = solid.getMesh();
	const np = mesh.numProp;
	const vp = mesh.vertProperties;
	const tri = mesh.triVerts;
	const nTri = tri.length / 3;
	const buf = new ArrayBuffer(84 + nTri * 50);
	const dv = new DataView(buf);
	dv.setUint32(80, nTri, true);
	let o = 84;
	for (let f = 0; f < nTri; f++) {
		const a = tri[3 * f] * np, b = tri[3 * f + 1] * np, c = tri[3 * f + 2] * np;
		const ax = vp[a], ay = vp[a + 1], az = vp[a + 2];
		const bx = vp[b], by = vp[b + 1], bz = vp[b + 2];
		const cx = vp[c], cy = vp[c + 1], cz = vp[c + 2];
		const ux = bx - ax, uy = by - ay, uz = bz - az;
		const vx = cx - ax, vy = cy - ay, vz = cz - az;
		let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		const len = Math.hypot(nx, ny, nz) || 1;
		nx /= len; ny /= len; nz /= len;
		dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
		dv.setFloat32(o + 12, ax, true); dv.setFloat32(o + 16, ay, true); dv.setFloat32(o + 20, az, true);
		dv.setFloat32(o + 24, bx, true); dv.setFloat32(o + 28, by, true); dv.setFloat32(o + 32, bz, true);
		dv.setFloat32(o + 36, cx, true); dv.setFloat32(o + 40, cy, true); dv.setFloat32(o + 44, cz, true);
		o += 50; // 12 floats (48) + 2-byte attribute
	}
	return new Blob([buf], { type: 'model/stl' });
}

function computeFeatureEdges(
	nv: number, nTri: number, tri: Uint32Array,
	px: (i: number) => number, py: (i: number) => number, pz: (i: number) => number,
	fnx: Float32Array, fny: Float32Array, fnz: Float32Array, edgeAngleDeg: number
): Float32Array {
	// Watertight mesh ⇒ every edge is shared by exactly two faces; emit a segment
	// where their dihedral exceeds the threshold.
	const cosThresh = Math.cos((edgeAngleDeg * Math.PI) / 180);
	const firstFace = new Map<number, number>();
	const segs: number[] = [];
	const visit = (v0: number, v1: number, f: number) => {
		const lo = Math.min(v0, v1), hi = Math.max(v0, v1);
		const key = lo * nv + hi;
		const prev = firstFace.get(key);
		if (prev === undefined) {
			firstFace.set(key, f);
			return;
		}
		if (fnx[prev] * fnx[f] + fny[prev] * fny[f] + fnz[prev] * fnz[f] < cosThresh) {
			segs.push(px(lo), py(lo), pz(lo), px(hi), py(hi), pz(hi));
		}
	};
	for (let f = 0; f < nTri; f++) {
		const a = tri[3 * f], b = tri[3 * f + 1], c = tri[3 * f + 2];
		visit(a, b, f);
		visit(b, c, f);
		visit(c, a, f);
	}
	return new Float32Array(segs);
}
