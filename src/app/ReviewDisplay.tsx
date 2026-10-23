import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useEditorCommand } from '@docx-editor.dev/react';
import './review-display.css';

export function ReviewDisplay() {
  const all = useEditorCommand('review.allMarkup');
  const simple = useEditorCommand('review.simpleMarkup');
  const proposed = useEditorCommand('review.noMarkup');
  const original = useEditorCommand('review.original');
  const options = [
    { label: 'All Markup', command: all },
    { label: 'Simple Markup', command: simple },
    { label: 'No Markup', command: proposed },
    { label: 'Original', command: original },
  ];
  const selected = Math.max(
    0,
    options.findIndex((option) => option.command.isActive)
  );
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  useEffect(() => {
    if (open) items.current[selected]?.focus();
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!(event.target instanceof Node)) return;
      if (!root.current?.closest('.docx-editor')?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  const move = (event: KeyboardEvent) => {
    setKeyboard(true);
    const enabled = items.current.filter((item) => item && !item.disabled);
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    let next = current;
    if (delta) next = (current + delta + enabled.length) % enabled.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    else return;
    event.preventDefault();
    enabled[next]?.focus();
  };

  return (
    <div
      ref={root}
      className="mcp-review-display"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="mcp-review-trigger"
        aria-label="Display for review"
        title={`Display for review: ${options[selected].label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={!options.some((option) => option.command.isEnabled)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          setKeyboard(event.detail === 0);
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          setKeyboard(true);
          setOpen(true);
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Display for review"
          className="mcp-review-menu"
          data-keyboard={keyboard}
          onKeyDown={move}
        >
          {options.map((option, index) => (
            <button
              key={option.label}
              ref={(element) => {
                items.current[index] = element;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={index === selected}
              tabIndex={index === selected ? 0 : -1}
              disabled={!option.command.isEnabled}
              title={option.command.disabledReason ?? undefined}
              onClick={() => {
                setOpen(false);
                option.command.execute();
                trigger.current?.focus();
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {index === selected && <path d="m5 12 4 4L19 6" />}
              </svg>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
