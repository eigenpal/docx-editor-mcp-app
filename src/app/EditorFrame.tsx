import { useEffect, useRef, useState } from 'react';
import {
  DocxEditor,
  DocxEditorContentControlWidget,
  DocxEditorInvalidTextFormFieldDialog,
  DocxEditorImagePropertiesDialog,
  DocxEditorImageAltTextPopup,
  DocxEditorNotePropertiesDialog,
  DocxEditorNotePreview,
  DocxEditorNotesContextMenu,
  DocxEditorPageSetupDialog,
  useChromeTranslate,
  type DocxEditorPopups,
  type DocxEditorProps,
} from '@docx-editor.dev/react';
import { useReview } from '@docx-editor.dev/pro/react';
import { ChangesPanel } from './ChangesPanel.js';
import { CommentRail } from './CommentRail.js';
import { EditorChrome } from './EditorChrome.js';
import { usePopupPlacement } from './PopupPlacement.js';
import { ReviewBalloons } from './ReviewBalloons.js';
import { STRINGS, declareAuthorColor, topLevel } from './review-model.js';
import './editor-frame.css';
import './editor-controls.css';
import './navigation.css';
import './review.css';
import './review-rail.css';

// Keep the packaged popups when you replace the packaged frame.
const POPUPS: DocxEditorPopups = {
  contentControlWidget: (props) => <DocxEditorContentControlWidget {...props} />,
  invalidTextFormField: (props) => <DocxEditorInvalidTextFormFieldDialog {...props} />,
  imageProperties: (props) => <DocxEditorImagePropertiesDialog {...props} />,
  imageAltText: (props) => <DocxEditorImageAltTextPopup {...props} />,
  noteProperties: (props) => <DocxEditorNotePropertiesDialog {...props} />,
  notePreview: (props) => <DocxEditorNotePreview {...props} />,
  notesContextMenu: (props) => <DocxEditorNotesContextMenu {...props} />,
  pageSetup: (props) => <DocxEditorPageSetupDialog {...props} />,
};

type FrameProps = Pick<
  DocxEditorProps,
  'document' | 'modules' | 'title' | 'mode' | 'chrome' | 'colorMode' | 'onSave' | 'children'
>;

const AUTHOR_KEY = 'docx-editor:suggestion-author';
const DEFAULT_AUTHOR = 'Document editor';
/** The reader's color: their edits, replies, and avatar all draw in it, as in the demo. */
const AUTHOR_COLOR = '#2f5d8a';
/** The panel opens beside a full-width page from this width; below it, it is a sheet. */
const PANEL_BESIDE_PAGE = 1280;

function storedAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY)?.trim() || DEFAULT_AUTHOR;
  } catch {
    return DEFAULT_AUTHOR;
  }
}

export function EditorFrame({
  document,
  modules,
  title = 'document',
  mode = 'edit',
  chrome,
  colorMode = 'system',
  onSave,
  children,
}: FrameProps) {
  const t = useChromeTranslate();
  const editorRef = useRef<HTMLDivElement>(null);
  const [author, setAuthor] = useState(storedAuthor);
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(AUTHOR_KEY, author);
    } catch {
      // The name still applies to this editor when storage is unavailable.
    }
  }, [author]);
  // Surfaces outside the review rail read the declared color here.
  useEffect(() => {
    declareAuthorColor(author, AUTHOR_COLOR);
    return () => declareAuthorColor(author, null);
  }, [author]);
  usePopupPlacement(editorRef);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches
  );
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const dark = colorMode === 'dark' || (colorMode === 'system' && systemDark);
  const showPanel = !!chrome && panelOpen;

  return (
    <DocxEditor.Root
      document={document}
      modules={modules}
      mode={mode}
      author={author}
      popups={POPUPS}
    >
      <DocxEditor.AuthorStyle author={author} color={AUTHOR_COLOR} />
      <InitialPanel chrome={!!chrome} onOpen={() => setPanelOpen(true)} />
      {/* Keep Content mounted so display changes preserve edits and undo history. */}
      <div
        ref={editorRef}
        className={`docx-editor mcp-editor${dark ? ' dark' : ''}`}
        data-chrome={!!chrome}
        data-panel={showPanel ? 'open' : 'closed'}
      >
        <EditorChrome
          title={title}
          author={author}
          onAuthorChange={setAuthor}
          onSave={onSave}
          panelOpen={showPanel}
          onPanelToggle={() => setPanelOpen((open) => !open)}
        />
        <div className="mcp-font-notice">
          <DocxEditor.FontNotice t={t} />
        </div>
        <div className="mcp-workspace">
          <section className="mcp-docpane">
            <DocxEditor.Navigation
              className="mcp-navigation"
              toggle={{ className: 'mcp-navigation-toggle' }}
            />
            <DocxEditor.Viewport className="mcp-viewport">
              <DocxEditor.HeaderFooterChrome />
              <DocxEditor.NotesChrome />
              <DocxEditor.Content />
              <DocxEditor.HyperLink />
              <DocxEditor.Equation />
              <DocxEditor.ContentControl />
              <DocxEditor.ContextMenu t={t} />
              <CommentRail author={author} panelOpen={showPanel} />
              {children}
            </DocxEditor.Viewport>
            <DocxEditor.PageNumber className="mcp-page-number" />
            <EditorZoom />
            <ReviewBalloons author={author} />
            <DocxEditor.Loading overlay />
          </section>
          {showPanel ? (
            <>
              <button
                type="button"
                className="mcp-scrim"
                aria-label={STRINGS.closePanel}
                onClick={() => setPanelOpen(false)}
              />
              <ChangesPanel />
            </>
          ) : null}
        </div>
      </div>
    </DocxEditor.Root>
  );
}

/**
 * Opens the Changes panel once, the first time the editor shows its chrome, when the page
 * has room beside it and the document has changes or comments to list.
 */
function InitialPanel({ chrome, onOpen }: { chrome: boolean; onOpen: () => void }) {
  const { ready, items } = useReview();
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !ready || !chrome) return;
    decided.current = true;
    if (window.innerWidth >= PANEL_BESIDE_PAGE && topLevel(items).length > 0) onOpen();
  }, [ready, chrome, items, onOpen]);
  return null;
}

function EditorZoom() {
  const t = useChromeTranslate();
  return (
    <DocxEditor.Toolbar preset={false} t={t} className="mcp-zoom">
      <DocxEditor.Toolbar.Zoom />
    </DocxEditor.Toolbar>
  );
}
