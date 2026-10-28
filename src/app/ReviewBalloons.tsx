/**
 * Review balloons. Click a tracked change in the page and a small card opens beside it:
 * author, the change, the thread, Accept and Reject, and a reply box. Comments open in the
 * comment rail instead (`CommentRail.tsx`). Moving the caret into a change opens nothing,
 * so typing never gets covered.
 *
 * Ported from the docx-editor.dev studio (`Balloons.tsx`). Built on public surface only:
 * painted runs carry `data-revision-id`, `data-paragraph-id`, `data-start`, and `data-end`,
 * and `useReview()` supplies the items and the decisions.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReview, useReviewAuthor, type ReviewItemView } from '@docx-editor.dev/pro/react';
import { useChromeTranslate } from '@docx-editor.dev/react';
import { CheckIcon, CloseIcon, SendIcon } from './icons.js';
import {
  STRINGS,
  authorColor,
  elementFor,
  formatDate,
  initialOf,
  itemAt,
  partnerOf,
  repliesOf,
  threadOf,
  verb,
} from './review-model.js';
import { onRevealReviewItem } from './reveal.js';

interface Anchor {
  readonly key: string;
  /** The painted run the balloon hangs from. */
  readonly element: Element;
}

/** Keeps the latest value in a ref without writing to it during render. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export function ReviewBalloons({ author }: { author: string }) {
  const { items } = useReview();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const itemsRef = useLatest(items);
  const anchorRef = useLatest(anchor);
  const close = useCallback(() => setAnchor(null), []);

  // A click on a change opens its balloon; a click elsewhere closes it.
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // The balloon and the rail (cards and markers) handle their own presses.
      if (!target || target.closest('.mcp-balloon, .docx-review')) return;
      if (!target.closest('.docx-pages')) {
        if (anchorRef.current && !target.closest('.mcp-panel, .mcp-formatting')) close();
        return;
      }
      const item = itemAt(target, itemsRef.current);
      // Commented text belongs to the rail; anything else that is not a change closes.
      if (!item || item.kind === 'comment') {
        close();
        return;
      }
      setViewport(target.closest<HTMLElement>('.mcp-viewport'));
      setAnchor({
        key: item.key,
        element: target.closest('[data-revision-id], [data-paragraph-id]') ?? target,
      });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) close();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, itemsRef, close]);

  /**
   * Open the balloon on the first item `match` accepts, once its text is painted. The page
   * may still be scrolling the item into view, so placement retries for about two seconds.
   * A newer request cancels an older one.
   */
  const pending = useRef<() => void>(() => {});
  const openWhenPainted = useCallback(
    (match: (key: string) => boolean, delay: number) => {
      pending.current();
      let frame = 0;
      let tries = 0;
      const place = () => {
        const found = itemsRef.current.find((entry) => match(entry.key));
        const item = threadOf(found, itemsRef.current);
        // A comment opens in the rail, on its card.
        if (item?.kind === 'comment') {
          setAnchor(null);
          return;
        }
        const element = item ? elementFor(item, document) : null;
        if (item && element) {
          setViewport(element.closest<HTMLElement>('.mcp-viewport'));
          setAnchor({ key: item.key, element });
          return;
        }
        if (tries++ < 120) frame = requestAnimationFrame(place);
      };
      const timer = window.setTimeout(() => (frame = requestAnimationFrame(place)), delay);
      pending.current = () => {
        window.clearTimeout(timer);
        cancelAnimationFrame(frame);
      };
    },
    [itemsRef]
  );
  useEffect(() => () => pending.current(), []);

  // Explicit navigation (the Changes panel, Review > Next Change, a new comment) asks for a
  // balloon. The active key alone is not used: it also moves with the caret.
  useEffect(
    () =>
      onRevealReviewItem((target) =>
        openWhenPainted(typeof target === 'string' ? (key) => key === target : target, 260)
      ),
    [openWhenPainted]
  );

  const item = anchor
    ? threadOf(
        items.find((entry) => entry.key === anchor.key),
        items
      )
    : undefined;
  // A decision that removes the item leaves `item` undefined, and the balloon renders
  // nothing; the next click replaces the stale anchor.

  // Mounted INSIDE the scroll container, in its content coordinates: the balloon scrolls
  // with its text and the viewport clips it, with no scroll listeners at all.
  if (!anchor || !item || !viewport) return null;
  return createPortal(
    <BalloonCard
      key={item.key}
      item={item}
      anchorElement={anchor.element}
      viewport={viewport}
      author={author}
    />,
    viewport
  );
}

