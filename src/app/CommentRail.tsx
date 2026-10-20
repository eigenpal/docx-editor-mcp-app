/**
 * The comment rail: the engine's review rail (`DocxEditorReview`), limited to comments.
 *
 * Tracked changes open their own balloon (`ReviewBalloons.tsx`), so the rail stacks only
 * the threads. Closed, it leaves an initials badge in the margin beside each open thread
 * and a check badge beside each resolved one. The open card shows the thread and the reply
 * line the balloon uses, so every avatar draws in the same author colors.
 *
 * The rail owns its open state: commented text, a marker, or navigation opens it on that
 * thread; a click on the canvas or on plain page text, or Escape, closes it.
 *
 * Ported from the docx-editor.dev studio (`CommentRail.tsx`). The engine's
 * `overflow: 'scroll'` pane option replaces the studio's own room-for-cards logic.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import {
  DocxEditorReview,
  useReview,
  useReviewItem,
  type ReviewItemView,
} from '@docx-editor.dev/pro/react';
import { useDocxEditor } from '@docx-editor.dev/react';
import { CheckIcon } from './icons.js';
import { ReplyRow, Thread } from './ReviewBalloons.js';
import { itemAt, repliesOf, threadOf } from './review-model.js';
import { onRevealReviewItem } from './reveal.js';

/** Comment threads. A reply to a tracked change shows in that change's balloon instead. */
const isComment = (item: ReviewItemView) =>
  item.kind === 'comment' && item.parentRevisionId === undefined;

/** The scrollbar band along the viewport's edges (the editor's 14px scrollbar). */
const SCROLLBAR_BAND = 14;

export function CommentRail({ author, panelOpen }: { author: string; panelOpen: boolean }) {
  useRailOpening(panelOpen);
  useRevealOpenCard();
  useFocusCardFromMarker(panelOpen);
  // The same card in the column and in compact mode, where the engine reads the rail's own
  // children rather than the list's.
  const card: ReactNode[] = [
    <DocxEditorReview.Replies key="replies" hidden />,
    <DocxEditorReview.Reply key="reply" hidden />,
    <CardThread key="thread" />,
    <CardReply key="reply-row" author={author} />,
  ];
  return (
    <DocxEditorReview
      card={{ className: 'mcp-comment-card' }}
      filter={isComment}
      structural={false}
    >
      <DocxEditorReview.List>{card}</DocxEditorReview.List>
      <DocxEditorReview.Markers
        icon={(item) =>
          item.kind !== 'comment' ? null : item.resolved ? (
            <span className="mcp-comment-badge" data-comment-key={item.key} data-resolved="">
              <CheckIcon />
            </span>
          ) : (
            <span
              className="mcp-comment-badge"
              data-comment-key={item.key}
              data-replies={item.replyIds.length || undefined}
            >
              {item.initials}
            </span>
          )
        }
      />
      {card}
    </DocxEditorReview>
  );
}

