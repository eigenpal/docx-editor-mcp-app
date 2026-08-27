/**
 * Fetches a .docx on the widget's behalf.
 *
 * The widget would rather fetch the file itself, and the engine needs no server
 * for it. It cannot: a sandboxed iframe may only reach the origins its resource
 * named in `_meta.ui.csp.connectDomains`, and `open_document` takes an arbitrary
 * URL, which is not an allowlist anything can be written down as. So the one
 * origin the CSP does name — this server — fetches it and streams the bytes on.
 *
 * This process still parses nothing. It copies bytes.
 *
 * **The URL is attacker-controlled.** It arrives from a tool call the model
 * makes, which a document, a web page or a chat message can steer. A proxy that
 * fetches whatever it is handed is an SSRF gadget pointed at whatever this
 * server can reach that the caller cannot. The guards below are the boundary:
 * scheme, resolved address, redirect and size, all checked before any body is
 * read.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Request, Response } from 'express';

/** A .docx over this is not a document someone means to edit in a chat window. */
const MAX_BYTES = 32 * 1024 * 1024;

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT, 100.64.0.0/10
];

/** True for any address the public internet cannot route to. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return PRIVATE_V4.some((range) => range.test(address));
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized === '::' || normalized === '::1') return true;
    // Unique-local (fc00::/7) and link-local (fe80::/10).
    if (/^f[cd]/.test(normalized) || /^fe[89ab]/.test(normalized)) return true;
    // IPv4-mapped: ::ffff:10.0.0.1 reaches the same host the v4 rules cover.
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true;
}

export interface ProxyRefusal {
  status: number;
  message: string;
}

/** Validates the URL and resolves its host, or says why it will not be fetched. */
export async function assertFetchable(raw: string): Promise<URL | ProxyRefusal> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { status: 400, message: 'url is not a valid absolute URL' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { status: 400, message: `${url.protocol} is not fetchable; use https` };
  }

  // Resolve BEFORE fetching, and check every address the name answers with:
  // a name that resolves to one public and one loopback address is the shape a
  // DNS-rebinding attempt takes.
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    return { status: 400, message: `could not resolve ${url.hostname}` };
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    return { status: 403, message: `${url.hostname} resolves to a non-public address` };
  }

  return url;
}

const isRefusal = (value: URL | ProxyRefusal): value is ProxyRefusal => 'status' in value;

export async function handleFetch(req: Request, res: Response): Promise<void> {
  const raw = typeof req.query.url === 'string' ? req.query.url : '';
  if (!raw) {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  const checked = await assertFetchable(raw);
  if (isRefusal(checked)) {
    res.status(checked.status).json({ error: checked.message });
    return;
  }

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(checked, {
      // A redirect is a second URL, and it has been through none of the checks
      // above. Refusing is the honest answer; following it is how a validated
      // proxy stops being one.
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (cause) {
    res.status(502).json({ error: cause instanceof Error ? cause.message : 'fetch failed' });
    return;
  }

  if (!upstream.ok) {
    res.status(502).json({ error: `the source returned HTTP ${upstream.status}` });
    return;
  }

  const declared = Number(upstream.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) {
    res.status(413).json({ error: `the file is larger than ${MAX_BYTES} bytes` });
    return;
  }

  const body = new Uint8Array(await upstream.arrayBuffer());
  // Checked again: `content-length` is a claim, not a measurement.
  if (body.byteLength > MAX_BYTES) {
    res.status(413).json({ error: `the file is larger than ${MAX_BYTES} bytes` });
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  res.setHeader('Cache-Control', 'no-store');
  res.end(Buffer.from(body));
}
