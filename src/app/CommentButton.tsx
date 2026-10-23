/**
 * Comment on the selected text: a small form under the toolbar button. The comment lands
 * through the review module, so its rail card and its row in the Changes panel follow.
 *
 * Ported from the docx-editor.dev studio (`CommentButton.tsx`).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReview } from '@docx-editor.dev/pro/react';
import { useChromeTranslate } from '@docx-editor.dev/react';
import { CommentAddIcon } from './icons.js';
import { revealReviewItem } from './reveal.js';

export function CommentButton() {
  const { comment, selectionAnchorY, items } = useReview();
  const t = useChromeTranslate();
  const [open, setOpen] = useState(false);
  const [refused, setRefused] = useState(false);
  const [text, setText] = useState('');
  const [alignEnd, setAlignEnd] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const hasSelection = selectionAnchorY !== null;

  // This button sits at the toolbar's end: open toward the start when the form would pass
  // the frame's edge.
  useLayoutEffect(() => {
    if (!open || !trigger.current || !form.current) return;
    const start = trigger.current.getBoundingClientRect().left;
    setAlignEnd(start + form.current.offsetWidth > document.documentElement.clientWidth - 8);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    const known = new Set(items.map((item) => item.key));
    if (!comment(body)) {
      setRefused(true);
      return;
    }
    setRefused(false);
    setText('');
    setOpen(false);
    // Show the new thread once the review state carries it.
    requestAnimationFrame(() => revealReviewItem((key) => !known.has(key)));
  };

  return (
    <div className="mcp-menu" ref={ref}>
      <button
        ref={trigger}
        type="button"
        className="docx-toolbar__button mcp-toolbar-icon"
        aria-label={t('common.comment')}
        title={hasSelection ? t('common.comment') : t('disabledReason.commentSelection')}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!hasSelection && !open}
        // Keep the document selection: the comment is anchored to it.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        <CommentAddIcon />
      </button>
      {open ? (
        <form
          ref={form}
          className="mcp-menu__pop mcp-comment"
          data-align={alignEnd ? 'end' : undefined}
          role="dialog"
          aria-label={t('common.comment')}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <textarea
            className="mcp-comment__input"
            placeholder={t('comments.addComment')}
            aria-label={t('comments.addComment')}
            rows={3}
            // Focus moves here on purpose; the engine keeps the selection to anchor to.
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false);
                trigger.current?.focus();
              }
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submit();
              }
            }}
          />
          {refused ? (
            <p className="mcp-comment__error" role="alert">
              {t('review.commentRefused')}
            </p>
          ) : null}
          <div className="mcp-comment__actions">
            <button
              type="button"
              className="mcp-btn mcp-btn--quiet mcp-btn--sm"
              onClick={() => setOpen(false)}
            >
              {t('revisionMarkup.cancel')}
            </button>
            <button
              type="submit"
              className="mcp-btn mcp-btn--primary mcp-btn--sm"
              disabled={!text.trim()}
            >
              {t('common.comment')}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
