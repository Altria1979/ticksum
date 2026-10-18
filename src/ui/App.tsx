import { useCallback, useEffect, useState } from 'react';
import { generateReport, REPORT_TEMPLATES } from '../reports/generate';
import {
  DEFAULT_SETTINGS,
  hasTrackingConsent,
  TRACKING_DISCLOSURE_VERSION,
  type AnalyticsResult,
  type ReportTemplate,
  type SavedReport,
  type Settings,
  type TrackerStatus,
} from '../shared/types';
import { api, errorMessage, isDemo, isExtension } from './api';
import { Dashboard } from './Dashboard';
import { Icon } from './Icon';
import { ReportEditor } from './ReportEditor';
import { SettingsPage } from './SettingsPage';
import { FirstRunNotice } from './FirstRunNotice';

type View = 'overview' | 'reports' | 'settings';
export function App() {
  const [view, setView] = useState<View>('overview');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [deferredTracking, setDeferredTracking] = useState(false);
  const [status, setStatus] = useState<TrackerStatus>();
  const [template, setTemplate] = useState<ReportTemplate>('review');
  const [draft, setDraft] = useState<SavedReport | null>(null);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [initialSite, setInitialSite] = useState('');
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [deleteId, setDeleteId] = useState('');
  const [lastAnalysis, setLastAnalysis] = useState<AnalyticsResult>();
  const notify = useCallback((message: string, error = false) => setToast({ message, error }), []);
  const reloadReports = useCallback(() => {
    api
      .reports()
      .then(setReports)
      .catch((error) => notify(errorMessage(error), true));
  }, [notify]);
  useEffect(() => {
    api
      .settings()
      .then((loaded) => { setSettings(loaded); setSettingsLoaded(true); })
      .catch((error) => notify(errorMessage(error), true));
    api
      .status()
      .then(setStatus)
      .catch((error) => notify(errorMessage(error), true));
    reloadReports();
  }, [notify, reloadReports]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.error ? 9000 : 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    document.title = `TickSum · ${view === 'overview' ? '浏览概览' : view === 'reports' ? '报告' : '设置'}`;
  }, [view]);
  function generate(analysis: AnalyticsResult) {
    if (!analysis.pages.length) {
      notify('当前没有可生成报告的浏览记录。', true);
      return;
    }
    const now = Date.now();
    setLastAnalysis(analysis);
    setDraft({
      id: crypto.randomUUID(),
      title: `${new Date(now).toLocaleDateString('zh-CN')} · ${REPORT_TEMPLATES[template]}`,
      template,
      createdAt: now,
      updatedAt: now,
      from: analysis.from,
      to: analysis.to,
      pageKeys: analysis.pages.map((page) => page.pageKey),
      markdown: generateReport(analysis, template, now),
    });
    notify('报告已生成，可编辑后复制或保存。');
  }
  function authorize(site: string) {
    setInitialSite(site);
    setView('settings');
  }
  async function deleteReport() {
    try {
      await api.deleteReport(deleteId);
      if (draft?.id === deleteId) setDraft(null);
      setDeleteId('');
      reloadReports();
      notify('报告已删除。');
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }
  async function enableTracking() {
    setEnabling(true);
    setToast(null);
    try {
      const next = await api.updateSettings({
        trackingEnabled: true,
        trackingConsent: { version: TRACKING_DISCLOSURE_VERSION, acceptedAt: Date.now() },
      });
      setSettings(next);
      notify('自动记录已开启，可随时在设置中暂停。');
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      setEnabling(false);
    }
  }
  const needsConsent = isExtension && !hasTrackingConsent(settings);
  if (needsConsent && !deferredTracking) {
    return <FirstRunNotice
      onEnable={() => void enableTracking()}
      onDefer={() => setDeferredTracking(true)}
      busy={enabling || !settingsLoaded}
      error={toast?.error ? toast.message : undefined}
    />;
  }
  const editor = (
    <ReportEditor
      draft={draft}
      setDraft={setDraft}
      template={template}
      setTemplate={setTemplate}
      onGenerate={lastAnalysis ? () => generate(lastAnalysis) : undefined}
      onSaved={reloadReports}
      notify={notify}
    />
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            setView('overview');
          }}
        >
          <Icon name="clock" size={29} />
          <span>TickSum</span>
        </a>
        <nav aria-label="主导航">
          {(
            [
              { id: 'overview', label: '浏览概览', icon: 'chart' },
              { id: 'reports', label: '报告', icon: 'report' },
              { id: 'settings', label: '设置', icon: 'settings' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-current={view === item.id ? 'page' : undefined}
              className={view === item.id ? 'active' : ''}
              onClick={() => setView(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className={`record-dot ${settings.trackingEnabled ? '' : 'paused'}`} />
          <span>{settings.trackingEnabled ? '自动记录已开启' : '记录已暂停'}</span>
          <p>数据保存在本机</p>
        </div>
      </aside>
      <main>
        {needsConsent && (
          <div className="first-run-deferred" role="status">
            <span>自动记录尚未启用。你仍可查看、导出或删除已有数据。</span>
            <button onClick={() => setDeferredTracking(false)}>查看说明并启用</button>
          </div>
        )}
        {!isExtension && (
          <div className="preview-banner">
            {isDemo
              ? '示例数据 · 以下为演示数据，仅用于展示产品功能。'
              : '界面预览 · 自动记录与网站授权需加载 Chrome 扩展。'}
          </div>
        )}
        {status?.lastError && (
          <p className="error-banner" role="alert">
            采集提示：{status.lastError}
          </p>
        )}
        {view === 'overview' && (
          <Dashboard
            report={editor}
            onGenerate={generate}
            onAuthorize={authorize}
            notify={notify}
          />
        )}
        {view === 'reports' && (
          <>
            <header className="page-header">
              <div>
                <h1>报告</h1>
                <p>整理过的浏览记录，随时回顾与带走。</p>
              </div>
              <button onClick={() => setView('overview')}>
                从浏览记录生成
                <Icon name="arrow" size={16} />
              </button>
            </header>
            <div className="reports-layout">
              <section className="panel saved-reports">
                <div className="panel-heading">
                  <h2>已保存报告</h2>
                  <span className="muted small">{reports.length} 份</span>
                </div>
                {reports.length ? (
                  reports.map((report) => (
                    <div
                      className={`saved-report ${draft?.id === report.id ? 'selected' : ''}`}
                      key={report.id}
                    >
                      <button
                        onClick={() => {
                          setDraft(report);
                          setTemplate(report.template);
                        }}
                      >
                        <strong>{report.title}</strong>
                        <span>
                          {REPORT_TEMPLATES[report.template]} ·{' '}
                          {new Date(report.updatedAt).toLocaleString('zh-CN')}
                        </span>
                      </button>
                      <button
                        className="text-button danger-text"
                        onClick={() => setDeleteId(report.id)}
                        aria-label={`删除 ${report.title}`}
                      >
                        删除
                      </button>
                      {deleteId === report.id && (
                        <div className="inline-confirm">
                          <span>删除这份报告？</span>
                          <button className="danger-text" onClick={() => void deleteReport()}>
                            确认删除
                          </button>
                          <button onClick={() => setDeleteId('')}>取消</button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    <Icon name="report" size={30} />
                    <h3>还没有保存的报告</h3>
                    <p>在浏览概览中生成报告，编辑后点击保存。</p>
                    <button onClick={() => setView('overview')}>查看浏览记录</button>
                  </div>
                )}
              </section>
              {editor}
            </div>
          </>
        )}
        {view === 'settings' && (
          <SettingsPage
            settings={settings}
            onRequestEnable={() => setDeferredTracking(false)}
            updateSettings={setSettings}
            initialSite={initialSite}
            onCleared={() => {
              setDraft(null);
              setLastAnalysis(undefined);
              reloadReports();
            }}
            notify={notify}
          />
        )}
        <footer className="app-footer">
          TickSum <span>·</span> 记录时间，也留下线索。
        </footer>
      </main>
      {toast && (
        <div
          className={`toast ${toast.error ? 'toast-error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.message}
          <button aria-label="关闭提示" onClick={() => setToast(null)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
