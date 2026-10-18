import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const origin = 'http://127.0.0.1:4180';
const article = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>TickSum 测试文章</title></head><body><main><h1>浏览器统计实验</h1><p>${'这是一段用于验证本地正文采集的文章内容，数据来源可追溯。'.repeat(35)}</p><textarea>不要采集输入草稿</textarea><div class="monaco-editor"><div class="view-lines">不要采集编辑器草稿</div></div><a href="/second">第二篇</a></main></body></html>`;

async function launch(withContentPermission: boolean): Promise<{ context: BrowserContext; worker: Worker; id: string; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'ticksum-extension-'));
  const extensionPath = join(root, 'extension');
  await cp(resolve('.output/chrome-mv3'), extensionPath, { recursive: true });
  if (withContentPermission) {
    // Only this disposable copy receives localhost access. The shipped manifest
    // keeps all site permissions optional; no real browser profile is modified.
    const path = join(extensionPath, 'manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.host_permissions = ['http://127.0.0.1/*'];
    await writeFile(path, JSON.stringify(manifest));
  }
  const context = await chromium.launchPersistentContext(join(root, 'profile'), {
    headless: true, channel: 'chromium', viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  await context.route(`${origin}/**`, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: article }));
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  // The serviceworker event can precede Chrome API installation and bootstrap.
  await expect.poll(() => worker.evaluate(() => typeof chrome !== 'undefined' && typeof chrome.permissions?.getAll === 'function')).toBe(true);
  await expect.poll(() => worker.evaluate(async () => Boolean((await chrome.storage.session.get('trackingState')).trackingState))).toBe(true);
  const id = new URL(worker.url()).host;
  return { context, worker, id, root };
}

test('real extension requires first-use acknowledgement, then automatically records without unapproved content', async () => {
  const { context, worker, id, root } = await launch(false);
  try {
    expect((await worker.evaluate(() => chrome.permissions.getAll())).origins ?? []).toEqual([]);
    const browsing = await context.newPage();
    await browsing.goto(`${origin}/article`);
    await browsing.waitForTimeout(1500); // A measured interval, not a page-readiness wait.
    const dashboard = await context.newPage();
    await dashboard.goto(`chrome-extension://${id}/dashboard.html`);
    await expect(dashboard.getByRole('heading', { name: /让时间留下记录/ })).toBeVisible();
    await expect(dashboard.getByRole('link', { name: '隐私政策' })).toHaveAttribute('href', 'https://github.com/Altria1979/ticksum/blob/main/docs/privacy-policy.md');
    expect(await worker.evaluate(async () => {
      const request = indexedDB.open('ticksum');
      return await new Promise<number>(resolve => { request.onsuccess = () => { const db = request.result; const count = db.transaction('activities').objectStore('activities').count(); count.onsuccess = () => { db.close(); resolve(count.result); }; }; });
    })).toBe(0);
    await expect(dashboard.getByRole('navigation')).toHaveCount(0);
    await mkdir(join(tmpdir(), 'ticksum-qa'), { recursive: true });
    await dashboard.screenshot({ path: join(tmpdir(), 'ticksum-qa', 'first-run.png'), fullPage: true });
    await dashboard.setViewportSize({ width: 390, height: 844 });
    await dashboard.screenshot({ path: join(tmpdir(), 'ticksum-qa', 'first-run-mobile.png'), fullPage: true });
    await dashboard.setViewportSize({ width: 1440, height: 1000 });
    await dashboard.getByRole('button', { name: '暂不开启，查看已有数据' }).click();
    await expect(dashboard.getByRole('navigation')).toBeVisible();
    await dashboard.getByRole('navigation').getByRole('button', { name: '设置' }).click();
    await expect(dashboard.getByLabel('自动记录浏览时长')).toBeDisabled();
    await expect(dashboard.getByRole('button', { name: '删除全部本地数据' })).toBeVisible();
    await dashboard.getByRole('button', { name: '查看说明并启用' }).click();
    await dashboard.getByRole('button', { name: '启用自动记录' }).click();
    await expect(dashboard.getByRole('navigation')).toBeVisible();
    await browsing.bringToFront();
    await browsing.waitForTimeout(1500);
    await dashboard.bringToFront();
    await dashboard.reload();
    await expect(dashboard.getByRole('button', { name: '启用自动记录' })).toHaveCount(0);
    await expect(dashboard.getByRole('button', { name: 'TickSum 测试文章', exact: true })).toBeVisible();
    await expect(dashboard.getByRole('button', { name: '仅记录', exact: true })).toBeVisible();
    await expect(dashboard.getByRole('alert')).toHaveCount(0);
    await dashboard.getByRole('button', { name: '生成报告', exact: true }).click();
    await expect(dashboard.getByLabel('报告正文（Markdown）')).toHaveValue(/TickSum 测试文章/);
    await dashboard.getByRole('button', { name: '保存报告', exact: true }).click();
    await expect(dashboard.getByRole('status')).toContainText('已保存');
    await dashboard.reload();
    await dashboard.getByRole('navigation').getByRole('button', { name: '报告', exact: true }).click();
    await expect(dashboard.locator('.saved-report')).toHaveCount(1);
  } finally { await context.close(); await rm(root, { recursive: true, force: true }); }
});

test('authorized extraction, SPA navigation, privacy cleaning and pause work in real Chromium', async () => {
  const { context, worker, id, root } = await launch(true);
  try {
    const welcome = await context.newPage();
    await welcome.goto(`chrome-extension://${id}/dashboard.html`);
    await welcome.getByRole('button', { name: '启用自动记录' }).click();
    await expect.poll(() => worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length)).toBe(1);
    const browsing = await context.newPage();
    await browsing.goto(`${origin}/article`);
    await expect.poll(() => worker.evaluate(async () => {
      const request = indexedDB.open('ticksum');
      return await new Promise<number>((resolve, reject) => { request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result; const count = db.transaction('snapshots').objectStore('snapshots').count(); count.onsuccess = () => { db.close(); resolve(count.result); }; }; });
    }), { timeout: 15_000 }).toBeGreaterThan(0);
    await browsing.evaluate(() => { history.pushState({}, '', '/article/next'); document.title = 'SPA 第二篇'; document.querySelector('h1')!.textContent = '另一个主题'; });
    await expect.poll(() => worker.evaluate(async () => {
      const request = indexedDB.open('ticksum');
      return await new Promise<number>(resolve => { request.onsuccess = () => { const db = request.result; const count = db.transaction('snapshots').objectStore('snapshots').count(); count.onsuccess = () => { db.close(); resolve(count.result); }; }; });
    }), { timeout: 15_000 }).toBeGreaterThan(1);
    const dashboard = await context.newPage();
    await dashboard.goto(`chrome-extension://${id}/dashboard.html`);
    await expect(dashboard.getByRole('button', { name: 'SPA 第二篇', exact: true })).toBeVisible();
    await dashboard.getByRole('button', { name: 'SPA 第二篇', exact: true }).click();
    await expect(dashboard.getByRole('dialog')).toContainText('这是一段用于验证');
    await expect(dashboard.getByRole('dialog')).not.toContainText('不要采集');
    await dashboard.getByRole('button', { name: '关闭页面详情' }).click();
    await dashboard.getByRole('navigation').getByRole('button', { name: '设置' }).click();
    await dashboard.getByLabel('自动记录浏览时长').uncheck();
    await dashboard.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(dashboard.getByRole('status')).toContainText('设置已保存');
    await dashboard.reload();
    await dashboard.getByRole('navigation').getByRole('button', { name: '设置' }).click();
    await expect(dashboard.getByLabel('自动记录浏览时长')).not.toBeChecked();
    await browsing.bringToFront(); await browsing.goto(`${origin}/paused`); await browsing.waitForTimeout(1600);
    await dashboard.bringToFront();
    await dashboard.getByRole('navigation').getByRole('button', { name: '浏览概览', exact: true }).click();
    await dashboard.getByRole('searchbox').fill('/paused');
    await expect(dashboard.locator('tbody tr')).toHaveCount(0);
    await mkdir(join(tmpdir(), 'ticksum-qa'), { recursive: true });
    await dashboard.screenshot({ path: join(tmpdir(), 'ticksum-qa', 'extension.png'), fullPage: true });
  } finally { await context.close(); await rm(root, { recursive: true, force: true }); }
});
