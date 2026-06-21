import { describe, expect, it } from 'vitest';
import {
	SKADIS_HOOK_WIDTH,
	SKADIS_MOUNT_BAND,
	SKADIS_SCREW_CLEARANCE_RADIUS,
	SKADIS_SCREW_SEGMENTS,
	skadisHookProfile,
	skadisScrewHoleSpec,
	type MountProfilePoint
} from './skadis-mounts';

function expectPointsClose(actual: MountProfilePoint[], expected: MountProfilePoint[]): void {
	expect(actual).toHaveLength(expected.length);
	for (let i = 0; i < expected.length; i++) {
		expect(actual[i]![0]).toBeCloseTo(expected[i]![0]);
		expect(actual[i]![1]).toBeCloseTo(expected[i]![1]);
	}
}

describe('skadis mount specs', () => {
	it('describes the shared drop-catch hook profile', () => {
		expect.hasAssertions();
		expectPointsClose(skadisHookProfile(50), [
			[1.2, 52],
			[-7.4, 52],
			[-7.4, 42],
			[-5.4, 42],
			[-5.4, 49],
			[1.2, 49]
		]);
	});

	it('describes screw holes with radius and wall overshoot', () => {
		expect(skadisScrewHoleSpec(12, 34, 2)).toEqual({
			radius: SKADIS_SCREW_CLEARANCE_RADIUS,
			yStart: -1,
			length: 4,
			x: 12,
			z: 34
		});
	});

	it('keeps shared mount dimensions explicit', () => {
		expect(SKADIS_HOOK_WIDTH).toBeCloseTo(4.4);
		expect(SKADIS_MOUNT_BAND).toBe(12);
		expect(SKADIS_SCREW_SEGMENTS).toBe(48);
	});
});
