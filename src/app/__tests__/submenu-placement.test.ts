import { describe, expect, test } from 'bun:test';
import { submenuPosition } from '../submenu-placement.js';

describe('submenuPosition', () => {
  const panel = { width: 240, height: 160 };
  const viewport = { width: 1000, height: 700 };

  test('opens beside the row when the right side has room', () => {
    expect(submenuPosition({ left: 200, right: 440, top: 100 }, panel, viewport)).toEqual({
      left: 440,
      top: 96,
      side: 'right',
    });
  });

  test('opens left near the right edge and clears the bottom edge', () => {
    expect(submenuPosition({ left: 740, right: 980, top: 650 }, panel, viewport)).toEqual({
      left: 500,
      top: 532,
      side: 'left',
    });
  });

  test('uses the side with more room when neither side fits', () => {
    const result = submenuPosition({ left: 20, right: 180, top: 0 }, panel, {
      width: 320,
      height: 300,
    });
    expect(result).toEqual({ left: 72, top: 8, side: 'right' });
    expect(result.left + panel.width).toBeLessThanOrEqual(312);
  });

  test('keeps a tall menu at the top inset', () => {
    const result = submenuPosition(
      { left: 500, right: 740, top: 200 },
      { width: 240, height: 684 },
      viewport
    );
    expect(result.top).toBe(8);
  });
});
