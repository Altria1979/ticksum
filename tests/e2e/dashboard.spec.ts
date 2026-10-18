import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const evidence = join(tmpdir(), 'ticksum-qa');

test('first visit is empty and never invents activity', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '从下一次浏览开始积累' })).toBeVisible();
  await expect(page.getByRole('button', { name: '生成报告', exact: true })).toBeDisabled();
  await expect(page.getByText('示例数据', { exact: false })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('filter, select, generate, edit, save, copy and export report', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?demo=1');
  await expect(page.getByRole('button', { name: 'React 文档', exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('react');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '生成报告', exact: true }).click();
  await expect(page.getByLabel('报告正文（Markdown）')).toBeVisible();
  const text = await page.getByLabel('报告正文（Markdown）').inputValue();
  expect(text).toContain('42 分钟'); expect(text).toContain('https://react.dev/learn'); expect(text).not.toContain('CSS Grid');
  await page.getByLabel('报告正文（Markdown）').fill(`${text}\n\n我的备注：明天继续验证组件组合。`);
  await page.getByLabel('报告标题').fill('我的浏览复盘');
  await page.getByRole('button', { name: '保存报告', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已保存');
  await page.getByRole('button', { name: '复制报告', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已复制');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('明天继续验证');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, 'utf8')).toContain('明天继续验证');
  await page.getByRole('navigation').getByRole('button', { name: '报告', exact: true }).click();
  await expect(page.getByRole('button', { name: /^我的浏览复盘/ })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: '浏览概览' }).click();
  await page.getByRole('button', { name: '生成报告', exact: true }).click();
  await expect(page.getByLabel('报告正文（Markdown）')).toHaveValue(/2 小时 6 分钟/);
  await page.setViewportSize({ width: 1505, height: 1045 });
  if (await page.getByRole('button', { name: '关闭提示' }).isVisible()) await page.getByRole('button', { name: '关闭提示' }).click();
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, 'desktop.png') });
  await page.screenshot({ path: join(evidence, 'desktop-full.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('custom range refreshes annotations and report content immediately', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByLabel('时间范围', { exact: true }).selectOption('custom');
  await page.getByRole('button', { name: 'React 文档', exact: true }).click();
  await page.getByLabel('标签', { exact: true }).fill('专题研究');
  await page.getByLabel('我的备注', { exact: true }).fill('本次验证了筛选范围内的备注更新。');
  await page.getByRole('button', { name: '保存标签与备注' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('tbody')).toContainText('专题研究');
  await page.getByRole('button', { name: '生成报告', exact: true }).click();
  await expect(page.getByLabel('报告正文（Markdown）')).toHaveValue(/本次验证了筛选范围内的备注更新/);
  await page.getByLabel('开始时间').fill('2099-01-01T00:00');
  await expect(page.getByRole('alert')).toContainText('有效时间范围');
  await expect(page.getByRole('button', { name: '生成报告', exact: true })).toBeDisabled();
});

test('mobile layout, page details, and settings remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'React 文档', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('组件用于描述界面');
  await page.getByRole('button', { name: '关闭页面详情' }).click();
  await page.getByRole('button', { name: '生成报告', exact: true }).click();
  if (await page.getByRole('button', { name: '关闭提示' }).isVisible()) await page.getByRole('button', { name: '关闭提示' }).click();
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, 'mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('navigation').getByRole('button', { name: '设置' }).click();
  await page.getByLabel('自动记录浏览时长').uncheck();
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('设置已保存');
  await expect(page.getByRole('button', { name: '授权网站', exact: true })).toBeDisabled();
});
