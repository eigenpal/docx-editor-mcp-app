/**
 * Small widget helpers kept out of `main.tsx`, which sits near the line cap.
 */

import type { App } from '@modelcontextprotocol/ext-apps';
import type { OpenedFile } from './host-file.js';
import type { OpenRequest } from './load-document.js';

/**
 * The host's layout hints, as CSS variables. Insets are written only when the
 * context actually carries them: `hostcontextchanged` sends PARTIAL contexts,
 * and a theme-only change must not wipe real insets back to zero.
 */
export function applyHostContext(app: App): void {
  const context = app.getHostContext();
  const root = document.documentElement;
  const insets = context?.safeAreaInsets;
  if (insets) {
    root.style.setProperty('--safe-top', `${insets.top}px`);
    root.style.setProperty('--safe-right', `${insets.right}px`);
    root.style.setProperty('--safe-bottom', `${insets.bottom}px`);
    root.style.setProperty('--safe-left', `${insets.left}px`);
  }
  if (context?.deviceCapabilities?.touch !== undefined) {
    root.dataset.touch = String(context.deviceCapabilities.touch);
  }
}

/**
 * The request for a host-opened file. The host can announce one file twice
 * (tool input, then tool result); the same file keeps the same request object,
 * so the document is read once.
 */
export function adoptFile(current: OpenRequest | null, file: OpenedFile): OpenRequest {
  return current?.file?.resourceUri === file.resourceUri ? current : { name: file.name, file };
}
