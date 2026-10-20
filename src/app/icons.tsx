/**
 * Line icons for the review surfaces, drawn on a 24px grid with a 2px round stroke. The
 * CSS sizes them; `currentColor` colors them.
 */
import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function CheckIcon() {
  return (
    <Icon>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

export function CloseIcon() {
  return (
    <Icon>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

export function CheckAllIcon() {
  return (
    <Icon>
      <path d="M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16" />
    </Icon>
  );
}

export function SendIcon() {
  return (
    <Icon>
      <path d="m5 12 7-7 7 7M12 19V5" />
    </Icon>
  );
}

export function ChangesIcon() {
  return (
    <Icon>
      <path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8" />
    </Icon>
  );
}

export function CommentAddIcon() {
  return (
    <Icon>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M12 7v6M9 10h6" />
    </Icon>
  );
}

export function PanelIcon({ open }: { open: boolean }) {
  return (
    <Icon>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
      <path d={open ? 'm8 9 3 3-3 3' : 'm10 15-3-3 3-3'} />
    </Icon>
  );
}
