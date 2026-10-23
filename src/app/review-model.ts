/**
 * Review data helpers for the comment rail, the change balloons, and the Changes panel.
 *
 * Ported from the docx-editor.dev studio (`src/components/editor/studio/review.ts` and
 * `Balloons.tsx`), so the widget lists, groups, and colors review items the same way the
 * demo does. Everything here reads the public `useReview()` items and the painted page.
 */
import type { ReviewItemView } from '@docx-editor.dev/pro/react';
import type { ChromeTranslate } from '@docx-editor.dev/react';

/** The demo's own English strings. Every other label comes from the engine's catalog. */
export const STRINGS = {
  changes: 'Changes and Comments',
  panel: 'Changes and Comments',
  openPanel: 'Show changes and comments',
  closePanel: 'Hide changes and comments',
  replies: 'Replies',
  emptyHint: 'Turn on Suggesting in the toolbar. Changes and comments show here.',
  justNow: 'Just now',
  minutesAgo: (count: number) => `${count}m ago`,
  hoursAgo: (count: number) => `${count}h ago`,
} as const;

/**
 * Top-level review entries: changes and open comment threads. Replies are not entries, and
 * neither is a comment that answers a tracked change: it shows inside that change's thread.
 */
export function topLevel(items: readonly ReviewItemView[]): ReviewItemView[] {
  return items.filter((item) => {
    if (item.kind === 'comment') {
      return item.parentId === undefined && item.parentRevisionId === undefined && !item.resolved;
    }
    return item.kind === 'revision';
  });
}

/** Every revision id an item answers to: its own, and the ones a paired change covers. */
export function revisionIds(item: ReviewItemView): readonly string[] {
  if (item.kind !== 'revision' || item.item.kind !== 'revision') return [];
  return [item.id, ...item.item.addresses.map((address) => address.id)];
}

/** The replies under an item, in thread order. */
export function repliesOf(
  item: ReviewItemView,
  items: readonly ReviewItemView[]
): ReviewItemView[] {
  return item.replyIds.flatMap((id) => items.filter((entry) => entry.id === id));
}

/** The open thread an item belongs to: a reply maps to its parent; resolved threads have none. */
export function threadOf(
  item: ReviewItemView | undefined,
  items: readonly ReviewItemView[]
): ReviewItemView | undefined {
  if (item?.kind === 'comment' && item.parentId !== undefined) {
    return threadOf(
      items.find((entry) => entry.kind === 'comment' && entry.replyIds.includes(item.id)),
      items
    );
  }
  if (item?.kind === 'comment' && item.parentRevisionId !== undefined) {
    const revisionId = item.parentRevisionId;
    return items.find((entry) => revisionIds(entry).includes(revisionId)) ?? item;
  }
  if (item?.kind === 'comment' && item.resolved) return undefined;
  return item;
}

/** The review item a painted element belongs to, if any. */
export function itemAt(
  target: Element,
  items: readonly ReviewItemView[]
): ReviewItemView | undefined {
  const revision = target.closest<HTMLElement>('[data-revision-id]');
  if (revision) {
    const id = revision.dataset.revisionId!;
    const hit = items.find((item) => item.kind === 'revision' && revisionIds(item).includes(id));
    if (hit) return hit;
  }
  const run = target.closest<HTMLElement>('[data-paragraph-id][data-start]');
  if (!run) return undefined;
  const paragraphId = run.dataset.paragraphId!;
  const start = Number(run.dataset.start);
  const end = Number(run.dataset.end ?? start);
  return items.find((item) => {
    if (item.kind !== 'comment' || item.parentId !== undefined || item.resolved) return false;
    if (item.item.kind !== 'comment' || !item.item.range) return false;
    const range = item.item.range;
    const afterStart = range.start.paragraphId !== paragraphId || end > range.start.offset;
    const beforeEnd = range.end.paragraphId !== paragraphId || start < range.end.offset;
    const inParagraph =
      range.start.paragraphId === paragraphId || range.end.paragraphId === paragraphId;
    return inParagraph && afterStart && beforeEnd;
  });
}

/** The painted element of a tracked change, to anchor a balloon opened by navigation. */
export function elementFor(item: ReviewItemView, root: ParentNode): Element | null {
  for (const id of revisionIds(item)) {
    const element = root.querySelector(`[data-revision-id="${CSS.escape(id)}"]`);
    if (element) return element;
  }
  return null;
}

