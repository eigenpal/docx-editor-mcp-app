/**
 * A minimal MCP Apps HOST, for local verification only (built into the
 * gitignored `public/__harness/`, never shipped). It renders the built widget
 * in an iframe, runs the real `ui/initialize` handshake through the SDK's
 * AppBridge, and proxies the widget's resource reads and tool calls to this
 * server's `/mcp` through a real MCP client, the way a host does.
 */

import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import { PostMessageTransport } from '@modelcontextprotocol/ext-apps';
import type { McpUiStyles } from '@modelcontextprotocol/ext-apps';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { installHostFile } from './host-file.js';
import { SAMPLE_DOCX } from './sample.js';

const frame = document.getElementById('frame') as HTMLIFrameElement;
const log = (line: string) => {
  const el = document.getElementById('log')!;
  el.textContent = `${line}\n${el.textContent ?? ''}`.slice(0, 6000);
};

let theme: 'light' | 'dark' = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
const client = new Client({ name: 'harness', version: '0.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', location.href)));

const bridge = new AppBridge(
  client,
  { name: 'harness', version: '0.0.0' },
  {
    serverTools: {},
    downloadFile: {},
    openLinks: {},
    logging: {},
    // The OpenAI file resource capability (see host-file.ts).
    experimental: { 'openai/resource': {} },
  },
  {
    // Initial context in the constructor: a client-backed bridge refuses
    // `setHostContext` notifications before the app connects.
    hostContext: {
      theme,
      styles: { variables: claudeVariables(theme) },
      displayMode: 'inline',
      availableDisplayModes: ['inline', 'fullscreen'],
      safeAreaInsets: { top: 0, right: 0, bottom: 24, left: 0 },
      platform: 'web',
    },
  }
);

/** Claude's documented style tokens, per theme — what the real host injects. */
function claudeVariables(theme: 'light' | 'dark') {
  const dark = theme === 'dark';
  const vars: Record<string, string> = {
    'color-background-primary': dark ? '#30302E' : '#FFFFFF',
    'color-background-secondary': dark ? '#262624' : '#F5F4ED',
    'color-background-info': dark ? '#253E5F' : '#D6E4F6',
    'color-background-danger': dark ? '#602A28' : '#F7ECEC',
    'color-background-inverse': dark ? '#FAF9F5' : '#141413',
    'color-text-primary': dark ? '#FAF9F5' : '#141413',
    'color-text-secondary': dark ? '#C2C0B6' : '#3D3D3A',
    'color-text-tertiary': dark ? '#9C9A92' : '#73726C',
    'color-text-info': dark ? '#80AADD' : '#3266AD',
    'color-text-danger': dark ? '#EE8884' : '#7F2C28',
    'color-text-inverse': dark ? '#141413' : '#FFFFFF',
    'color-border-secondary': dark ? 'rgba(222,220,209,0.3)' : 'rgba(31,30,29,0.3)',
    'color-border-tertiary': dark ? 'rgba(222,220,209,0.15)' : 'rgba(31,30,29,0.15)',
    'font-sans': 'ui-sans-serif, system-ui, sans-serif',
  };
  // The spec type wants every `--`-prefixed key present; a partial is what a
  // harness needs, so prefix and cast (dev-only code).
  return Object.fromEntries(
    Object.entries(vars).map(([key, value]) => [`--${key}`, value])
  ) as unknown as McpUiStyles;
}

bridge.onrequestdisplaymode = async ({ mode }) => {
  log(`ui/request-display-mode → ${mode}`);
  document.body.dataset.mode = mode;
  // The inline auto-fit height is an inline style; fullscreen must clear it or
  // the CSS height:100% never applies. Real hosts own the frame the same way.
  frame.style.height = mode === 'fullscreen' ? '' : frame.style.height;
  bridge.setHostContext({ displayMode: mode });
  void bridge.sendHostContextChange({ hostContext: { displayMode: mode } });
  return { mode };
};

(document.getElementById('collapse') as HTMLButtonElement).onclick = () => {
  document.body.dataset.mode = 'inline';
  frame.style.height = '160px';
  bridge.setHostContext({ displayMode: 'inline' });
  void bridge.sendHostContextChange({ hostContext: { displayMode: 'inline' } });
};

(document.getElementById('theme') as HTMLButtonElement).onclick = () => {
  theme = theme === 'light' ? 'dark' : 'light';
  const context = { theme, styles: { variables: claudeVariables(theme) } };
  bridge.setHostContext(context);
  void bridge.sendHostContextChange({ hostContext: context });
};

bridge.ondownloadfile = async ({ contents }) => {
  const first = contents[0] as { resource?: { uri?: string; blob?: string } };
  log(
    `ui/download-file: ${first?.resource?.uri ?? '?'} (${Math.round(((first?.resource?.blob?.length ?? 0) * 3) / 4 / 1024)} KB)`
  );
  return {};
};

bridge.onupdatemodelcontext = async (params) => {
  const text = params.content?.map((c) => ('text' in c ? c.text : '')).join(' ') ?? '';
  log(`update-model-context: ${text.slice(0, 220)}`);
  return {};
};

bridge.onsizechange = ({ width, height }) => {
  if (document.body.dataset.mode !== 'fullscreen' && height) {
    frame.style.height = `${Math.min(height, 600)}px`;
    log(`size-changed ${width ?? '?'}x${height}`);
  }
};

bridge.onopenlink = async ({ url }) => {
  log(`ui/open-link: ${url}`);
  return {};
};

bridge.oninitialized = () => {
  log(`initialized; app capabilities: ${JSON.stringify(bridge.getAppCapabilities())}`);
};

// Debug affordances for driving the harness from devtools.
(window as unknown as Record<string, unknown>).__bridge = bridge;
window.addEventListener('message', (event) => {
  const from =
    event.source === frame.contentWindow ? 'frame' : event.source === window ? 'self' : 'other';
  log(`[msg from ${from}] ${JSON.stringify(event.data).slice(0, 120)}`);
});

frame.addEventListener('load', () => {
  if (!frame.contentWindow) return;
  // eventTarget = where we post; eventSource = whose messages we accept.
  // Both are the frame's window: the app posts from inside it.
  // The file emulation goes in AFTER connect: a client-backed bridge installs
  // its own forwarding handlers when it connects, replacing earlier ones.
  void bridge
    .connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow))
    .then(() => installHostFile(bridge, client, (line) => log(line)));
  log('bridge connecting');
});
// Loaded only now: the frame must not finish loading before the listener above
// exists, which the top-level `await client.connect` would otherwise allow.
frame.src = frame.dataset.src!;

(document.getElementById('deliver') as HTMLButtonElement).onclick = async () => {
  // What a host does for the model: call open_document, then hand the result
  // to the widget. Bytes, not a path: this server runs in hosted mode.
  const bytes = new Uint8Array(await (await fetch(SAMPLE_DOCX)).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const args = { content_base64: btoa(binary), name: 'sample.docx' };
  await bridge.sendToolInput({ arguments: args });
  const result = await client.callTool({ name: 'open_document', arguments: args });
  await bridge.sendToolResult(result as Parameters<typeof bridge.sendToolResult>[0]);
  log('open_document delivered (sample.docx as bytes)');
};
