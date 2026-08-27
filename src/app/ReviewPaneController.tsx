/**
 * Opens and closes the review rail as the fullscreen frame changes width.
 *
 * Renders nothing. Wide frames get the rail (suggestion cards beside the page);
 * narrow ones get the packaged 32px marker strip a closed rail collapses to —
 * tapping a marker still opens the item, and `zoomMode: 'auto'` re-fits the
 * page to the reclaimed width on its own.
 *
 * Acts only on width-bucket TRANSITIONS. A user who closed the rail at a wide
 * width has made a decision; re-opening it on every resize event would fight
 * them, so the last bucket is remembered and only a crossing acts.
 */

import { useEffect, useRef } from 'react';
import { useReviewOf } from '@docx-editor.dev/pro/react';
import type { DocxEditorInstance } from '@docx-editor.dev/core/editor';

/**
 * Below this, an open rail pins the page at the 50% zoom floor; above it the
 * page keeps a comfortable ~80%+ beside an open rail.
 */
const WIDE_MIN_PX = 960;

export function ReviewPaneController({ editor }: { editor: DocxEditorInstance | null }) {
  const review = useReviewOf(editor);
  const bucketRef = useRef<'wide' | 'narrow' | null>(null);
  const reviewRef = useRef(review);
  useEffect(() => {
    reviewRef.current = review;
  }, [review]);

  useEffect(() => {
    if (!editor) return;
    const target = document.documentElement;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      const bucket = width >= WIDE_MIN_PX ? 'wide' : 'narrow';
      if (bucket === bucketRef.current) return;
      const isFirst = bucketRef.current === null;
      bucketRef.current = bucket;
      // The first observation establishes the bucket without acting: inline
      // boot is always narrow, and snapping the pane there would be noise.
      if (isFirst) return;
      const current = reviewRef.current;
      if (bucket === 'wide' && current.items.length > 0) current.setPaneOpen(true);
      if (bucket === 'narrow') current.setPaneOpen(false);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [editor]);

  return null;
}
