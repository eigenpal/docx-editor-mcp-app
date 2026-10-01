/**
 * The widget's binary assets, without a network fetch: desktop hosts' iframe
 * CSP allows no origin of ours, and blocks `blob:` images.
 *
 *   harfbuzz.wasm  The engine loads its text shaper with `fetch(url)`. That one
 *                  URL is answered from the MCP resource `docx-asset://harfbuzz.wasm`;
 *                  every other fetch is untouched. Without the shaper, text
 *                  measurement falls back and pagination drifts from Word.
 *   images         The engine paints images from `URL.createObjectURL`; image
 *                  blobs become `data:` URLs instead (see below).
 *
 * This module runs at import time, before the first editor exists.
 */

import type { App } from '@modelcontextprotocol/ext-apps';
import { setHarfBuzzWasmUrl } from '@docx-editor.dev/core/layout';
import { base64ToBytes, bytesToBase64 } from './host-file.js';

const WASM_URI = 'docx-asset://harfbuzz.wasm';
/** Never fetched: the shim below answers it. `.invalid` cannot resolve. */
const WASM_URL = 'https://docx-editor.invalid/harfbuzz.wasm';

let provide: (app: App) => void = () => undefined;
const appReady = new Promise<App>((resolve) => (provide = resolve));

/** Hand the connected App to the asset loader. Call it once the App exists. */
export function provideApp(app: App): void {
  provide(app);
}

serveWasmFromResource();
inlineImagesAsDataUrls();

function serveWasmFromResource(): void {
  setHarfBuzzWasmUrl(WASM_URL);
  const realFetch = globalThis.fetch.bind(globalThis);
  const shim = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== WASM_URL) return realFetch(input, init);
    const app = await appReady;
    const result = await app.readServerResource({ uri: WASM_URI });
    const content = result.contents[0];
    if (!content || !('blob' in content)) throw new Error('The server sent no harfbuzz.wasm.');
    return new Response(base64ToBytes(content.blob) as Uint8Array<ArrayBuffer>, {
      headers: { 'Content-Type': 'application/wasm' },
    });
  };
  globalThis.fetch = Object.assign(shim, globalThis.fetch);
}

/**
 * ChatGPT's iframe CSP allows `data:` images but not `blob:` ones, and the
 * engine paints document images from `URL.createObjectURL`, so image blobs
 * become `data:` URLs instead. The bytes are kept per Blob at
 * construction, because a Blob cannot be read synchronously. Every other
 * Blob and URL behaves as before. Upstream fix: an engine option for the
 * image URL port, so this shim can go.
 */
function inlineImagesAsDataUrls(): void {
  const imageBytes = new WeakMap<Blob, Uint8Array>();
  const NativeBlob = globalThis.Blob;
  class RecordingBlob extends NativeBlob {
    constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      const only = parts?.length === 1 ? parts[0] : undefined;
      if (options?.type?.startsWith('image/') && only instanceof Uint8Array) {
        imageBytes.set(this, only);
      }
    }
  }
  globalThis.Blob = RecordingBlob;
  const createObjectURL = URL.createObjectURL.bind(URL);
  const revokeObjectURL = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (object: Blob | MediaSource) => {
    const bytes = object instanceof NativeBlob ? imageBytes.get(object) : undefined;
    if (!bytes) return createObjectURL(object);
    return `data:${(object as Blob).type};base64,${bytesToBase64(bytes)}`;
  };
  URL.revokeObjectURL = (url: string) => {
    if (!url.startsWith('data:')) revokeObjectURL(url);
  };
}
