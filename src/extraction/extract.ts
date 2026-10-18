import { Readability } from '@mozilla/readability';
import type { Snapshot } from '../shared/types';
import { getPageIdentity } from '../tracking/url';

export const MAX_CONTENT_LENGTH = 60_000;
export const MAX_TITLE_LENGTH = 500;
export const SNAPSHOT_REFRESH_MS = 60 * 60 * 1000;
const REMOVE_SELECTOR = [
  'script', 'style', 'noscript', 'template', 'input', 'textarea', 'select', 'button',
  '[contenteditable]:not([contenteditable="false"])', '[role="textbox"]',
  '.monaco-editor', '.ace_editor', '.CodeMirror', '.cm-editor',
  '[hidden]', '[aria-hidden="true"]', 'iframe', 'canvas', 'svg',
].join(',');

export function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function textFromElement(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
  clone.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,section,div,pre,tr').forEach((node) => node.append('\n'));
  return normalizeText(clone.textContent ?? '');
}

export function cleanDocument(document: Document): Document {
  const clone = document.cloneNode(true) as Document;
  clone.querySelectorAll(REMOVE_SELECTOR).forEach((element) => element.remove());
  clone.querySelectorAll('[style]').forEach((element) => {
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(element.getAttribute('style') ?? '')) element.remove();
  });
  return clone;
}

export function countWords(text: string): number {
  // Count CJK characters separately and whitespace-delimited words elsewhere.
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
  return (text.match(cjk) ?? []).length + (text.replace(cjk, ' ').match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

export async function hashContent(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function extractSnapshot(document: Document, url: string, now = Date.now()): Promise<Snapshot | null> {
  const page = getPageIdentity(url);
  if (!page || !document.body) return null;
  const clean = cleanDocument(document);
  let method: Snapshot['method'] = 'fallback';
  let root: Element = clean.body;
  let text = '';
  let title = normalizeText(clean.title).slice(0, MAX_TITLE_LENGTH) || page.hostname;
  const documentRoot = clean.querySelector('[role="document"], [data-ticksum-document]');

  if (documentRoot && textFromElement(documentRoot).length >= 80) {
    root = documentRoot;
    text = textFromElement(root);
    method = 'adapter';
  } else {
    try {
      const article = new Readability(clean.cloneNode(true) as Document, { charThreshold: 80 }).parse();
      if (article?.textContent && normalizeText(article.textContent).length >= 80) {
        const wrapper = clean.createElement('article');
        wrapper.innerHTML = article.content ?? '';
        root = wrapper;
        text = textFromElement(wrapper);
        title = normalizeText(article.title || title).slice(0, MAX_TITLE_LENGTH);
        method = 'readability';
      }
    } catch {
      // Complex application DOMs are allowed to fall back to a bounded visible region.
    }
    if (!text) {
      root = clean.querySelector('main, article, [role="main"]') ?? clean.body;
      root.querySelectorAll('nav,header,footer,aside,[role="navigation"]').forEach((node) => node.remove());
      text = textFromElement(root);
      method = root === clean.body ? 'fallback' : 'adapter';
    }
  }
  const truncated = text.length > MAX_CONTENT_LENGTH;
  text = text.slice(0, MAX_CONTENT_LENGTH);
  if (text.length < 40) return null;
  const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4'))
    .map((heading) => normalizeText(heading.textContent ?? '').slice(0, 200)).filter(Boolean).slice(0, 40);
  const contentHash = await hashContent(text);
  return {
    id: crypto.randomUUID(), ...page, title, capturedAt: now, contentHash, text,
    excerpt: text.slice(0, 280), headings, method,
    coverage: method === 'readability' && !truncated ? 'unknown' : 'partial', wordCount: countWords(text),
  };
}

export function captureFingerprint(snapshot: Pick<Snapshot, 'pageKey' | 'contentHash'>): string {
  return `${snapshot.pageKey}\n${snapshot.contentHash}`;
}

export function pageChanged(previousUrl: string, currentUrl: string): boolean {
  return getPageIdentity(previousUrl)?.pageKey !== getPageIdentity(currentUrl)?.pageKey;
}
