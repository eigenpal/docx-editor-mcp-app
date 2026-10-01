/**
 * The host's file resource for a `.docx` opened through the file entrypoint.
 *
 * ChatGPT and Codex desktop open a supported file in this widget and hand it an
 * opaque `resourceUri`. Reads, subscriptions and writes on that URI go to the
 * HOST, not to our server (spec: openai/mcp-extensions, "File Extension
 * Entrypoint"). `@openai/mcp-extensions` is the reference client for them.
 */

import type { App } from '@modelcontextprotocol/ext-apps';
import {
  OpenAIExtensions,
  OpenAIFileEntrypointInputSchema,
  type OpenAIFileEntrypointInput,
  type OpenAIResources,
} from '@openai/mcp-extensions/app';

export { OpenAIFileEntrypointInputSchema as FileEntrypointInput };
export type OpenedFile = OpenAIFileEntrypointInput['file'];

export interface HostFileVersion {
  bytes: Uint8Array;
  /** Opaque version token; absent when the host does not version the file. */
  etag: string | null;
  writable: boolean;
}

export type HostFileWriteResult =
  | { outcome: 'saved'; etag: string }
  | { outcome: 'conflict'; etag: string }
  | { outcome: 'too-large'; maxBytes: number };

const extensions = new WeakMap<App, OpenAIExtensions>();

/**
 * Attach the OpenAI extensions to an App. Call it before `connect()`: the
 * extensions read the host's capabilities and cursor preference from the
 * handshake.
 */
export function attachOpenAIExtensions(app: App): void {
  if (!extensions.has(app)) extensions.set(app, new OpenAIExtensions(app));
}

function resources(app: App): OpenAIResources {
  const api = extensions.get(app)?.resources;
  if (!api) throw new Error('This host does not serve opened files to apps.');
  return api;
}

export async function readHostFile(app: App, uri: string): Promise<HostFileVersion> {
  // The host serves this read and cannot infer the representation; a .docx is binary.
  const result = await resources(app).read({ uri, representation: 'blob' });
  const content = result.contents.find((item) => item.uri === uri) ?? result.contents[0];
  if (!content) throw new Error('The host returned no file contents.');
  if (!('blob' in content) || typeof content.blob !== 'string') {
    throw new Error('The host returned the file as text, not as binary data.');
  }
  return {
    bytes: base64ToBytes(content.blob),
    // An empty etag cannot guard a write; treat it as none, so writes compare content.
    etag: content.openaiMetadata?.etag || null,
    writable: content.openaiMetadata?.writable === true,
  };
}

/** Subscribe to changes of one file. Returns the function that stops them. */
export async function watchHostFile(
  app: App,
  uri: string,
  onChange: () => void
): Promise<() => void> {
  const api = resources(app);
  const removeHandler = api.addUpdateHandler(({ params }) => {
    if (params.uri === uri) onChange();
  });
  try {
    await api.subscribe({ uri });
  } catch (cause) {
    removeHandler();
    throw cause;
  }
  return () => {
    removeHandler();
    void api.unsubscribe({ uri }).catch(() => undefined);
  };
}

export function writeHostFile(
  app: App,
  uri: string,
  bytes: Uint8Array,
  ifMatch: string | null
): Promise<HostFileWriteResult> {
  return resources(app).write(uri, {
    blob: bytesToBase64(bytes),
    ...(ifMatch ? { ifMatch } : {}),
  }) as Promise<HostFileWriteResult>;
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked: a spread of a multi-megabyte array overflows the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
