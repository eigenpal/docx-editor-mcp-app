/**
 * The change locations the file viewer hands the refresh controller. A wrong
 * index or text here is not a crash: the controller marks the change
 * `text-mismatch` and the reader sees no highlight, so the expectations below
 * pin both.
 */

import { describe, expect, it } from 'bun:test';
import { bodyParagraphTexts, diffParagraphs } from '../paragraph-diff.js';
import { docx, p } from './fixtures.js';

describe('bodyParagraphTexts', () => {
  it('reads body paragraphs in order, table cells included', () => {
    const bytes = docx(
      p('Intro') +
        `<w:tbl><w:tr><w:tc>${p('Cell A')}</w:tc><w:tc>${p('Cell B')}</w:tc></w:tr></w:tbl>` +
        p('Outro')
    );
    expect(bodyParagraphTexts(bytes)).toEqual(['Intro', 'Cell A', 'Cell B', 'Outro']);
  });

  it('answers null for bytes that are not a package', () => {
    expect(bodyParagraphTexts(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('diffParagraphs', () => {
  it('reports nothing for identical documents', () => {
    expect(diffParagraphs(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('locates an edited paragraph by index with its full new text', () => {
    const changes = diffParagraphs(['Title', 'Due May 1', 'End'], ['Title', 'Due June 3', 'End']);
    expect(changes).toEqual([
      {
        id: 'paragraph-1',
        description: 'Changed paragraph 2: Due June 3',
        location: { paragraphIndex: 1, start: 0, end: 10, text: 'Due June 3' },
      },
    ]);
  });

  it('separates additions from edits and keeps later indexes aligned', () => {
    const changes = diffParagraphs(['A', 'B', 'C'], ['A', 'New', 'B', 'C', 'Tail']);
    expect(changes.map((c) => [c.id, c.description])).toEqual([
      ['paragraph-1', 'Added paragraph 2: New'],
      ['paragraph-4', 'Added paragraph 5: Tail'],
    ]);
  });

  it('summarizes removals without a location', () => {
    const changes = diffParagraphs(['A', 'B', 'C', 'D'], ['A', 'D']);
    expect(changes).toEqual([
      { id: 'removed-0-2', description: 'Removed 2 paragraphs', unavailableReason: 'deleted' },
    ]);
  });

  it('lists an added empty paragraph without a highlight range', () => {
    const [change] = diffParagraphs(['A'], ['A', '']);
    expect(change).toEqual({
      id: 'paragraph-1',
      description: 'Added paragraph 2 (empty)',
      unavailableReason: 'unavailable',
    });
  });

  it('caps the list and says how many it left out', () => {
    const after = Array.from({ length: 250 }, (_, i) => `line ${i}`);
    const changes = diffParagraphs([], after);
    expect(changes).toHaveLength(201);
    expect(changes.at(-1)).toEqual({
      id: 'omitted',
      description: '50 more changes are not listed',
    });
  });

  it('matches the texts a real package yields', () => {
    const before = bodyParagraphTexts(docx(p('Fee: 100') + p('Term: 1 year')))!;
    const after = bodyParagraphTexts(docx(p('Fee: 120') + p('Term: 1 year')))!;
    expect(diffParagraphs(before, after)[0]?.location).toEqual({
      paragraphIndex: 0,
      start: 0,
      end: 8,
      text: 'Fee: 120',
    });
  });
});