/** Open and close the rail from the page, from navigation, and from Escape. */
function useRailOpening(panelOpen: boolean) {
  const editor = useDocxEditor();
  const { items, setPaneOpen, setActive } = useReview();
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // The rail starts closed: its markers sit in the margin until a comment is opened. An
  // open thread keeps the page's size and the document scrolls sideways to its card.
  useEffect(() => {
    editor?.setReviewPaneOptions({ opening: 'manual', overflow: 'scroll' });
    setPaneOpen(false);
  }, [editor, setPaneOpen]);

  useEffect(() => {
    if (panelOpen) setPaneOpen(false);
  }, [panelOpen, setPaneOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    const onClick = (event: MouseEvent) => {
      const marker = (event.target as Element | null)?.closest?.('.docx-review__marker');
      const key = marker?.querySelector<HTMLElement>('[data-comment-key]')?.dataset.commentKey;
      const item = itemsRef.current.find((entry) => entry.key === key);
      // Resolved comments have no panel row, so keep their floating cards available.
      if (!item || item.kind !== 'comment' || item.resolved) return;
      event.preventDefault();
      event.stopPropagation();
      setPaneOpen(false);
      setActive(item.key);
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-review-key="${CSS.escape(item.key)}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [panelOpen, setPaneOpen, setActive]);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // The rail (cards and markers) and the balloon handle their own presses.
      if (!target || target.closest('.docx-review, .mcp-balloon')) return;
      if (!target.closest('.docx-pages')) {
        // The canvas around the page closes the rail; the toolbar, the panel, and the
        // viewport's own scrollbar do not.
        const viewport = target.closest<HTMLElement>('.mcp-viewport');
        // Overlay scrollbars take no width, so the band along each edge counts too.
        const onScrollbar =
          target === viewport &&
          (event.offsetX >= viewport.clientWidth - SCROLLBAR_BAND ||
            event.offsetY >= viewport.clientHeight - SCROLLBAR_BAND);
        if (viewport && !onScrollbar) setPaneOpen(false);
        return;
      }
      const item = itemAt(target, itemsRef.current);
      if (item?.kind === 'comment') {
        setPaneOpen(true);
        setActive(item.key);
      } else if (!item) {
        setPaneOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      // An open menu, list, or dialog closes first, wherever focus is: a toolbar list
      // opened by a click leaves focus in the page.
      if (
        (event.target as Element | null)?.closest?.('.mcp-panel') ||
        document.querySelector('[role="dialog"]:not(.mcp-balloon), [role="listbox"], [role="menu"]')
      )
        return;
      // A reply being typed keeps the rail open; Escape first leaves the input.
      const field = event.target as HTMLInputElement | null;
      if (field?.closest?.('.mcp-card-reply') && field.value) {
        field.blur();
        return;
      }
      setPaneOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [setPaneOpen, setActive]);

  // Navigation (the Changes panel, Review > Next Change, a new comment) opens a comment here.
  useEffect(
    () =>
      onRevealReviewItem((target) => {
        // The review state may not carry a new comment yet: look again on the next frames.
        let tries = 0;
        const look = () => {
          const match = typeof target === 'string' ? (key: string) => key === target : target;
          const found = itemsRef.current.find((entry) => match(entry.key));
          const item = threadOf(found, itemsRef.current);
          if (item?.kind === 'comment') {
            setPaneOpen(true);
            setActive(item.key);
            return;
          }
          if (!found && tries++ < 30) requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }),
    [setPaneOpen, setActive]
  );
}

/**
 * An opened thread whose card sits past the viewport's edge scrolls into view sideways, so
 * the reader sees the card and that the area scrolls. A new comment's draft card has no
 * key yet; it takes focus as it opens, so focus inside a card reveals it too.
 */
function useRevealOpenCard() {
  const { paneOpen, activeKey } = useReview();
  useEffect(() => {
    if (!paneOpen || !activeKey) return;
    return revealCard(() => document.querySelector<HTMLElement>('.docx-review__card[data-active]'));
  }, [paneOpen, activeKey]);
  useEffect(() => {
    let cancel = () => {};
    const onFocus = (event: FocusEvent) => {
      const card = (event.target as Element | null)?.closest?.<HTMLElement>('.docx-review__card');
      if (!card) return;
      cancel();
      cancel = revealCard(() => card);
    };
    document.addEventListener('focusin', onFocus);
    return () => {
      cancel();
      document.removeEventListener('focusin', onFocus);
    };
  }, []);
}

/** Scrolls the card's viewport sideways until the card shows. Returns a cancel function. */
function revealCard(find: () => HTMLElement | null): () => void {
  let frame = 0;
  let tries = 0;
  const reveal = () => {
    const card = find();
    const scroller = card?.closest<HTMLElement>('.mcp-viewport');
    if (!card || !scroller) {
      if (tries++ < 20) frame = requestAnimationFrame(reveal);
      return;
    }
    const overflow =
      card.getBoundingClientRect().right + 16 - scroller.getBoundingClientRect().right;
    if (overflow <= 0) return;
    // The room for the card may not be laid out yet: wait until the area can scroll that far.
    const room = scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft;
    if (room < overflow && tries++ < 30) {
      frame = requestAnimationFrame(reveal);
      return;
    }
    scroller.scrollBy({ left: overflow, behavior: 'smooth' });
  };
  frame = requestAnimationFrame(reveal);
  return () => cancelAnimationFrame(frame);
}

/** A marker opened from the keyboard hands focus to its card, which replaces the marker. */
function useFocusCardFromMarker(panelOpen: boolean) {
  useEffect(() => {
    if (panelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const marker = (event.target as Element | null)?.closest?.('.docx-review__marker');
      if (!marker) return;
      let tries = 0;
      const focus = () => {
        const card = document.querySelector<HTMLElement>('.docx-review__card[data-active]');
        if (card) card.focus({ preventScroll: true });
        else if (tries++ < 30) requestAnimationFrame(focus);
      };
      requestAnimationFrame(focus);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen]);
}

/** The card's replies, drawn like the balloon's. */
function CardThread() {
  const item = useReviewItem();
  const { items } = useReview();
  if (!item || item.kind !== 'comment') return null;
  return <Thread replies={repliesOf(item, items)} />;
}

/** The open card's reply line. */
function CardReply({ author }: { author: string }) {
  const item = useReviewItem();
  if (!item || item.kind !== 'comment' || !item.isActive) return null;
  return <ReplyRow item={item} author={author} className="mcp-card-reply" />;
}
