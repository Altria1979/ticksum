import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from '@playwright/test';

// Render our vector mark and capture the real UI using explicitly synthetic data.
// Requires `npm run preview` on localhost; never connects to a user's Chrome profile.
const root = new URL('../', import.meta.url);
const assetPath = (path) => fileURLToPath(new URL(path, root));
await mkdir(assetPath('public/icon'), { recursive: true });
await mkdir(assetPath('docs/store-assets'), { recursive: true });
const svg = await readFile(new URL('docs/brand/ticksum-icon.svg', root), 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100vw;height:100vh;display:block}</style>${svg}`);
    await page.screenshot({ path: assetPath(`public/icon/${size}.png`), omitBackground: true });
  }
  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#116448;color:#fff;font-family:Arial,sans-serif;overflow:hidden}
    main{width:440px;height:280px;position:relative;padding:28px 32px}
    .clock{width:112px;height:112px;margin-left:-16px;margin-top:-12px}.clock svg{width:100%;height:100%}
    h1{font-size:46px;font-weight:700;letter-spacing:-2px;margin:10px 0 0}
    .trail{display:flex;gap:13px;align-items:flex-end;position:absolute;right:34px;top:48px;height:135px}
    .trail i{display:block;width:24px;border-radius:7px;background:#8ad7b8}
    .trail i:nth-child(1){height:38px}.trail i:nth-child(2){height:76px}.trail i:nth-child(3){height:110px}
    .rule{position:absolute;left:32px;right:32px;bottom:34px;height:1px;background:#64a98d}
    .dot{position:absolute;right:34px;bottom:30px;width:9px;height:9px;border-radius:50%;background:#b7ebce}
  </style></head><body><main><div class="clock">${svg}</div><div class="trail"><i></i><i></i><i></i></div><h1>TickSum</h1><div class="rule"></div><div class="dot"></div></main></body></html>`);
  await page.screenshot({ path: assetPath('docs/store-assets/promo-440x280.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:5173/?demo=1');
  await page.getByRole('button', { name: 'React 文档', exact: true }).waitFor();
  assert.match(await page.locator('.preview-banner').innerText(), /示例数据/);
  await page.screenshot({ path: assetPath('docs/store-assets/overview-1280x800.png') });
  await page.getByRole('button', { name: '生成报告', exact: true }).click();
  await page.getByLabel('报告正文（Markdown）').waitFor();
  await page.getByRole('button', { name: '保存报告', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  await page.getByRole('navigation').getByRole('button', { name: '报告', exact: true }).click();
  if (await page.getByRole('button', { name: '关闭提示' }).isVisible()) {
    await page.getByRole('button', { name: '关闭提示' }).click();
  }
  await page.screenshot({ path: assetPath('docs/store-assets/report-1280x800.png') });
  process.stdout.write('Store assets generated: four PNG icons, 440x280 promo, two 1280x800 screenshots (synthetic demo data).\n');
} finally {
  await browser.close();
}
