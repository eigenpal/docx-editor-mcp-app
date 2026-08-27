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
 * server can reach that the caller cannot. The boundary here:
 *
 *  - scheme and address class, via a CIDR blocklist (`node:net` BlockList);
 *  - **the address is enforced at DIAL time**, not just pre-checked. A
 *    pre-check alone is a TOCTOU: a TTL-0 DNS answer can pass the check as a
 *    public address and re-resolve to 169.254.169.254 for the actual
 *    connection. The undici Agent below routes the real connection through
 *    `guardedLookup`, so the address that was vetted is the address dialed
 *    (and TLS still sees the hostname, so SNI and certificates hold);
 *  - redirects refused (a redirect is a second, unvetted URL);
 *  - the size cap enforced while STREAMING, because `content-length` is a
 *    claim and a chunked response never makes it.
 */

import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';
// undici's OWN fetch, not the global: Node's built-in fetch uses the undici
// bundled into Node, whose dispatcher interface can differ from the installed
// package's — an Agent from one handed to the fetch of the other fails with
// UND_ERR_INVALID_ARG at dial time. Importing both from the package keeps the
// pair compatible regardless of the Node release.
import { Agent, fetch as undiciFetch } from 'undici';
import type { Request, Response } from 'express';

/** A .docx over this is not a document someone means to edit in a chat window. */
const MAX_BYTES = 32 * 1024 * 1024;

/**
 * Every range the public internet cannot route to, or that routes somewhere a
 * public URL has no business naming. CIDRs, not regexes: the regex version of
 * this list missed 198.18.0.0/15, 192.0.0.0/24 and all of multicast.
 */
const BLOCKED = new BlockList();
// IPv4
BLOCKED.addSubnet('0.0.0.0', 8); // "this network"
BLOCKED.addSubnet('10.0.0.0', 8); // private
BLOCKED.addSubnet('100.64.0.0', 10); // CGNAT
BLOCKED.addSubnet('127.0.0.0', 8); // loopback
BLOCKED.addSubnet('169.254.0.0', 16); // link-local (cloud metadata)
BLOCKED.addSubnet('172.16.0.0', 12); // private
BLOCKED.addSubnet('192.0.0.0', 24); // IETF protocol assignments
BLOCKED.addSubnet('192.168.0.0', 16); // private
BLOCKED.addSubnet('198.18.0.0', 15); // benchmarking
BLOCKED.addSubnet('224.0.0.0', 4); // multicast
BLOCKED.addSubnet('240.0.0.0', 4); // reserved (includes broadcast)
// IPv6
BLOCKED.addSubnet('::', 128, 'ipv6'); // unspecified
BLOCKED.addSubnet('::1', 128, 'ipv6'); // loopback
BLOCKED.addSubnet('fc00::', 7, 'ipv6'); // unique-local
BLOCKED.addSubnet('fe80::', 10, 'ipv6'); // link-local
BLOCKED.addSubnet('64:ff9b::', 96, 'ipv6'); // NAT64 — embeds an IPv4 address

/** True for any address the proxy must not dial. Fails closed on non-addresses. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, 'ipv4');
  if (family === 6) {
    const normalized = address.toLowerCase();
    // IPv4-mapped (::ffff:10.0.0.1) and NAT64 both smuggle a v4 address into a
    // v6 literal; BlockList checks the mapped form against v4 rules itself,
    // but the textual form needs unwrapping first.
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return BLOCKED.check(normalized, 'ipv6');
  }
  return true;
}

/**
 * The lookup the ACTUAL connection uses. Refusing here, rather than only in a
 * pre-check, is what closes the rebinding window: whatever DNS answers at dial
 * time is what gets vetted, and a name whose answers include one blocked
 * address is refused outright — the multi-record rebinding shape.
 *
 * The callback follows `net.connect`'s lookup contract, which has two shapes:
 * `(err, address, family)` normally, `(err, addresses[])` when `options.all`
 * is set. Answering the wrong shape does not error — the connection just
 * fails — so both are honored.
 */
type LookupCallback = (
  error: Error | null,
  address?: string | LookupAddress[],
  family?: number
) => void;

export function guardedLookup(
  hostname: string,
  options: { all?: boolean } | undefined,
  callback: LookupCallback
): void {
  void lookup(hostname, { all: true, verbatim: true })
    .then((addresses) => {
      if (addresses.length === 0) {
        callback(new Error(`could not resolve ${hostname}`));
        return;
      }
      if (addresses.some(({ address }) => isPrivateAddress(address))) {
        callback(new Error(`${hostname} resolves to a non-public address`));
        return;
      }
      if (options?.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    })
    .catch((error: Error) => callback(error));
}

/** One agent for the route: every connection it opens resolves through the guard. */
const guardedAgent = new Agent({
  connect: { lookup: guardedLookup as never },
  // The proxy answers a widget that is itself on a timeout; a source that
  // stalls mid-body should fail there, not hold sockets here.
  bodyTimeout: 20_000,
  headersTimeout: 20_000,
});

export interface ProxyRefusal {
  status: number;
  message: string;
}

/**
 * Pre-flight for a FRIENDLY refusal (a 4xx with a reason the widget can show).
 * Not the security boundary — that is `guardedLookup` on the dial — so a check
 * that passes here and fails there is safe, just less politely worded.
 */
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

  let addresses: LookupAddress[];
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

/**
 * Reads at most `MAX_BYTES` from a body, aborting the moment the running total
 * passes the cap — BEFORE buffering, because `content-length` is a claim and a
 * chunked response never states one.
 */
async function readCapped(
  body: NonNullable<Awaited<ReturnType<typeof undiciFetch>>['body']>
): Promise<Uint8Array | 'too-large'> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return 'too-large';
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function handleFetch(req: Request, res: Response): Promise<void> {
  // On EVERY response, refusals included. The caller is a sandboxed iframe with
  // an opaque origin; without this header the browser withholds the response
  // body and every carefully worded refusal below collapses into an
  // indistinguishable "Failed to fetch".
  res.setHeader('Access-Control-Allow-Origin', '*');

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

  let upstream: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    upstream = await undiciFetch(checked, {
      // A redirect is a second URL, and it has been through none of the checks
      // above. Refusing is the honest answer; following it is how a validated
      // proxy stops being one.
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
      // Route the dial through the guarded resolver (see guardedLookup).
      dispatcher: guardedAgent,
    });
  } catch (cause) {
    // undici wraps the real reason ("redirect", the guarded lookup's refusal,
    // a TLS failure) in a generic "fetch failed"; the cause chain names it.
    const reason =
      (cause instanceof Error && cause.cause instanceof Error && cause.cause.message) ||
      (cause instanceof Error ? cause.message : 'fetch failed');
    res.status(502).json({
      error:
        reason === 'unexpected redirect'
          ? 'the source answered with a redirect, which this proxy refuses; use the direct link'
          : reason,
    });
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

  if (!upstream.body) {
    res.status(502).json({ error: 'the source returned no body' });
    return;
  }
  const body = await readCapped(upstream.body);
  if (body === 'too-large') {
    res.status(413).json({ error: `the file is larger than ${MAX_BYTES} bytes` });
    return;
  }

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  res.setHeader('Cache-Control', 'no-store');
  res.end(Buffer.from(body));
}
