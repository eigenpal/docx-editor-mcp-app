import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createUpdateChecker } from '../updates.js';
import { isNewer, UPDATE_API } from '../../shared/updates.js';

const initialSetting = process.env.DOCX_EDITOR_UPDATE_CHECK;
beforeEach(() => {
  delete process.env.DOCX_EDITOR_UPDATE_CHECK;
});
afterEach(() => {
  if (initialSetting === undefined) delete process.env.DOCX_EDITOR_UPDATE_CHECK;
  else process.env.DOCX_EDITOR_UPDATE_CHECK = initialSetting;
});

const release = (tag_name: string, rest = {}) =>
  new Response(
    JSON.stringify({
      tag_name,
      prerelease: false,
      draft: false,
      ...rest,
    })
  );
const fetcher = (fn: (input: unknown) => Promise<Response>) => fn as typeof fetch;

describe('update availability', () => {
  test('compares numeric stable versions and rejects prereleases', () => {
    expect(isNewer('1.10.0', '1.9.0')).toBe(true);
    expect(isNewer('1.0.1', '1.0.0')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.9', '1.0.0')).toBe(false);
    expect(isNewer('2.0.0-beta.1', '1.0.0')).toBe(false);
    expect(isNewer('not a version', '1.0.0')).toBe(false);
  });
  test('checks only the fixed release endpoint and deduplicates concurrent checks', async () => {
    let calls = 0;
    let time = 100;
    const check = createUpdateChecker(
      '1.0.0',
      fetcher(async (url) => {
        expect(url).toBe(UPDATE_API);
        calls++;
        return release('v1.0.1');
      }),
      () => time
    );
    const results = await Promise.all([check(), check()]);
    expect(results[0]).toEqual({ current: '1.0.0', latest: '1.0.1' });
    await check();
    expect(calls).toBe(1);
    time += 24 * 60 * 60 * 1000;
    await check();
    expect(calls).toBe(2);
  });
  test('ignores drafts, prereleases, malformed responses, and old releases', async () => {
    for (const response of [
      release('v2.0.0', { draft: true }),
      release('v2.0.0', { prerelease: true }),
      release('v0.9.9'),
      release('v1.0.0'),
      new Response('invalid'),
      release('v2.0.0-beta.1'),
      new Response('x'.repeat(256 * 1024 + 1)),
      new Response('', { status: 403 }),
    ]) {
      const result = await createUpdateChecker(
        '1.0.0',
        fetcher(async () => response)
      )();
      expect(result.latest).toBeNull();
    }
  });
  test('disables requests when the update setting is off', async () => {
    const previous = process.env.DOCX_EDITOR_UPDATE_CHECK;
    process.env.DOCX_EDITOR_UPDATE_CHECK = '0';
    let requested = false;
    try {
      const result = await createUpdateChecker(
        '1.0.0',
        fetcher(async () => {
          requested = true;
          return release('v1.0.1');
        })
      )();
      expect(result.latest).toBeNull();
      expect(requested).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.DOCX_EDITOR_UPDATE_CHECK;
      else process.env.DOCX_EDITOR_UPDATE_CHECK = previous;
    }
  });
  test('keeps document work available when offline', async () => {
    const result = await createUpdateChecker(
      '1.0.0',
      fetcher(async () => {
        throw new Error('offline');
      })
    )();
    expect(result).toEqual({ current: '1.0.0', latest: null });
  });
});
