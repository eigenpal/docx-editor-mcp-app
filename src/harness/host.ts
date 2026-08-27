/**
 * A minimal MCP Apps HOST, for local verification only (built into the
 * gitignored `public/__harness/`, never shipped). It renders the built widget
 * shell in an iframe, runs the real `ui/initialize` handshake through the
 * SDK's AppBridge, answers display-mode and download requests the way a host
 * would, and exposes buttons that drive the widget's registered tools.
 */

import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import { PostMessageTransport } from '@modelcontextprotocol/ext-apps';
import type { McpUiStyles } from '@modelcontextprotocol/ext-apps';

const frame = document.getElementById('frame') as HTMLIFrameElement;
const log = (line: string) => {
  const el = document.getElementById('log')!;
  el.textContent = `${line}\n${el.textContent ?? ''}`.slice(0, 6000);
};

const bridge = new AppBridge(
  null,
  { name: 'harness', version: '0.0.0' },
  { serverTools: {}, downloadFile: {}, openLinks: {}, logging: {} }
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

const theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
bridge.setHostContext({
  theme,
  styles: { variables: claudeVariables(theme) },
  displayMode: 'inline',
  availableDisplayModes: ['inline', 'fullscreen'],
  safeAreaInsets: { top: 0, right: 0, bottom: 24, left: 0 },
  platform: 'web',
});

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
  void bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
  log('bridge connecting');
});

(document.getElementById('deliver') as HTMLButtonElement).onclick = () => {
  // The notification's params ARE the CallToolResult — no wrapper. A real
  // public sample file, delivered by URL, so the widget exercises the whole
  // `/fetch` proxy path a deployment would (a localhost URL would be refused
  // by the proxy's own SSRF guard, correctly).
  void bridge.sendToolResult({
    content: [{ type: 'text', text: 'Opening sample.docx in the editor.' }],
    structuredContent: {
      url: 'https://raw.githubusercontent.com/eigenpal/docx-editor/main/examples/vite/public/sample.docx',
      name: 'sample.docx',
    },
  });
  log('toolresult delivered (sample.docx by URL)');
};

async function callAppTool(name: string, args: Record<string, unknown>) {
  try {
    const result = await bridge.callTool({ name, arguments: args });
    log(`${name} → ${JSON.stringify(result).slice(0, 300)}`);
    return result as { structuredContent?: Record<string, unknown> };
  } catch (error) {
    log(`${name} FAILED: ${String(error)}`);
    return null;
  }
}

async function firstParagraph(): Promise<{ id: string; text: string } | null> {
  const read = await callAppTool('read_document', {});
  const paragraphs = read?.structuredContent?.paragraphs as
    { id: string; text: string }[] | undefined;
  return paragraphs?.[0] ?? null;
}

(document.getElementById('read') as HTMLButtonElement).onclick = () =>
  void callAppTool('read_document', {});
(document.getElementById('edit') as HTMLButtonElement).onclick = async () => {
  const first = await firstParagraph();
  if (!first) return log('no paragraph to edit');
  const word = first.text.split(/\s+/)[0];
  await callAppTool('edit_text', {
    paragraphId: first.id,
    search: word,
    replacement: `${word} (edited)`,
  });
};
(document.getElementById('comment') as HTMLButtonElement).onclick = async () => {
  const first = await firstParagraph();
  if (!first) return log('no paragraph to comment on');
  await callAppTool('add_comment', {
    paragraphId: first.id,
    search: first.text.split(/\s+/)[0],
    comment: 'Harness comment: consider rephrasing this.',
  });
};
(document.getElementById('readchanges') as HTMLButtonElement).onclick = () =>
  void callAppTool('read_changes', {});
(document.getElementById('readcomments') as HTMLButtonElement).onclick = () =>
  void callAppTool('read_comments', {});
