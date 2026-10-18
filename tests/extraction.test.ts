// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { captureFingerprint, cleanDocument, countWords, extractSnapshot, MAX_CONTENT_LENGTH, pageChanged } from '../src/extraction/extract';

const pageUrl = 'https://example.com/docs';
const makeDocument = (body: string) => new DOMParser().parseFromString(`<html><head><title>Test document</title></head><body>${body}</body></html>`, 'text/html');
const prose = 'This reference describes how automatic browser activity records become useful reports with transparent sources. ';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

describe('bounded page content extraction', () => {
  it('removes input, editing regions, scripts, and hidden text without changing the live DOM', async () => {
    const document = makeDocument(`<main><h1>Reference</h1><p>${prose.repeat(8)}</p>
      <input value="secret input"><textarea>secret textarea</textarea><div contenteditable>secret editor</div>
      <div role="textbox">secret textbox</div><script>secret script</script><div hidden>secret hidden</div>
      <div style="display:none">secret style</div></main>`);
    const snapshot = await extractSnapshot(document, pageUrl, 1000);
    expect(snapshot?.text).toContain('automatic browser');
    expect(snapshot?.text).not.toContain('secret');
    expect(document.querySelector('textarea')?.textContent).toBe('secret textarea');
    expect(snapshot?.capturedAt).toBe(1000);
    expect(snapshot?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(['partial', 'unknown']).toContain(snapshot?.coverage);
  });

  it('uses a document-region adapter and keeps headings', async () => {
    const document = makeDocument(`<nav>Navigation content</nav><div role="document"><h2>Details</h2><p>${prose.repeat(3)}</p></div>`);
    const snapshot = await extractSnapshot(document, pageUrl);
    expect(snapshot?.method).toBe('adapter');
    expect(snapshot?.headings).toContain('Details');
    expect(snapshot?.text).not.toContain('Navigation');
    expect(snapshot?.coverage).toBe('partial');
  });

  it('keeps text marked contenteditable=false while stripping actual editing regions', () => {
    const clean = cleanDocument(makeDocument('<div contenteditable="false">read only</div><div contenteditable="true">editable</div>'));
    expect(clean.body.textContent).toBe('read only');
  });

  it('excludes editor-rendered draft text beyond hidden native input controls', async () => {
    const document = makeDocument(`<main><p>${prose.repeat(5)}</p>
      <div class="monaco-editor"><textarea></textarea><div class="view-lines">secret Monaco draft</div></div>
      <div class="ace_editor"><div class="ace_text-layer">secret Ace draft</div></div>
      <div class="CodeMirror"><div class="CodeMirror-code">secret CodeMirror draft</div></div>
      <div class="cm-editor"><div class="cm-content">secret modern CodeMirror draft</div></div></main>`);
    const snapshot = await extractSnapshot(document, pageUrl);
    expect(snapshot?.text).toContain('automatic browser');
    expect(snapshot?.text).not.toContain('secret');
    expect(document.querySelector('.view-lines')?.textContent).toBe('secret Monaco draft');
  });

  it('caps text length and refuses tiny or unsupported pages', async () => {
    const document = makeDocument(`<div role="document">${prose.repeat(900)}</div>`);
    expect((await extractSnapshot(document, pageUrl))?.text.length).toBe(MAX_CONTENT_LENGTH);
    expect(await extractSnapshot(makeDocument('<p>tiny</p>'), 'https://example.com')).toBeNull();
    expect(await extractSnapshot(document, 'chrome://extensions')).toBeNull();
  });

  it('deduplicates stable text but treats a changed SPA route as another source', async () => {
    const document = makeDocument(`<article><p>${prose.repeat(5)}</p></article>`);
    const first = (await extractSnapshot(document, 'https://example.com/app#one'))!;
    const repeat = (await extractSnapshot(document, 'https://example.com/app#one'))!;
    const nextRoute = (await extractSnapshot(document, 'https://example.com/app#two'))!;
    expect(captureFingerprint(first)).toBe(captureFingerprint(repeat));
    expect(captureFingerprint(first)).not.toBe(captureFingerprint(nextRoute));
    expect(pageChanged(first.url, nextRoute.url)).toBe(true);
    expect(pageChanged(first.url, first.url)).toBe(false);
  });

  it('counts Chinese text and Latin words', () => {
    expect(countWords('学习 React today')).toBe(4);
  });
});
