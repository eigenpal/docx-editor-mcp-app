/**
 * The "Claude is working" pill for the fullscreen title bar — the one
 * guideline-legitimate place for a persistent indicator (floating panels are
 * forbidden). A dot pulses while a tool call runs, the label names it in the
 * reader's terms, and the pill lingers briefly after the last call settles so a
 * rapid burst reads as one session of activity rather than a flicker.
 */

import { useEffect, useState } from 'react';
import { getToolDisplayName } from '../shared/catalog.js';
import { useActivity } from './ToolHost.js';

const LINGER_MS = 1500;

export function AgentStatus() {
  const { running } = useActivity();
  const [label, setLabel] = useState<string | null>(null);

  // Adjust-during-render (React's "derived state" pattern): while a call runs,
  // the label follows it synchronously, with no effect and no extra frame.
  const live = running ? getToolDisplayName(running) : null;
  if (live !== null && live !== label) setLabel(live);

  // The linger is the only genuinely asynchronous part: clear the label a
  // moment after the last call settles, so a burst reads as one session.
  useEffect(() => {
    if (running) return;
    const timer = setTimeout(() => setLabel(null), LINGER_MS);
    return () => clearTimeout(timer);
  }, [running]);

  if (label === null) return null;
  return (
    <span className="agent-pill" data-live={running ? 'true' : 'false'}>
      <span className="agent-dot" aria-hidden="true" />
      {running ? label : 'Done'}
    </span>
  );
}
