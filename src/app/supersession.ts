/**
 * Widget-instance supersession, per Claude's documented pattern.
 *
 * Every `open_document` call mounts a NEW widget iframe, and the host never
 * unmounts the old ones. Without an election, a conversation with three opens
 * has three live previews of one file, each polling it and saving to it.
 *
 * All instances of one connector share a sandbox origin, so a
 * `BroadcastChannel` reaches every sibling in the conversation. The server
 * stamps each tool result with `{createdAt, seq}`; the newest key wins.
 * Superseded instances report it through the returned store, and the widget
 * greys out and stops syncing its file.
 */

interface ElectionKey {
  createdAt: number;
  seq?: number;
}

interface PeerMessage {
  type: 'hello' | 'born';
  instanceId: string;
  createdAt: number;
  seq?: number;
}

interface SupersessionStore {
  /** Call when the tool result delivers the key. */
  adoptKey: (key: ElectionKey) => void;
  readonly superseded: boolean;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}

export function createSupersession(instanceId: string): SupersessionStore {
  let key: ElectionKey | null = null;
  let superseded = false;
  const peers = new Map<string, PeerMessage>();
  const listeners = new Set<() => void>();

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel('docx-editor-supersede');
  } catch {
    // No BroadcastChannel (very old WebView): every instance stays live,
    // which is the pre-election behavior, not a crash.
  }

  const isYounger = (peer: PeerMessage): boolean => {
    if (!key) return false;
    if (peer.createdAt !== key.createdAt) return peer.createdAt > key.createdAt;
    if (peer.seq != null && key.seq != null && peer.seq !== key.seq) return peer.seq > key.seq;
    return peer.instanceId > instanceId;
  };

  const recompute = () => {
    const next = [...peers.values()].some(isYounger);
    if (next === superseded) return;
    superseded = next;
    for (const listener of listeners) listener();
  };

  if (channel) {
    channel.onmessage = (event: MessageEvent<PeerMessage>) => {
      const message = event.data;
      if (!message || message.instanceId === instanceId) return;
      if (!key) return; // announce() replays our side once the key arrives
      if (message.type === 'hello') {
        channel?.postMessage({
          type: 'born',
          instanceId,
          createdAt: key.createdAt,
          seq: key.seq,
        } satisfies PeerMessage);
      }
      peers.set(message.instanceId, message);
      recompute();
    };
  }

  return {
    adoptKey(next) {
      key = next;
      channel?.postMessage({
        type: 'hello',
        instanceId,
        createdAt: next.createdAt,
        seq: next.seq,
      } satisfies PeerMessage);
      recompute();
    },
    get superseded() {
      return superseded;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      channel?.close();
    },
  };
}
