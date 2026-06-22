import { describe, expect, it } from 'vitest';
import type { SkadisParams } from '$lib/stores/params';
import { planSkadis } from './skadis-layout';
import {
	SKADIS_HOOK_WIDTH,
	SKADIS_MOUNT_BAND,
	SKADIS_SCREW_CLEARANCE_RADIUS,
	SKADIS_SCREW_SEGMENTS,
	skadisHexPanels,
	skadisHookProfile,
	skadisScrewHoleSpec,
	type MountProfilePoint
} from './skadis-mounts';

function makeSk(overrides: Partial<SkadisParams> = {}): SkadisParams {
	return { width: 120, height: 80, depth: 50, wallThickness: 2, mountType: 'hook', hookRows: 1, openFront: false, frontWallHeight: 30, openSides: false, sideWallHeight: 30, lightweightWalls: false, ...overrides };
}

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

	it('describes lightweight hex panels for closed walls and floor', () => {
		const p = makeSk();
		const panels = skadisHexPanels(p, planSkadis(p));

		expect(panels.map((panel) => panel.name)).toEqual(['left', 'right', 'front', 'back', 'floor']);
		expect(panels[0]).toEqual({
			name: 'left',
			axis: 'X',
			faceW: 50,
			faceH: 80,
			thickness: 2,
			cx: -61,
			cy: 27,
			cz: 42
		});
		expect(panels[1]?.cx).toBe(61);
		expect(panels[2]).toEqual({
			name: 'front',
			axis: 'Y',
			faceW: 120,
			faceH: 80,
			thickness: 2,
			cx: 0,
			cy: 53,
			cz: 42
		});
		expect(panels[3]).toEqual({
			name: 'back',
			axis: 'Y',
			faceW: 120,
			faceH: 60,
			thickness: 2,
			cx: 0,
			cy: 1,
			cz: 32
		});
		expect(panels[4]).toEqual({
			name: 'floor',
			axis: 'Z',
			faceW: 120,
			faceH: 50,
			thickness: 2,
			cx: 0,
			cy: 27,
			cz: 1
		});
	});

	it('uses opened wall heights for front and side panels', () => {
		const p = makeSk({ openFront: true, frontWallHeight: 30, openSides: true, sideWallHeight: 25 });
		const panels = skadisHexPanels(p, planSkadis(p));

		expect(panels.find((panel) => panel.name === 'left')?.faceH).toBe(23);
		expect(panels.find((panel) => panel.name === 'right')?.cz).toBe(13.5);
		expect(panels.find((panel) => panel.name === 'front')?.faceH).toBe(28);
		expect(panels.find((panel) => panel.name === 'front')?.cz).toBe(16);
		expect(panels.find((panel) => panel.name === 'back')?.faceH).toBe(60);
	});
});
