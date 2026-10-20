import { useEffect, useRef, useState } from 'react';
import './suggestion-author.css';

interface AuthorProps {
  author: string;
  onChange: (author: string) => void;
}

export function SuggestionAuthor({ author, onChange }: AuthorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(author);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close, true);
    return () => document.removeEventListener('mousedown', close, true);
  }, [open]);

  const apply = () => {
    const next = draft.trim();
    if (!next) return;
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="mcp-author" ref={rootRef}>
      <button
        type="button"
        className="mcp-author-trigger"
        aria-label="Suggestion author settings"
        aria-expanded={open}
        title={`Suggestion author: ${author}`}
        onClick={() => {
          setDraft(author);
          setOpen((current) => !current);
        }}
      >
        <AuthorIcon />
      </button>
      {open && (
        <div
          className="mcp-author-panel"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter') apply();
          }}
        >
          <label htmlFor="mcp-suggestion-author">Suggestion author</label>
          <input
            id="mcp-suggestion-author"
            value={draft}
            maxLength={80}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
          />
          <p>This name appears on suggestions you make in this editor.</p>
          <button type="button" disabled={!draft.trim()} onClick={apply}>
            Save name
          </button>
        </div>
      )}
    </div>
  );
}

function AuthorIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
