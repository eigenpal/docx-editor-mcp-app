import { useEffect, type RefObject } from 'react';
import { placeSubmenus } from './submenu-placement.js';
import './popup-placement.css';

const EDGE = 8;

function placeLink(root: HTMLElement) {
  const popup = root.querySelector<HTMLElement>('.docx-hyperlink-popup');
  const viewport = root.querySelector<HTMLElement>('.mcp-viewport');
  if (!popup || !viewport) return;

  // The engine owns the document anchor. Translation only keeps its panel visible.
  popup.style.translate = 'none';
  const bounds = viewport.getBoundingClientRect();
  const rect = popup.getBoundingClientRect();
  const width = Math.min(popup.offsetWidth, bounds.width - EDGE * 2);
  const left = Math.max(bounds.left + EDGE, Math.min(rect.left, bounds.right - width - EDGE));
  const top = Math.max(bounds.top + EDGE, Math.min(rect.top, bounds.bottom - rect.height - EDGE));
  popup.style.translate = `${Math.round(left - rect.left)}px ${Math.round(top - rect.top)}px`;
}

function placeSpacing(root: HTMLElement) {
  const menu = root.querySelector<HTMLElement>(
    '.docx-toolbar__more-panel .docx-toolbar__line-spacing-menu'
  );
  if (!menu) return;
  const trigger = menu.parentElement?.querySelector<HTMLElement>(
    '.docx-toolbar__line-spacing-trigger'
  );
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const height = menu.offsetHeight;
  const below = window.innerHeight - rect.bottom - EDGE;
  const above = rect.top - EDGE;
  const openUp = above > below && above >= Math.min(height, 160);
  const available = Math.max(80, openUp ? above : below);
  const top = openUp ? Math.max(EDGE, rect.top - Math.min(height, available)) : rect.bottom;
  const left = Math.max(
    EDGE,
    Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - EDGE)
  );
  menu.style.setProperty('--mcp-menu-top', `${Math.round(top)}px`);
  menu.style.setProperty('--mcp-menu-left', `${Math.round(left)}px`);
  menu.style.setProperty('--mcp-menu-height', `${Math.floor(available)}px`);
}

export function usePopupPlacement(rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        placeLink(root);
        placeSpacing(root);
        placeSubmenus(root);
      });
    };
    const observer = new MutationObserver(place);
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener('click', place, true);
    root.addEventListener('keydown', place, true);
    root.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      root.removeEventListener('click', place, true);
      root.removeEventListener('keydown', place, true);
      root.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      cancelAnimationFrame(frame);
    };
  }, [rootRef]);
}