function BalloonCard({
  item,
  anchorElement,
  viewport,
  author,
}: {
  item: ReviewItemView;
  anchorElement: Element;
  viewport: HTMLElement;
  author: string;
}) {
  const { accept, reject, items } = useReview();
  const t = useChromeTranslate();
  const partner = partnerOf(item, items);
  const info = useReviewAuthor(item.author);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: -9999, left: -9999, below: true });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const run = anchorElement.getBoundingClientRect();
    const frame = viewport.getBoundingClientRect();
    const runTop = run.top - frame.top + viewport.scrollTop;
    const runBottom = run.bottom - frame.top + viewport.scrollTop;
    const runLeft = run.left - frame.left + viewport.scrollLeft;
    const visibleBottom = viewport.scrollTop + viewport.clientHeight;
    const below =
      runBottom + 6 + height < visibleBottom - 8 || runTop - 6 - height < viewport.scrollTop;
    const top = below ? runBottom + 6 : runTop - 6 - height;
    const maxLeft = viewport.scrollLeft + viewport.clientWidth - width - 12;
    const left = Math.max(viewport.scrollLeft + 12, Math.min(runLeft - 10, maxLeft));
    // Measured from layout, so the first paint is already in place.
    setPosition({ top, left, below });
  }, [anchorElement, viewport]);

  const color = authorColor(item.author, info);
  const pairDelete = partner
    ? item.kind === 'revision' && item.revisionKind === 'delete'
      ? item
      : partner
    : undefined;
  const pairInsert = partner ? (pairDelete === item ? partner : item) : undefined;
  const replaced =
    pairDelete?.text ??
    (item.kind === 'revision' && item.revisionKind === 'replace' ? item.replacedText : '');
  const shownText = pairInsert?.text ?? item.text;
  const deleted = !partner && item.kind === 'revision' && item.revisionKind === 'delete';
  const decide = (decision: 'accept' | 'reject') => {
    const run = decision === 'accept' ? accept : reject;
    // Resolve the insertion first, then its deletion, re-reading the pair by key.
    if (pairInsert) run(pairInsert);
    if (pairDelete) {
      const fresh = items.find((entry) => entry.key === pairDelete.key);
      if (fresh) run(fresh);
      return;
    }
    run(item);
  };
  const when = formatDate(item.date);

  return (
    <div
      ref={ref}
      className="mcp-balloon"
      data-side={position.below ? 'below' : 'above'}
      role="dialog"
      aria-label={`${verb(item, t)} · ${item.author}`}
      style={{ top: position.top, left: position.left, ['--mcp-author' as string]: color }}
    >
      <div className="mcp-balloon__head">
        <span className="mcp-avatar" style={{ background: color }}>
          {item.initials}
        </span>
        <span className="mcp-balloon__author">{item.author}</span>
        {when ? <span className="mcp-balloon__date">{when}</span> : null}
        <span className="mcp-balloon__tools">
          <button
            type="button"
            className="mcp-balloon__tool"
            onClick={() => decide('accept')}
            disabled={item.readOnly}
            aria-label={t('review.accept')}
            title={t('review.accept')}
          >
            <CheckIcon />
          </button>
          <button
            type="button"
            className="mcp-balloon__tool"
            onClick={() => decide('reject')}
            disabled={item.readOnly}
            aria-label={t('review.reject')}
            title={t('review.reject')}
          >
            <CloseIcon />
          </button>
        </span>
      </div>
      <div className="mcp-balloon__body">
        <p className="mcp-balloon__change">
          <span className="mcp-balloon__verb">
            {replaced ? t('review.replaced') : verb(item, t)}:{' '}
          </span>
          {replaced ? <del>{replaced}</del> : null}
          {replaced ? ' ' : null}
          {deleted ? <del>{shownText}</del> : <span>{shownText}</span>}
        </p>
        <Thread replies={repliesOf(item, items)} />
      </div>
      <ReplyRow item={item} author={author} />
    </div>
  );
}

/** The reply line under a balloon or an open comment card: your avatar, the input, and send. */
export function ReplyRow({
  item,
  author,
  className = '',
}: {
  item: ReviewItemView;
  author: string;
  className?: string;
}) {
  const { reply } = useReview();
  const info = useReviewAuthor(author);
  const t = useChromeTranslate();
  const [draft, setDraft] = useState('');
  const submit = () => {
    if (draft.trim() && reply(item, draft.trim())) setDraft('');
  };
  return (
    <div
      className={`mcp-balloon__reply ${className}`.trim()}
      // The card must not take these presses and move focus away from the input.
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="mcp-avatar mcp-avatar--sm" style={{ background: authorColor(author, info) }}>
        {initialOf(author)}
      </span>
      <input
        className="mcp-balloon__input"
        placeholder={`${t('review.reply')}…`}
        aria-label={t('review.reply')}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          // Hosts can block native form submission before a submit handler runs.
          event.preventDefault();
          event.stopPropagation();
          submit();
        }}
      />
      <button
        type="button"
        className="mcp-balloon__send"
        disabled={!draft.trim()}
        aria-label={t('review.reply')}
        title={t('review.reply')}
        onClick={submit}
      >
        <SendIcon />
      </button>
    </div>
  );
}

export function Thread({ replies }: { replies: readonly ReviewItemView[] }) {
  if (replies.length === 0) return null;
  return (
    <ol className="mcp-thread" aria-label={STRINGS.replies}>
      {replies.map((entry) => (
        <ThreadReply key={entry.key} reply={entry} />
      ))}
    </ol>
  );
}

function ThreadReply({ reply }: { reply: ReviewItemView }) {
  const info = useReviewAuthor(reply.author);
  const when = formatDate(reply.date);
  return (
    <li className="mcp-thread__reply">
      <span
        className="mcp-avatar mcp-avatar--xs"
        style={{ background: authorColor(reply.author, info) }}
      >
        {reply.initials}
      </span>
      <span className="mcp-thread__body">
        <span className="mcp-thread__head">
          <span className="mcp-thread__author">{reply.author}</span>
          {when ? <span className="mcp-thread__date">{when}</span> : null}
        </span>
        <bdi className="mcp-thread__text">{reply.text}</bdi>
      </span>
    </li>
  );
}
