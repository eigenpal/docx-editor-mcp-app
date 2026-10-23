const EDGE = 8;

export function submenuPosition(
  row: Pick<DOMRect, 'left' | 'right' | 'top'>,
  panel: Pick<DOMRect, 'width' | 'height'>,
  viewport: { width: number; height: number }
) {
  const right = viewport.width - row.right - EDGE;
  const left = row.left - EDGE;
  const openLeft = right < panel.width && left > right;
  return {
    left: Math.max(
      EDGE,
      Math.min(openLeft ? row.left - panel.width : row.right, viewport.width - panel.width - EDGE)
    ),
    top: Math.max(EDGE, Math.min(row.top - 4, viewport.height - panel.height - EDGE)),
    side: openLeft ? 'left' : 'right',
  };
}

/** Keep nested menus clear of the parent's scrolling and stacking boundaries. */
export function placeSubmenus(root: HTMLElement) {
  for (const menu of root.querySelectorAll<HTMLElement>('.docx-menubar__submenu-panel')) {
    const parent = menu.parentElement;
    const trigger = parent?.querySelector<HTMLElement>(':scope > [role="menuitem"]');
    const view = menu.ownerDocument.defaultView;
    if (!parent || !trigger || !view) continue;

    // A manual popover keeps the existing DOM, focus handling, and inherited theme.
    menu.setAttribute('popover', 'manual');
    if (!menu.matches(':popover-open')) menu.showPopover();
    menu.style.translate = 'none';

    const row = trigger.getBoundingClientRect();
    const panel = menu.getBoundingClientRect();
    const position = submenuPosition(row, panel, {
      width: view.innerWidth,
      height: view.innerHeight,
    });
    menu.style.translate = `${Math.round(position.left - panel.left)}px ${Math.round(position.top - panel.top)}px`;
    parent.dataset.mcpSide = position.side;
  }
}
