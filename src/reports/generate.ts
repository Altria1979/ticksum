import { formatDuration } from '../analytics/analyze';
import type { AnalyticsResult, PageSummary, ReportTemplate } from '../shared/types';

export const REPORT_TEMPLATES: Record<ReportTemplate, string> = {
  review: '时间复盘', learning: '学习记录', work: '工作总结', research: '调研记录',
};

function markdownText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}[\]()#+.!|~-]/g, '\\$&');
}

function oneLine(value: string): string { return value.replace(/[\r\n\t]+/g, ' ').trim(); }

function sourceLink(title: string, url: string): string {
  const label = markdownText(oneLine(title || '未命名页面'));
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return `${label}（来源链接不可用）`;
    parsed.username = '';
    parsed.password = '';
    const safeUrl = parsed.href.replace(/[<>\s()\\]/g, value => encodeURIComponent(value)
      .replace(/\(/g, '%28').replace(/\)/g, '%29'));
    return `[${label}](<${safeUrl}>)`;
  } catch {
    return `${label}（来源链接不可用）`;
  }
}

function localDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

function quote(value: string, maxLength: number): string {
  const shortened = value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  return shortened.split(/\r\n?|\n/).map(line => `> ${markdownText(line)}`).join('\n');
}

function pageSection(page: PageSummary, index: number): string {
  const lines = [
    `### ${index + 1}. ${sourceLink(page.title, page.url)}`,
    '',
    `- 活动时长：${formatDuration(page.durationMs)}`,
    `- 访问次数：${page.visits}`,
    `- 网站：${markdownText(oneLine(page.hostname))}`,
  ];
  if (page.tag) lines.push(`- 标签：${markdownText(oneLine(page.tag))}`);
  if (page.note.trim()) lines.push('', '**个人备注**', '', quote(page.note.trim(), 4_000));
  const snapshot = page.snapshot;
  if (!snapshot) {
    lines.push('', '未采集正文；此条仅包含浏览活动记录。');
  } else {
    lines.push('', `正文快照：${localDate(snapshot.capturedAt)}；${snapshot.coverage === 'partial'
      ? '仅采集到部分内容，不能代表全文' : '完整性未知，不能确认是否覆盖全文'}。`);
    if (snapshot.headings.length > 0) {
      lines.push('', '**页面标题摘录**', '', ...snapshot.headings.slice(0, 6)
        .map(heading => `- ${markdownText(oneLine(heading).slice(0, 180))}`));
    }
    const excerpt = snapshot.excerpt.trim() || snapshot.text.trim();
    if (excerpt) lines.push('', '**原文摘录（非 AI 总结）**', '', quote(excerpt, 500));
    else lines.push('', '此快照没有可用正文摘录。');
  }
  return lines.join('\n');
}

export function generateReport(analytics: AnalyticsResult, template: ReportTemplate, now = Date.now()): string {
  const description: Record<ReportTemplate, string> = {
    review: '以下按活动时长整理所选浏览记录，用于回顾时间分配。',
    learning: '以下整理所选学习资料的访问记录与原文摘录；浏览时长不代表掌握程度。',
    work: '以下整理所选浏览活动与个人备注，供工作复盘使用；不推断任务完成情况。',
    research: '以下整理所选资料的来源与原文摘录，供调研追溯使用；不自动推断资料之间的结论。',
  };
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lines = [
    `# ${REPORT_TEMPLATES[template]} · TickSum`, '', description[template], '',
    `- 统计范围：${localDate(analytics.from)} 至 ${localDate(analytics.to)}（${timezone}）`,
    `- 生成时间：${localDate(now)}`,
    `- 活动总时长：${formatDuration(analytics.totalMs)}`,
    `- 页面数量：${analytics.pages.length}`,
    `- 网站数量：${analytics.domains.length}`,
    `- 有正文快照的页面：${analytics.snapshotCount}`, '',
    '计时口径：仅汇总筛选范围内被记录的前台活动片段，按时间边界裁剪，重叠时间只计一次。闲置判定可能影响阅读计时；活动时长不代表实际阅读量或理解程度。', '',
    '## 网站分布', '',
  ];
  if (analytics.domains.length === 0) lines.push('所选范围内没有活动记录。');
  else lines.push(...analytics.domains.map(domain => `- ${markdownText(oneLine(domain.hostname))}：${formatDuration(domain.durationMs)}，${domain.pages} 个页面`));
  lines.push('', '## 页面与来源', '');
  if (analytics.pages.length === 0) lines.push('没有选中的页面，未生成内容摘录。');
  else lines.push(analytics.pages.map(pageSection).join('\n\n'));
  lines.push('', '---', '', '报告根据本地活动记录、正文快照和个人备注生成，未使用 AI。正文采集时间与浏览时间可能不同；未加载、未获授权或未能提取的内容不会出现在摘录中。', '');
  return lines.join('\n');
}

function csvCell(value: string | number): string {
  let text = String(value);
  // Quoting alone does not prevent spreadsheet formula evaluation. Also guard
  // leading whitespace/control characters before formula markers.
  let start = 0;
  while (start < text.length && (text.charCodeAt(start) < 32 || /\s/.test(text.charAt(start)))) start++;
  if ((start < text.length && '=+-@'.includes(text.charAt(start))) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportCsv(analytics: AnalyticsResult): string {
  const rows: (string | number)[][] = [
    ['页面标题', '网址', '网站', '活动时长（毫秒）', '活动时长', '访问次数', '标签', '个人备注', '最后活动时间', '正文快照时间', '正文完整性'],
    ...analytics.pages.map(page => [
      page.title, page.url, page.hostname, page.durationMs, formatDuration(page.durationMs), page.visits,
      page.tag, page.note, localDate(page.lastSeenAt),
      page.snapshot ? localDate(page.snapshot.capturedAt) : '',
      page.snapshot ? page.snapshot.coverage === 'partial' ? '部分内容' : '完整性未知' : '未采集',
    ]),
  ];
  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
