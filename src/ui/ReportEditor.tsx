import { useState } from 'react';
import { REPORT_TEMPLATES } from '../reports/generate';
import type { ReportTemplate, SavedReport } from '../shared/types';
import { api, downloadText, errorMessage } from './api';
import { Icon } from './Icon';

interface Props {
  draft: SavedReport | null;
  setDraft: (draft: SavedReport | null) => void;
  template: ReportTemplate;
  setTemplate: (template: ReportTemplate) => void;
  onGenerate?: () => void;
  onSaved: () => void;
  notify: (message: string, error?: boolean) => void;
}
export function ReportEditor({
  draft,
  setDraft,
  template,
  setTemplate,
  onGenerate,
  onSaved,
  notify,
}: Props) {
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const updated = { ...draft, updatedAt: Date.now() };
      await api.saveReport(updated);
      setDraft(updated);
      onSaved();
      notify('报告已保存到本机。');
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      setSaving(false);
    }
  }
  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.markdown);
      notify('报告已复制，可以粘贴到日记中。');
    } catch {
      notify('复制失败，请选中报告正文后手动复制。', true);
    }
  }
  return (
    <section className="panel report-editor" aria-labelledby="report-preview-heading">
      <div className="panel-heading">
        <h2 id="report-preview-heading">报告预览</h2>
        <select
          aria-label="报告模板"
          value={template}
          onChange={(event) => setTemplate(event.target.value as ReportTemplate)}
        >
          {Object.entries(REPORT_TEMPLATES).map(([value, title]) => (
            <option key={value} value={value}>
              {title}
            </option>
          ))}
        </select>
      </div>
      {draft ? (
        <>
          <label className="field">
            报告标题
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label className="field editor-field">
            报告正文（Markdown）
            <textarea
              spellCheck={false}
              value={draft.markdown}
              onChange={(event) => setDraft({ ...draft, markdown: event.target.value })}
            />
          </label>
          <p className="muted small">
            {new Date(draft.from).toLocaleString('zh-CN')} —{' '}
            {new Date(draft.to).toLocaleString('zh-CN')}
            <br />
            筛选或模板变化后，点击生成报告更新正文。
          </p>
          <div className="button-row">
            <button onClick={() => void copy()}>
              <Icon name="copy" size={16} />
              复制报告
            </button>
            <button
              onClick={() =>
                downloadText(
                  draft.markdown,
                  `TickSum-${new Date(draft.createdAt).toISOString().slice(0, 10)}.md`,
                )
              }
            >
              <Icon name="download" size={16} />
              导出 Markdown
            </button>
            <button
              className="primary"
              disabled={saving || !draft.markdown.trim()}
              onClick={() => void save()}
            >
              {saving ? '保存中…' : '保存报告'}
            </button>
          </div>
        </>
      ) : (
        <div className="empty report-empty">
          <Icon name="report" size={32} />
          <h3>把浏览记录整理成报告</h3>
          <p>选择时间与页面，生成带有时长、来源和正文摘录的报告。</p>
          {onGenerate && (
            <button onClick={onGenerate}>
              生成报告
              <Icon name="arrow" size={16} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
