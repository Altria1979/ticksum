import { Icon } from './Icon';
import './first-run.css';

export function FirstRunNotice({ onEnable, onDefer, busy, error }: {
  onEnable: () => void;
  onDefer: () => void;
  busy: boolean;
  error?: string;
}) {
  return (
    <main className="first-run-shell">
      <section className="first-run-notice" aria-labelledby="first-run-title">
        <div className="first-run-brand"><Icon name="clock" size={28} /> TickSum</div>
        <p className="first-run-eyebrow">开始之前 · 数据与隐私</p>
        <h1 id="first-run-title">让时间留下记录，<br />由你决定何时开始。</h1>
        <p>TickSum 将浏览活动整理成统计与报告。点击下方按钮前，不会开始记录。</p>
        <ul>
          <li><strong>自动记录：</strong>保存前台网页的地址（包括查询参数和片段）、标题、访问时间与使用时长，用于统计和报告。隐身窗口不记录；闲置或切出 Chrome 时暂停。</li>
          <li><strong>正文另行授权：</strong>只有你在设置中单独授权的网站，才会提取当前前台页面可读取的正文、标题和摘要，并保存为本地快照。授权登录网站后，快照可能包含页面中显示的私人内容。</li>
          <li><strong>仅存本机：</strong>记录、快照、备注与报告保存在当前浏览器中。本版本不向服务器、AI 服务或云端发送这些数据，也不含遥测。复制和导出的文件由你自行管理。</li>
          <li><strong>随时管理：</strong>活动与正文默认保留 30 天，可在设置中调整、排除网站或暂停记录。备注和已保存报告单独保留，直到你删除；「删除全部本地数据」会一并删除。</li>
        </ul>
        <p className="first-run-policy">查看完整的 <a href="https://github.com/Altria1979/ticksum/blob/main/docs/privacy-policy.md" target="_blank" rel="noreferrer">隐私政策</a>。</p>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <div className="first-run-actions">
          <button className="primary" disabled={busy} onClick={onEnable}>启用自动记录 <Icon name="arrow" size={16} /></button>
          <button disabled={busy} onClick={onDefer}>暂不开启，查看已有数据</button>
        </div>
      </section>
    </main>
  );
}