/** The deletion ends exactly where the insertion starts: one edit that replaced words. */
function touches(deletion: ReviewItemView, insertion: ReviewItemView): boolean {
  if (deletion.item.kind !== 'revision' || insertion.item.kind !== 'revision') return false;
  const end = deletion.item.ranges[deletion.item.ranges.length - 1]?.end;
  const start = insertion.item.ranges[0]?.start;
  return Boolean(
    end && start && end.paragraphId === start.paragraphId && end.offset === start.offset
  );
}

/**
 * A deletion directly followed by an insertion from one author, at the same spot, reads and
 * resolves as one replacement. Changes that are merely near each other stay separate.
 */
export function partnerOf(
  item: ReviewItemView,
  items: readonly ReviewItemView[]
): ReviewItemView | undefined {
  if (item.kind !== 'revision') return undefined;
  const index = items.findIndex((entry) => entry.key === item.key);
  const other =
    item.revisionKind === 'delete'
      ? items[index + 1]
      : item.revisionKind === 'insert'
        ? items[index - 1]
        : undefined;
  if (!other || other.kind !== 'revision' || other.author !== item.author) return undefined;
  const wanted = item.revisionKind === 'delete' ? 'insert' : 'delete';
  if (other.revisionKind !== wanted || other.readOnly !== item.readOnly) return undefined;
  const [deletion, insertion] = item.revisionKind === 'delete' ? [item, other] : [other, item];
  return touches(deletion, insertion) ? other : undefined;
}

export function verb(item: ReviewItemView, t: ChromeTranslate): string {
  if (item.kind === 'comment') return t('common.comment');
  if (item.kind !== 'revision') return t('review.structural');
  switch (item.revisionKind) {
    case 'insert':
      return t('review.inserted');
    case 'delete':
      return t('review.deleted');
    case 'replace':
      return t('review.replaced');
    case 'format':
      return t('revisions.runPropertiesChanged');
    case 'paragraphMark':
      return t('revisions.paragraphMarkInserted');
    case 'moveFrom':
      return t('review.movedFrom');
    case 'moveTo':
      return t('review.movedTo');
    case 'structural': {
      // A whole-row decision carries no words of its own; name the row change instead.
      const changes = item.item.kind === 'revision' ? (item.item.structuralChanges ?? []) : [];
      if (changes.includes('rowInsert')) return t('revisions.structuralDetails.rowInsert');
      if (changes.includes('rowDelete')) return t('revisions.structuralDetails.rowDelete');
      return t('review.structural');
    }
    default:
      return t('review.structural');
  }
}

export function relativeTime(date: string | undefined): string {
  if (!date) return '';
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return STRINGS.justNow;
  if (minutes < 60) return STRINGS.minutesAgo(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return STRINGS.hoursAgo(hours);
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDate(date: string | undefined): string {
  if (!date) return '';
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const day = value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

const paintedSlots = new Map<string, number>();

/** Forget cached author slots when a different document opens: slots are per document. */
export function forgetAuthorSlots(): void {
  paintedSlots.clear();
}

/**
 * Colors this widget declared for authors (the reader's own, through `DocxEditor.AuthorStyle`).
 * `useReviewAuthor` reads declarations only inside the review rail, so surfaces outside it
 * (the Changes panel, the balloons) read them here and draw the same color.
 */
const declaredColors = new Map<string, string>();

/** Record (or with `null`, forget) the color the widget declared for an author. */
export function declareAuthorColor(author: string, color: string | null): void {
  if (color) declaredColors.set(author, color);
  else declaredColors.delete(author);
}

/**
 * The color an author is drawn in: their declared color, else their slot on the engine's
 * author ramp (from the review state or the painted page), else a stable slot from their name.
 */
export function authorColor(
  author: string,
  info?: { readonly color?: string; readonly slot?: number }
): string {
  const declared = declaredColors.get(author);
  if (declared) return declared;
  if (info?.color) return info.color;
  let slot = info?.slot ?? paintedSlots.get(author);
  // The painted page names each author's ramp slot. Read it once, so the avatar matches
  // the ink. Slots are stable for a document, so the lookup is cached per author.
  if (slot === undefined && typeof document !== 'undefined') {
    const painted = document.querySelector<HTMLElement>(
      `[data-review-author="${CSS.escape(author)}"][data-review-author-slot]`
    );
    const value = painted ? Number(painted.dataset.reviewAuthorSlot) : NaN;
    if (Number.isFinite(value)) {
      slot = value;
      paintedSlots.set(author, value);
    }
  }
  if (slot === undefined) {
    slot = 0;
    for (const character of author) slot = (slot * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `var(--doc-review-author-${slot % 8})`;
}

/** Up to two initials, from the first two words, as the review rail's cards show them. */
export function initialOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
  return letters.toUpperCase() || '?';
}
