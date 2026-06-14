// Extracts the render mesh (positions, normals, feature edges, triangle indices)
// from a manifold-3d solid, in the same shape the worker/Viewer consume from the
// OCCT path. Pure manifold — no OpenCascade dependency.
import type { Manifold } from 'manifold-3d';

export interface BinMesh {
	vertices: Float32Array;
	triangles: Uint32Array;
	normals: Float32Array;
	edges: Float32Array;
}

// Normals: manifold splits vertices along edges sharper than `sharpAngleDeg`, so
// chamfers/corners shade flat while faceted cylinders stay smooth.
// Edges: a segment is emitted where two faces meet at more than `edgeAngleDeg`,
// approximating OCCT's feature-edge wireframe.
export function manifoldToMesh(
	solid: Manifold,
	{ sharpAngleDeg = 30, edgeAngleDeg = 25 }: { sharpAngleDeg?: number; edgeAngleDeg?: number } = {}
): BinMesh {
	const shaded = solid.calculateNormals(3, sharpAngleDeg).getMesh();
	const np = shaded.numProp;
	const vp = shaded.vertProperties;
	const nv = vp.length / np;
	const vertices = new Float32Array(nv * 3);
	const normals = new Float32Array(nv * 3);
	for (let i = 0; i < nv; i++) {
		vertices[3 * i] = vp[i * np];
		vertices[3 * i + 1] = vp[i * np + 1];
		vertices[3 * i + 2] = vp[i * np + 2];
		normals[3 * i] = vp[i * np + 3];
		normals[3 * i + 1] = vp[i * np + 4];
		normals[3 * i + 2] = vp[i * np + 5];
	}
	const triangles = new Uint32Array(shaded.triVerts);
	const edges = computeFeatureEdges(solid, edgeAngleDeg);
	return { vertices, triangles, normals, edges };
}

function computeFeatureEdges(solid: Manifold, edgeAngleDeg: number): Float32Array {
	// Merged-vertex mesh (positions only): every edge is shared by exactly two
	// triangles, so a single pass finds each shared edge's dihedral angle.
	const geo = solid.getMesh();
	const np = geo.numProp;
	const vp = geo.vertProperties;
	const tri = geo.triVerts;
	const nv = vp.length / np;
	const nTri = tri.length / 3;
	const cosThresh = Math.cos((edgeAngleDeg * Math.PI) / 180);

	const px = (i: number) => vp[i * np];
	const py = (i: number) => vp[i * np + 1];
	const pz = (i: number) => vp[i * np + 2];

	const fn = new Float32Array(nTri * 3);
	for (let f = 0; f < nTri; f++) {
		const a = tri[3 * f], b = tri[3 * f + 1], c = tri[3 * f + 2];
		const ux = px(b) - px(a), uy = py(b) - py(a), uz = pz(b) - pz(a);
		const vx = px(c) - px(a), vy = py(c) - py(a), vz = pz(c) - pz(a);
		let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		const len = Math.hypot(nx, ny, nz) || 1;
		fn[3 * f] = nx / len;
		fn[3 * f + 1] = ny / len;
		fn[3 * f + 2] = nz / len;
	}

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
		const dot = fn[3 * prev] * fn[3 * f] + fn[3 * prev + 1] * fn[3 * f + 1] + fn[3 * prev + 2] * fn[3 * f + 2];
		if (dot < cosThresh) {
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
