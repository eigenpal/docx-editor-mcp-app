import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { App } from '@modelcontextprotocol/ext-apps';
import { RELEASES_URL, UPDATE_RESOURCE, UpdateInfo } from '../shared/updates.js';
import './plugin-update.css';

export function usePluginUpdate(app: App | null, connected: boolean): ReactNode {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);
  useEffect(() => {
    if (!app || !connected) return;
    let cancelled = false;
    void app
      .readServerResource({ uri: UPDATE_RESOURCE })
      .then((result) => {
        const content = result.contents[0];
        if (!content || !('text' in content)) return;
        const parsed = UpdateInfo.safeParse(JSON.parse(content.text));
        if (!cancelled && parsed.success) setUpdate(parsed.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [app, connected]);
  if (!app || !update?.latest || dismissed) return null;
  return (
    <aside className="plugin-update" aria-label="Plugin update">
      <span>docx-editor {update.latest} is available.</span>
      <button
        type="button"
        onClick={() => {
          void app
            .openLink({ url: `${RELEASES_URL}/tag/v${update.latest}` })
            .then((result) => setLinkFailed(result.isError === true))
            .catch(() => setLinkFailed(true));
        }}
      >
        Get update
      </button>
      {linkFailed && <span role="status">Open the release page at {RELEASES_URL}.</span>}
      <button type="button" onClick={() => setDismissed(true)}>
        Later
      </button>
    </aside>
  );
}
