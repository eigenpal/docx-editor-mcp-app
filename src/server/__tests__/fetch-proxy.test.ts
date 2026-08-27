/**
 * The SSRF boundary. `url` reaches this server from a tool call the model makes,
 * and a document, a web page or a chat message can steer that call — so these
 * are the cases that decide whether the proxy is a proxy or a gadget.
 */

import { describe, expect, it } from 'bun:test';
import { assertFetchable, isPrivateAddress } from '../fetch-proxy.js';

describe('isPrivateAddress', () => {
  it('rejects every IPv4 range the public internet cannot route', () => {
    for (const address of [
      '0.0.0.0',
      '10.1.2.3',
      '127.0.0.1',
      '169.254.169.254', // cloud metadata, the reason this check exists
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1', // CGNAT
    ]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1']) {
      expect(isPrivateAddress(address)).toBe(false);
    }
  });

  it('rejects loopback, unique-local and link-local IPv6', () => {
    for (const address of ['::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1']) {
      expect(isPrivateAddress(address)).toBe(true);
    }
  });

  it('sees through IPv4-mapped IPv6', () => {
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('treats anything that is not an IP address as private', () => {
    // `lookup` answers with addresses, so a non-address here means the caller
    // passed something unexpected. Failing closed is the only safe default.
    expect(isPrivateAddress('example.com')).toBe(true);
    expect(isPrivateAddress('')).toBe(true);
  });
});

describe('assertFetchable', () => {
  it('refuses a non-HTTP scheme', async () => {
    for (const url of ['file:///etc/passwd', 'gopher://example.com', 'data:text/plain,hi']) {
      const result = await assertFetchable(url);
      expect(result).toMatchObject({ status: 400 });
    }
  });

  it('refuses a string that is not an absolute URL', async () => {
    expect(await assertFetchable('/etc/passwd')).toMatchObject({ status: 400 });
    expect(await assertFetchable('example.com/a.docx')).toMatchObject({ status: 400 });
  });

  it('refuses a name that resolves to loopback', async () => {
    const result = await assertFetchable('http://localhost/a.docx');
    expect(result).toMatchObject({ status: 403 });
  });

  it('refuses a literal private address', async () => {
    expect(await assertFetchable('http://169.254.169.254/latest/meta-data/')).toMatchObject({
      status: 403,
    });
  });
});
