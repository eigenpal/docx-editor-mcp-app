/**
 * The right-hand Changes panel: every tracked change and open comment, filterable by author.
 * Selecting a row shows it in the page and opens its balloon or its comment card; the row's
 * own buttons accept or reject in place.
 *
 * Ported from the docx-editor.dev studio (`SidePanel.tsx` and `ChangesList.tsx`), with the
 * Changes tab only: this widget has no agent and no settings tab.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useReview, useReviewAuthor, type ReviewItemView } from '@docx-editor.dev/pro/react';
import { useChromeTranslate, useDocxEditor, type ChromeTranslate } from '@docx-editor.dev/react';
import { CheckAllIcon, CheckIcon, CloseIcon } from './icons.js';
import { STRINGS, authorColor, relativeTime, repliesOf, topLevel, verb } from './review-model.js';
import { revealReviewItem } from './reveal.js';

export function ChangesPanel() {
  const { items } = useReview();
  const count = useMemo(() => topLevel(items).length, [items]);
  return (
    <aside id="mcp-changes-panel" className="mcp-panel" aria-label={STRINGS.panel}>
      <div className="mcp-panel__head">
        <h2 className="mcp-panel__title">{STRINGS.changes}</h2>
        {count > 0 ? <span className="mcp-panel__count">{count}</span> : null}
      </div>
      <div className="mcp-panel__body">
        <ChangesList />
      </div>
    </aside>
  );
}

function ChangesList() {
  const editor = useDocxEditor();
  const { items, activeKey, setActive, accept, reject } = useReview();
  const entries = useMemo(() => topLevel(items), [items]);
  const authors = useMemo(() => [...new Set(entries.map((entry) => entry.author))], [entries]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const visible = entries.filter((entry) => !hidden.has(entry.author));
  const shownRevisions = visible.filter((entry) => entry.kind === 'revision');
  const t = useChromeTranslate();

  // "All" means all the changes shown: with an author filter on, the hidden authors'
  // changes stay. Exact keys resolve in one transaction.
  const resolveShown = (action: 'accept' | 'reject') =>
    editor?.exec({
      type: 'resolveAllReviewChanges',
      action,
      keys: shownRevisions.map((item) => item.key),
    });

  const toggle = (author: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(author)) next.delete(author);
      else next.add(author);
      return next;
    });

  return (
    <div className="mcp-changes">
      <div className="mcp-changes__bar">
        <div className="mcp-chips" role="group" aria-label={t('reviewers.label')}>
          {authors.map((author) => (
            <AuthorChip
              key={author}
              author={author}
              on={!hidden.has(author)}
              onToggle={() => toggle(author)}
            />
          ))}
        </div>
        {/* Bulk decisions only while an author filter narrows the list: then they act on
            exactly the changes shown. Unfiltered, each row decides for itself. */}
        {hidden.size > 0 && shownRevisions.length > 0 ? (
          <div className="mcp-changes__all">
            <button
              type="button"
              className="mcp-btn mcp-btn--quiet mcp-btn--sm"
              onClick={() => resolveShown('accept')}
            >
              <CheckAllIcon /> {t('review.acceptAllChanges')}
            </button>
            <button
              type="button"
              className="mcp-btn mcp-btn--quiet mcp-btn--sm"
              onClick={() => resolveShown('reject')}
            >
              <CloseIcon /> {t('review.rejectAllChanges')}
            </button>
          </div>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <div className="mcp-empty">
          <p className="mcp-empty__title">{t('review.empty')}</p>
          <p className="mcp-empty__sub">{STRINGS.emptyHint}</p>
        </div>
      ) : (
        <ul className="mcp-changelist">
          {visible.map((item) => (
            <ChangeRow
              key={item.key}
              item={item}
              replies={repliesOf(item, items)}
              active={item.key === activeKey}
              onSelect={() => {
                setActive(item.key, { reveal: 'center' });
                revealReviewItem(item.key);
              }}
              onAccept={() => accept(item)}
              onReject={() => reject(item)}
              t={t}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AuthorChip({
  author,
  on,
  onToggle,
}: {
  author: string;
  on: boolean;
  onToggle: () => void;
}) {
  const info = useReviewAuthor(author);
  return (
    <button type="button" className="mcp-chip" aria-pressed={on} onClick={onToggle}>
      <span className="mcp-chip__dot" style={{ background: authorColor(author, info) }} />
      {author}
    </button>
  );
}

function ChangeRow({
  item,
  replies,
  active,
  onSelect,
  onAccept,
  onReject,
  t,
}: {
  item: ReviewItemView;
  replies: readonly ReviewItemView[];
  active: boolean;
  onSelect: () => void;
  onAccept: () => void;
  onReject: () => void;
  t: ChromeTranslate;
}) {
  const info = useReviewAuthor(item.author);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const isRevision = item.kind === 'revision';
  const replaced =
    item.kind === 'revision' && item.revisionKind === 'replace' ? item.replacedText : '';
  const deleted = item.kind === 'revision' && item.revisionKind === 'delete';

  return (
    <li
      ref={ref}
      className="mcp-change"
      data-review-key={item.key}
      data-active={active || undefined}
    >
      <button
        type="button"
        className="mcp-change__hit"
        onClick={onSelect}
        aria-label={`${verb(item, t)} · ${item.author}`}
      />
      <div className="mcp-change__head">
        <span
          className="mcp-avatar mcp-avatar--sm"
          style={{ background: authorColor(item.author, info) }}
        >
          {item.initials}
        </span>
        <span className="mcp-change__author">{item.author}</span>
        <span className="mcp-change__time">{relativeTime(item.date)}</span>
        {isRevision ? (
          <span className="mcp-change__actions">
            <button
              type="button"
              className="mcp-icon-btn mcp-icon-btn--xs"
              onClick={onAccept}
              disabled={item.readOnly}
              aria-label={t('review.accept')}
              title={t('review.accept')}
            >
              <CheckIcon />
            </button>
            <button
              type="button"
              className="mcp-icon-btn mcp-icon-btn--xs"
              onClick={onReject}
              disabled={item.readOnly}
              aria-label={t('review.reject')}
              title={t('review.reject')}
            >
              <CloseIcon />
            </button>
          </span>
        ) : null}
      </div>
      <div className="mcp-change__body">
        <span className="mcp-change__verb">{verb(item, t)}</span>{' '}
        {item.kind === 'comment' ? (
          <bdi>{item.text}</bdi>
        ) : (
          <bdi className="mcp-redline">
            {replaced ? <del>{replaced}</del> : null}
            {deleted ? <del>{item.text}</del> : <ins>{item.text}</ins>}
          </bdi>
        )}
      </div>
      {replies.map((entry) => (
        <div key={entry.key} className="mcp-change__reply">
          <bdi className="mcp-change__reply-author">{entry.author}</bdi> <bdi>{entry.text}</bdi>
        </div>
      ))}
    </li>
  );
}
