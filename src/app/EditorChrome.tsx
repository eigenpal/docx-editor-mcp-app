import { DocxEditor, useChromeTranslate } from '@docx-editor.dev/react';
import { defaultChromeGroups } from '@docx-editor.dev/core/editor';
import { useReview } from '@docx-editor.dev/pro/react';
import { ColorPicker } from './ColorPicker.js';
import { CommentButton } from './CommentButton.js';
import { PanelIcon } from './icons.js';
import { ReviewDisplay } from './ReviewDisplay.js';
import { STRINGS } from './review-model.js';
import { useRevealOnMenuNavigation } from './reveal.js';
import { SuggestionAuthor } from './SuggestionAuthor.js';

const OVERFLOW_GROUPS = [...defaultChromeGroups().map((group) => group.id), 'image'];

interface ChromeProps {
  title: string;
  author: string;
  onAuthorChange: (author: string) => void;
  onSave?: () => void;
  panelOpen: boolean;
  onPanelToggle: () => void;
}

export function EditorChrome({
  title,
  author,
  onAuthorChange,
  onSave,
  panelOpen,
  onPanelToggle,
}: ChromeProps) {
  const t = useChromeTranslate();
  const { activeKey } = useReview();
  // Review > Next Change and Previous Change open the item they reach.
  useRevealOnMenuNavigation(activeKey);
  return (
    <div className="mcp-chrome">
      <header className="mcp-header">
        <div className="mcp-document-name" title={`${title}.docx`}>
          <DocumentIcon />
          <span className="mcp-file-label">
            <span className="mcp-title">{title}</span>
            <span className="mcp-extension">.docx</span>
          </span>
        </div>
        <DocxEditor.Menu t={t} fileName={title} onSave={onSave} reportIssue={false}>
          {/* The host owns file selection and the file sync session. */}
          <DocxEditor.Menu.File preset={false}>
            <DocxEditor.Menu.PageSetup />
          </DocxEditor.Menu.File>
        </DocxEditor.Menu>
        <div className="mcp-header-actions">
          <DocxEditor.Toolbar preset={false} t={t} className="mcp-editing-mode">
            <DocxEditor.Toolbar.EditingMode />
          </DocxEditor.Toolbar>
          <SuggestionAuthor author={author} onChange={onAuthorChange} />
          {/* One toggle, always in this place: it opens the panel and collapses it. */}
          <button
            type="button"
            className="mcp-icon-btn mcp-panel-toggle"
            onClick={onPanelToggle}
            aria-expanded={panelOpen}
            aria-controls="mcp-changes-panel"
            aria-label={panelOpen ? STRINGS.closePanel : STRINGS.openPanel}
            title={STRINGS.changes}
          >
            <PanelIcon open={panelOpen} />
          </button>
        </div>
      </header>
      <DocxEditor.Toolbar t={t} className="mcp-formatting" onSave={onSave}>
        {/* Equal priorities make position control which group leaves first. Zoom lives in
            the canvas corner. The comments toggle gives way to the Changes panel button. */}
        {OVERFLOW_GROUPS.map((id) => (
          <DocxEditor.Toolbar.Group
            key={id}
            id={id}
            priority={0}
            hidden={id === 'zoom' || id === 'review'}
          />
        ))}
        <DocxEditor.Toolbar.EditingMode hidden />
        <DocxEditor.Toolbar.Slot slotId="text.color">
          <ColorPicker kind="font" />
        </DocxEditor.Toolbar.Slot>
        <DocxEditor.Toolbar.Slot slotId="text.highlight">
          <ColorPicker kind="highlight" />
        </DocxEditor.Toolbar.Slot>
        <DocxEditor.Toolbar.Group id="insert-table" label="Table" priority={0}>
          <DocxEditor.Toolbar.TableInsert />
        </DocxEditor.Toolbar.Group>
        <DocxEditor.Toolbar.Group
          id="review-display"
          label="Display for review"
          priority={0}
          pinned
        >
          <CommentButton />
          <ReviewDisplay />
        </DocxEditor.Toolbar.Group>
      </DocxEditor.Toolbar>
    </div>
  );
}

function DocumentIcon() {
  return (
    <svg width="20" height="24" viewBox="15 0 70 100" fill="none" aria-hidden="true">
      <g transform="translate(15 0)">
        <path
          d="M2 2H48L68 22V78H2V2Z"
          fill="#FAF9F8"
          stroke="#201F1E"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path d="M48 2V22H68L48 2Z" fill="#DEECF9" />
        <path d="M48 2V22H68" stroke="#201F1E" strokeWidth="4" strokeLinejoin="round" />
        <path
          d="M13 34h28M13 44h38M13 54h33M13 64h36"
          stroke="#201F1E"
          strokeOpacity="0.2"
          strokeWidth="4"
        />
        <path d="M13 82h44v16H13z" fill="#185ABD" stroke="#201F1E" strokeWidth="3" />
        <text x="35" y="94" textAnchor="middle" fill="#FAF9F8" fontSize="11" fontWeight="900">
          .DOCX
        </text>
      </g>
    </svg>
  );
}
