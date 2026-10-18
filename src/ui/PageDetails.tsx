import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../analytics/analyze';
import type { PageSummary } from '../shared/types';
import { api, errorMessage } from './api';
import { Icon } from './Icon';

export function PageDetails({
  page,
  onClose,
  onSaved,
  onAuthorize,
  notify,
}: {
  page: PageSummary;
  onClose: () => void;
  onSaved: () => void;
  onAuthorize: (hostname: string) => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tag, setTag] = useState(page.tag);
  const [note, setNote] = useState(page.note);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function save() {
    setSaving(true);
    try {
      await api.annotate({ pageKey: page.pageKey, tag: tag.trim(), note: note.trim() });
      onSaved();
      notify('标签与备注已保存。');
      onClose();
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="detail-dialog"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{page.title || page.hostname}</h2>
        <button className="icon-button" aria-label="关闭页面详情" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <a href={page.url} target="_blank" rel="noreferrer" className="source-link">
        {page.url}
      </a>
      <p className="muted">
        活动时长 {formatDuration(page.durationMs)} · {page.visits} 次访问
      </p>
      <div className="form-grid">
        <label className="field">
          标签
          <input
            maxLength={60}
            value={tag}
            placeholder="例如：开发、阅读、调研"
            onChange={(event) => setTag(event.target.value)}
          />
        </label>
        <label className="field">
          我的备注
          <textarea
            maxLength={4000}
            rows={3}
            value={note}
            placeholder="记录你的发现或收获，生成报告时一起带上。"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
      <div className="button-row">
        <button className="primary" onClick={() => void save()} disabled={saving}>
          保存标签与备注
        </button>
      </div>
      <div className="snapshot-section">
        <h3>页面内容快照</h3>
        {page.snapshot ? (
          <>
            <p className="muted small">
              采集于 {new Date(page.snapshot.capturedAt).toLocaleString('zh-CN')} ·{' '}
              {page.snapshot.coverage === 'partial' ? '部分内容' : '完整度未知'} ·{' '}
              {page.snapshot.method}
            </p>
            <p className="muted small">以下是当时已加载的页面内容，不代表已阅读或掌握全部内容。</p>
            <pre className="snapshot-text">{page.snapshot.text}</pre>
          </>
        ) : (
          <>
            <p className="muted">
              此页面尚无正文快照。授权网站后，切回网页即可自动提取已加载的正文。
            </p>
            <button
              onClick={() => {
                onClose();
                onAuthorize(new URL(page.url).origin);
              }}
            >
              授权此网站
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}
