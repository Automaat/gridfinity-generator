export type Point2 = readonly [number, number];

export function signedArea(points: readonly Point2[]): number {
	let area = 0;
	for (let i = 0; i < points.length; i++) {
		const [x1, y1] = points[i]!;
		const [x2, y2] = points[(i + 1) % points.length]!;
		area += x1 * y2 - x2 * y1;
	}
	return area / 2;
}

// Manifold CrossSection treats clockwise contours as holes. Normalize generated
// polygons to counter-clockwise before constructing a solid section.
export function ensureCounterClockwise<TPoint extends Point2>(points: readonly TPoint[]): TPoint[] {
	if (signedArea(points) >= 0) return [...points];

	const reversed: TPoint[] = [];
	for (let i = points.length - 1; i >= 0; i--) {
		reversed.push(points[i]!);
	}
	return reversed;
}
