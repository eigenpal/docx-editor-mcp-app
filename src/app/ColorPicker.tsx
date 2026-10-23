import type { CSSProperties } from 'react';
import { DocxEditor, useEditorState } from '@docx-editor.dev/react';
import './color-picker.css';

const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  blue: '#0000ff',
  red: '#ff0000',
  darkBlue: '#000080',
  darkCyan: '#008080',
  darkGreen: '#008000',
  darkMagenta: '#800080',
  darkRed: '#800000',
  darkYellow: '#808000',
  darkGray: '#808080',
  lightGray: '#c0c0c0',
  black: '#000000',
  white: '#ffffff',
};

export function ColorPicker({ kind }: { kind: 'font' | 'highlight' }) {
  const swatch = useEditorState((snapshot) => {
    if (kind === 'highlight') {
      return HIGHLIGHT_COLORS[snapshot.formatting?.highlight ?? 'none'] ?? 'transparent';
    }
    const color = snapshot.formatting?.color;
    return color?.kind === 'hex' && /^[0-9a-f]{6}$/i.test(color.value)
      ? `#${color.value}`
      : '#000000';
  });

  return (
    <span
      className={`mcp-color-control mcp-color-control--${kind}`}
      style={{ '--mcp-color-swatch': swatch } as CSSProperties}
    >
      {kind === 'font' ? <DocxEditor.Toolbar.FontColor /> : <DocxEditor.Toolbar.Highlight />}
    </span>
  );
}
