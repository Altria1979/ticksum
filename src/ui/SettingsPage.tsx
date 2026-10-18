import { useEffect, useState } from 'react';
import type { Settings } from '../shared/types';
import { api, errorMessage, isExtension } from './api';

export function SettingsPage({
  settings,
  updateSettings,
  initialSite,
  onCleared,
  notify,
}: {
  settings: Settings;
  updateSettings: (settings: Settings) => void;
  initialSite: string;
  onCleared: () => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [excluded, setExcluded] = useState(settings.excludedHosts.join('\n'));
  const [origins, setOrigins] = useState<string[]>([]);
  const [site, setSite] = useState(initialSite);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .origins()
      .then(setOrigins)
      .catch((error) => notify(errorMessage(error), true));
  }, [notify]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const excludedHosts = excluded
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const url = new URL(item.includes('://') ? item : `https://${item}`);
          if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.hostname.includes('*') ||
            url.username ||
            url.password
          )
            throw new Error(`无效的排除网站：${item}`);
          return url.hostname;
        });
      const next = await api.updateSettings({ ...draft, excludedHosts });
      updateSettings(next);
      setDraft(next);
      setExcluded(next.excludedHosts.join('\n'));
      notify('设置已保存。');
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }
  async function grant(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.grantSite(site.trim());
      setOrigins(await api.origins());
      setSite('');
      notify('已授权。切回该网站后，正文将自动采集。');
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }
  async function revoke(origin: string) {
    try {
      await api.revokeSite(origin);
      setOrigins(await api.origins());
      notify('已撤销正文采集权限，已有快照仍保留在本机。');
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }
  async function clear() {
    setBusy(true);
    try {
      await api.clear();
      setConfirmDelete(false);
      onCleared();
      notify('本地活动、快照、备注与报告已删除。');
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-header">
        <div>
          <h1>设置</h1>
          <p>按自己的节奏记录，决定哪些内容可以保留。</p>
        </div>
      </header>
      <div className="settings-layout">
        <form className="panel settings-panel" onSubmit={(event) => void save(event)}>
          <h2>活动记录</h2>
          <label className="toggle-row">
            <span>
              <strong>自动记录浏览时长</strong>
              <small>仅计算前台网页；隐身窗口和扩展页面不记录。</small>
            </span>
            <input
              type="checkbox"
              checked={draft.trackingEnabled}
              onChange={(event) => setDraft({ ...draft, trackingEnabled: event.target.checked })}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              闲置暂停阈值（秒）
              <input
                type="number"
                min={60}
                max={3600}
                required
                value={draft.idleSeconds}
                onChange={(event) =>
                  setDraft({ ...draft, idleSeconds: Number(event.target.value) })
                }
              />
              <span className="muted small">60–3600 秒。长时间阅读或观看视频时，可适当调高。</span>
            </label>
            <label className="field">
              活动和正文保留天数
              <input
                type="number"
                min={1}
                max={365}
                required
                value={draft.retentionDays}
                onChange={(event) =>
                  setDraft({ ...draft, retentionDays: Number(event.target.value) })
                }
              />
              <span className="muted small">1–365 天。已保存的报告和备注独立保留。</span>
            </label>
            <label className="field">
              排除网站
              <textarea
                rows={4}
                value={excluded}
                placeholder={'例如：bank.example.com\nprivate.example.com'}
                onChange={(event) => setExcluded(event.target.value)}
              />
              <span className="muted small">每行一个域名，同时排除其子域名的计时和正文采集。</span>
            </label>
          </div>
          <button className="primary" disabled={busy}>
            {busy ? '处理中…' : '保存设置'}
          </button>
        </form>
        <section className="panel settings-panel">
          <h2>正文采集授权</h2>
          <p className="muted">
            一次授权，之后自动采集该网站已加载的正文。其他网站仍可记录访问时长。
          </p>
          <form className="grant-form" onSubmit={(event) => void grant(event)}>
            <label className="field">
              网站地址
              <input
                type="text"
                required
                placeholder="https://react.dev"
                value={site}
                onChange={(event) => setSite(event.target.value)}
              />
            </label>
            <button className="primary" disabled={!isExtension || !site.trim()}>
              授权网站
            </button>
          </form>
          {!isExtension && (
            <p className="small muted">网站授权需要在已安装的 Chrome 扩展中操作。</p>
          )}
          <ul className="origin-list">
            {origins.map((origin) => (
              <li key={origin}>
                <span>{origin}</span>
                <button className="text-button danger-text" onClick={() => void revoke(origin)}>
                  撤销
                </button>
              </li>
            ))}
          </ul>
          {!origins.length && <p className="subtle-empty">尚未授权任何网站。</p>}
          <p className="small muted">
            动态文档可能只能提取部分内容。撤销授权会停止新采集；旧快照随保留期清理。
          </p>
        </section>
        <section className="panel settings-panel data-management">
          <h2>本地数据</h2>
          <p className="muted">
            TickSum 不上传浏览记录或正文。报告可能包含快照摘录，复制和导出前可以自行编辑。
          </p>
          {confirmDelete ? (
            <div className="delete-confirm">
              <p>将永久删除本机的全部活动、正文快照、备注和报告。设置及网站授权保留。</p>
              <div className="button-row">
                <button className="danger" disabled={busy} onClick={() => void clear()}>
                  确认删除全部数据
                </button>
                <button onClick={() => setConfirmDelete(false)}>取消</button>
              </div>
            </div>
          ) : (
            <button className="danger-text" onClick={() => setConfirmDelete(true)}>
              删除全部本地数据
            </button>
          )}
        </section>
      </div>
    </>
  );
}
