import { useEffect, useMemo, useState } from 'react';
import { analyzeActivities, formatDuration } from '../analytics/analyze';
import { exportCsv } from '../reports/generate';
import type { AnalyticsResult, PageSummary, WorkspaceData } from '../shared/types';
import { api, downloadText, errorMessage, isExtension } from './api';
import { Icon } from './Icon';
import { PageDetails } from './PageDetails';

interface Props {
  report: React.ReactNode;
  onGenerate: (analysis: AnalyticsResult) => void;
  onAuthorize: (hostname: string) => void;
  notify: (message: string, error?: boolean) => void;
}
function localInputDate(time: number) {
  const d = new Date(time);
  return new Date(time - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export function Dashboard({ report, onGenerate, onAuthorize, notify }: Props) {
  const [range, setRange] = useState('hours');
  const [hours, setHours] = useState(24);
  const [search, setSearch] = useState('');
  const [hostname, setHostname] = useState('');
  const [tag, setTag] = useState('');
  const [refresh, setRefresh] = useState(Date.now());
  const [customFrom, setCustomFrom] = useState(() => localInputDate(Date.now() - 86_400_000));
  const [customTo, setCustomTo] = useState(() => localInputDate(Date.now()));
  const [data, setData] = useState<WorkspaceData>({
    activities: [],
    snapshots: [],
    annotations: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<PageSummary | null>(null);
  const window = useMemo(() => {
    const to = range === 'custom' ? new Date(customTo).getTime() : refresh;
    const startOfDay = new Date(refresh);
    startOfDay.setHours(0, 0, 0, 0);
    const from =
      range === 'today'
        ? startOfDay.getTime()
        : range === 'custom'
          ? new Date(customFrom).getTime()
          : to - hours * 3_600_000;
    return { from, to };
  }, [range, hours, customFrom, customTo, refresh]);
  const valid =
    Number.isFinite(window.from) &&
    Number.isFinite(window.to) &&
    window.from < window.to &&
    hours >= 1 &&
    hours <= 8760;
  useEffect(() => {
    if (!valid) return;
    let active = true;
    setLoading(true);
    setLoadError('');
    api
      .workspace(window.from, window.to)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [window.from, window.to, valid, refresh]);
  useEffect(() => {
    const timer = setInterval(() => setRefresh(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const analysis = useMemo(
    () =>
      analyzeActivities(data.activities, data.snapshots, data.annotations, {
        ...window,
        search,
        hostname,
        tag,
      }),
    [data, window, search, hostname, tag],
  );
  const available = new Set(analysis.pages.map((page) => page.pageKey));
  const effectiveSelected = selected.filter((key) => available.has(key));
  const domains = [...new Set(data.activities.map((item) => item.hostname))].sort();
  const tags = [...new Set(data.annotations.map((item) => item.tag).filter(Boolean))].sort();
  const selectedAnalysis = effectiveSelected.length
    ? analyzeActivities(data.activities, data.snapshots, data.annotations, {
        ...window,
        search,
        hostname,
        tag,
        pageKeys: effectiveSelected,
      })
    : analysis;
  const peak = Math.max(1, ...analysis.timeline.map((bucket) => bucket.durationMs));
  const allSelected =
    analysis.pages.length > 0 && effectiveSelected.length === analysis.pages.length;
  function togglePage(key: string) {
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }
  function generate() {
    if (analysis.pages.length && valid && !loading && !loadError) onGenerate(selectedAnalysis);
  }
  return (
    <>
      <header className="page-header">
        <div>
          <h1>浏览概览</h1>
          <p>让浏览记录，成为可回顾的积累。</p>
        </div>
        <button
          className="primary"
          disabled={!analysis.pages.length || !valid || loading || !!loadError}
          onClick={generate}
        >
          生成报告
          <Icon name="arrow" size={16} />
        </button>
      </header>
      <div className="filters">
        <select
          aria-label="时间范围"
          value={range}
          onChange={(event) => {
            setRange(event.target.value);
            setRefresh(Date.now());
            setSelected([]);
          }}
        >
          <option value="hours">最近 X 小时</option>
          <option value="today">今天</option>
          <option value="custom">自定义时间</option>
        </select>
        {range === 'hours' && (
          <label className="hours-input">
            <input
              type="number"
              min={1}
              max={8760}
              aria-label="最近多少小时"
              value={hours}
              onChange={(event) => {
                setHours(Number(event.target.value));
                setSelected([]);
              }}
            />
            <span>小时</span>
          </label>
        )}
        <label className="search-field">
          <Icon name="search" size={18} />
          <input
            type="search"
            aria-label="搜索页面或网站"
            placeholder="搜索页面、网站或标签"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSelected([]);
            }}
          />
        </label>
        <select
          aria-label="网站筛选"
          value={hostname}
          onChange={(event) => {
            setHostname(event.target.value);
            setSelected([]);
          }}
        >
          <option value="">全部网站</option>
          {domains.map((domain) => (
            <option key={domain}>{domain}</option>
          ))}
        </select>
        <select
          aria-label="标签筛选"
          value={tag}
          onChange={(event) => {
            setTag(event.target.value);
            setSelected([]);
          }}
        >
          <option value="">全部标签</option>
          {tags.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <button
          className="icon-button"
          title="刷新记录"
          aria-label="刷新记录"
          onClick={() => setRefresh(Date.now())}
        >
          <Icon name="refresh" size={18} />
        </button>
      </div>
      {range === 'custom' && (
        <div className="custom-range">
          <label className="field">
            开始时间
            <input
              type="datetime-local"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
          </label>
          <label className="field">
            结束时间
            <input
              type="datetime-local"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </label>
        </div>
      )}
      {!valid && (
        <p className="error-banner" role="alert">
          请选择有效时间范围，结束时间必须晚于开始时间；小时数为 1–8760。
        </p>
      )}
      {loadError && (
        <p className="error-banner" role="alert">
          {loadError}
          <button onClick={() => setRefresh(Date.now())}>重试</button>
        </p>
      )}
      <div className="metrics" aria-busy={loading}>
        <div>
          <span>活动时长</span>
          <strong>{formatDuration(analysis.totalMs)}</strong>
        </div>
        <div>
          <span>浏览页面</span>
          <strong>
            {analysis.pages.length}
            <small>个</small>
          </strong>
        </div>
        <div>
          <span>内容快照</span>
          <strong>
            {analysis.snapshotCount}
            <small>份</small>
          </strong>
        </div>
      </div>
      <section className="panel timeline">
        <div className="panel-heading">
          <h2>时间分布</h2>
          <span className="muted small">
            {new Date(window.from || refresh).toLocaleDateString('zh-CN')} —{' '}
            {new Date(window.to || refresh).toLocaleDateString('zh-CN')}
          </span>
        </div>
        <div
          className="chart"
          role="img"
          aria-label={`筛选时间内活动时长 ${formatDuration(analysis.totalMs)}`}
        >
          <div className="chart-bars">
            {analysis.timeline.map((bucket, index) => (
              <div key={bucket.startedAt} className="chart-column">
                <div
                  className="chart-bar"
                  style={{
                    height: `${bucket.durationMs ? Math.max(2, (bucket.durationMs / peak) * 100) : 0}%`,
                  }}
                  title={`${new Date(bucket.startedAt).toLocaleString('zh-CN')}：${formatDuration(bucket.durationMs)}`}
                />
                <span>
                  {index % Math.max(1, Math.ceil(analysis.timeline.length / 8)) === 0
                    ? new Date(bucket.startedAt).toLocaleString(
                        'zh-CN',
                        window.to - window.from > 86_400_000
                          ? { month: 'numeric', day: 'numeric', hour: '2-digit', hour12: false }
                          : { hour: '2-digit', minute: '2-digit', hour12: false },
                      )
                    : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="workspace-grid">
        <section className="panel records">
          <div className="panel-heading">
            <h2>浏览记录</h2>
            <button
              className="text-button"
              disabled={!analysis.pages.length || !valid || loading || !!loadError}
              onClick={() =>
                downloadText(
                  exportCsv(analysis),
                  'TickSum-statistics.csv',
                  'text/csv;charset=utf-8',
                )
              }
            >
              <Icon name="download" size={15} />
              CSV
            </button>
          </div>
          {loading ? (
            <div className="empty">
              <p>正在读取本地记录…</p>
            </div>
          ) : analysis.pages.length ? (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="checkbox-cell">
                        <input
                          type="checkbox"
                          aria-label="选择所有页面"
                          checked={allSelected}
                          onChange={() =>
                            setSelected(
                              allSelected ? [] : analysis.pages.map((page) => page.pageKey),
                            )
                          }
                        />
                      </th>
                      <th>页面 / 网站</th>
                      <th>活动时长</th>
                      <th>内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.pages.map((page) => (
                      <tr
                        key={page.pageKey}
                        className={effectiveSelected.includes(page.pageKey) ? 'selected-row' : ''}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`选择 ${page.title || page.hostname}`}
                            checked={effectiveSelected.includes(page.pageKey)}
                            onChange={() => togglePage(page.pageKey)}
                          />
                        </td>
                        <td>
                          <button className="page-title" onClick={() => setDetails(page)}>
                            {page.title || page.url}
                          </button>
                          <span className="domain-line">
                            {page.hostname}
                            {page.tag && <span className="tag">{page.tag}</span>}
                          </span>
                        </td>
                        <td className="duration-cell">{formatDuration(page.durationMs)}</td>
                        <td>
                          <button
                            className={`status-button ${page.snapshot ? 'captured' : ''}`}
                            onClick={() => setDetails(page)}
                          >
                            {page.snapshot ? '已提取' : '仅记录'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="selection-note">
                {effectiveSelected.length
                  ? `已选择 ${effectiveSelected.length} 个页面 · ${formatDuration(selectedAnalysis.totalMs)}`
                  : '未勾选时，报告使用筛选后的全部页面。'}
                {effectiveSelected.length > 0 && (
                  <button className="text-button" onClick={() => setSelected([])}>
                    取消选择
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="empty">
              <Icon name="clock" size={32} />
              <h3>{data.activities.length ? '没有符合条件的记录' : '从下一次浏览开始积累'}</h3>
              <p>
                {data.activities.length
                  ? '调整时间范围、关键词或标签，再试一次。'
                  : isExtension
                    ? '保持扩展开启，切回网页正常浏览，记录会自动出现在这里。'
                    : '这是界面预览。加载 Chrome 扩展后，将自动记录浏览活动。'}
              </p>
              {!data.activities.length && (
                <button onClick={() => onAuthorize('')}>
                  设置正文采集
                  <Icon name="arrow" size={16} />
                </button>
              )}
            </div>
          )}
          <p className="records-footnote muted small">
            有效时长根据前台活动估算，不代表阅读进度或掌握程度。
          </p>
        </section>
        {report}
      </div>
      {details && (
        <PageDetails
          key={details.pageKey}
          page={details}
          onClose={() => setDetails(null)}
          onSaved={() => setRefresh(Date.now())}
          onAuthorize={onAuthorize}
          notify={notify}
        />
      )}
    </>
  );
}
