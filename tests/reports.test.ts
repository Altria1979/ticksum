import { describe, expect, it } from 'vitest';
import { analyzeActivities } from '../src/analytics/analyze';
import { exportCsv, generateReport, REPORT_TEMPLATES } from '../src/reports/generate';
import type { AnalyticsResult, ReportTemplate, Snapshot } from '../src/shared/types';

function analysis(): AnalyticsResult {
  return analyzeActivities([{
    id: '1', pageKey: 'page', url: 'https://example.com/docs', hostname: 'example.com',
    title: 'React 文档', startedAt: 0, endedAt: 90_000,
  }], [], [{ pageKey: 'page', tag: '学习', note: '下次继续阅读' }], { from: 0, to: 120_000 });
}
const snapshot: Snapshot = {
  id: 's', pageKey: 'page', url: 'https://example.com/docs', title: 'React 文档', hostname: 'example.com',
  capturedAt: 30_000, contentHash: 'hash', text: '原文提到组件组合。', excerpt: '原文提到组件组合。',
  headings: ['组件'], method: 'readability', coverage: 'partial', wordCount: 10,
};

describe('generateReport', () => {
  it('produces useful offline reports with computed numbers and no invented outcomes', () => {
    for (const template of Object.keys(REPORT_TEMPLATES) as ReportTemplate[]) {
      const report = generateReport(analysis(), template, 120_000);
      expect(report).toContain(REPORT_TEMPLATES[template]);
      expect(report).toContain('活动总时长：1 分钟 30 秒');
      expect(report).toContain('[React 文档](<https://example.com/docs>)');
      expect(report).toContain('未采集正文');
      expect(report).toContain('下次继续阅读');
      expect(report).toContain('标签：学习');
      expect(report).toContain('未使用 AI');
      expect(report).not.toMatch(/已掌握|已完成|学会了/);
    }
  });

  it('identifies partial content, source snapshot time, original excerpts and bounded length', () => {
    const data = analysis();
    data.pages[0]!.snapshot = { ...snapshot, excerpt: '文'.repeat(1_000) };
    data.snapshotCount = 1;
    const report = generateReport(data, 'learning', 120_000);
    expect(report).toContain('仅采集到部分内容，不能代表全文');
    expect(report).toContain('正文快照：');
    expect(report).toContain('原文摘录（非 AI 总结）');
    expect(report).toContain('文'.repeat(500) + '…');
    expect(report).not.toContain('文'.repeat(501));
    expect(report).toContain('页面标题摘录');
  });

  it('labels unknown and empty snapshots honestly', () => {
    const data = analysis();
    data.pages[0]!.snapshot = { ...snapshot, coverage: 'unknown', text: '', excerpt: '', headings: [] };
    const report = generateReport(data, 'research');
    expect(report).toContain('完整性未知');
    expect(report).toContain('此快照没有可用正文摘录');
  });

  it('escapes untrusted page data and blocks unsafe URL schemes', () => {
    const data = analysis();
    data.pages[0]!.title = '恶意](javascript:alert(1))\n# 注入';
    data.pages[0]!.url = 'javascript:alert(1)';
    data.pages[0]!.note = '<img src=x onerror=alert(1)>\n# 假标题';
    const report = generateReport(data, 'review');
    expect(report).toContain('来源链接不可用');
    expect(report).not.toContain('](javascript:');
    expect(report).not.toContain('<img');
    expect(report).not.toContain('\n# 假标题');
    expect(report).toContain('&lt;img');
  });

  it('strips embedded URL credentials and encodes closing link delimiters', () => {
    const data = analysis();
    data.pages[0]!.url = 'https://user:secret@example.com/a(b)?x=%3E';
    const report = generateReport(data, 'review');
    expect(report).not.toContain('user:secret');
    expect(report).toContain('https://example.com/a%28b%29?x=%3E');
  });

  it('handles an empty selection without including sample activity', () => {
    const data = analyzeActivities([], [], [], { from: 0, to: 120_000 });
    const report = generateReport(data, 'review', 120_000);
    expect(report).toContain('活动总时长：0 秒');
    expect(report).toContain('没有选中的页面');
    expect(report).not.toContain('React');
  });
});

describe('exportCsv', () => {
  it('retains exact milliseconds and quotes commas, newlines and quotes', () => {
    const data = analysis();
    data.pages[0]!.title = '文档,"入门"';
    data.pages[0]!.note = '第一行\n第二行';
    const csv = exportCsv(data);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"文档,""入门"""');
    expect(csv).toContain('"第一行\n第二行"');
    expect(csv).toContain('"90000"');
  });

  it('neutralizes spreadsheet formulas including whitespace-prefixed values', () => {
    const data = analysis();
    for (const formula of ['=HYPERLINK("evil")', '+1+2', '-1+2', '@SUM(1)', '  =1', '\t=1', '\n=1']) {
      data.pages[0]!.note = formula;
      expect(exportCsv(data)).toContain(`"'${formula.replace(/"/g, '""')}"`);
    }
  });
});
