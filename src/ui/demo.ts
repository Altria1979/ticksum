import type { WorkspaceData } from '../shared/types';

export function createDemoData(now = Date.now()): WorkspaceData {
  const pages = [
    [
      'https://react.dev/learn',
      'React 文档',
      42,
      '组件用于描述界面。通过组合组件，可以构建交互界面。',
      '组件与状态',
    ],
    [
      'https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_grid_layout',
      'CSS Grid 指南',
      35,
      'CSS 网格布局是二维布局系统。它能够同时处理行和列。',
      '二维布局',
    ],
    ['https://github.com/example/project', '项目讨论', 28, '', ''],
    [
      'https://web.dev/articles/rendering-performance',
      '技术文章',
      21,
      '页面渲染涉及样式、布局、绘制和合成。',
      '页面渲染',
    ],
  ] as const;
  return {
    activities: pages.map(([url, title, minutes], index) => ({
      id: `demo-${index}`,
      pageKey: url,
      url,
      title,
      hostname: new URL(url).hostname,
      startedAt: now - (index + 1) * 3_600_000,
      endedAt: now - (index + 1) * 3_600_000 + minutes * 60_000,
    })),
    snapshots: pages
      .filter((page) => page[3])
      .map(([url, title, , text, heading], index) => ({
        id: `snapshot-${index}`,
        pageKey: url,
        url,
        title,
        hostname: new URL(url).hostname,
        capturedAt: now - 30_000,
        contentHash: `demo-hash-${index}`,
        text,
        excerpt: text,
        headings: [heading],
        method: 'readability',
        coverage: 'partial',
        wordCount: text.length,
      })),
    annotations: [{ pageKey: pages[0][0], tag: '开发', note: '' }],
  };
}
