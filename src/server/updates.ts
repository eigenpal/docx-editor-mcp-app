import { isNewer, StableVersion, UPDATE_API, type UpdateInfo } from '../shared/updates.js';

const DAY = 24 * 60 * 60 * 1000;
const MAX_BYTES = 256 * 1024;

/** Check release metadata only. Never download or execute a replacement package. */
export function createUpdateChecker(
  current: string,
  request: typeof fetch = fetch,
  now = Date.now
) {
  let expires = 0;
  let cached: UpdateInfo = { current, latest: null };
  let pending: Promise<UpdateInfo> | null = null;
  const check = async (): Promise<UpdateInfo> => {
    try {
      const response = await request(UPDATE_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `docx-editor/${current}` },
        signal: AbortSignal.timeout(3000),
        redirect: 'error',
      });
      if (!response.ok || !response.body) return { current, latest: null };
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > MAX_BYTES) return { current, latest: null };
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const candidate = typeof data.tag_name === 'string' ? data.tag_name.replace(/^v/, '') : '';
      const stable = StableVersion.safeParse(candidate);
      if (data.draft !== false || data.prerelease !== false || !stable.success)
        return { current, latest: null };
      return { current, latest: isNewer(candidate, current) ? candidate : null };
    } catch {
      // An offline or rate-limited check must never stop document work.
      return { current, latest: null };
    }
  };
  return async (): Promise<UpdateInfo> => {
    if (process.env.DOCX_EDITOR_UPDATE_CHECK === '0') return { current, latest: null };
    if (now() < expires) return cached;
    if (!pending) {
      pending = check().then((result) => {
        cached = result;
        expires = now() + DAY;
        pending = null;
        return result;
      });
    }
    return pending;
  };
}
