/**
 * Asks the comment rail or a change balloon to open on a review item.
 *
 * The editor's active key does not change when the reader selects the active item again,
 * so the key alone cannot reopen a balloon the reader closed. Ported from the
 * docx-editor.dev studio (`reveal.ts`).
 */
import { useEffect, useRef } from 'react';

const EVENT = 'mcp:reveal-review-item';

export type RevealTarget = string | ((key: string) => boolean);

export function revealReviewItem(target: RevealTarget): void {
  window.dispatchEvent(new CustomEvent<RevealTarget>(EVENT, { detail: target }));
}

export function onRevealReviewItem(handler: (target: RevealTarget) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<RevealTarget>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/**
 * Review > Previous Change and Next Change move the active item but do not ask for a
 * balloon. When the active item moves right after a menu interaction, ask for it here. A
 * caret move in the document also moves the active item, so the menu check keeps those out.
 */
export function useRevealOnMenuNavigation(activeKey: string | null): void {
  const fromMenu = useRef(false);
  useEffect(() => {
    const note = (event: Event) => {
      const target = event.target as Element | null;
      fromMenu.current = !!target?.closest?.('.docx-menubar, [role="menu"]');
    };
    window.addEventListener('pointerdown', note, true);
    window.addEventListener('keydown', note, true);
    return () => {
      window.removeEventListener('pointerdown', note, true);
      window.removeEventListener('keydown', note, true);
    };
  }, []);
  useEffect(() => {
    if (activeKey && fromMenu.current) revealReviewItem(activeKey);
  }, [activeKey]);
}
