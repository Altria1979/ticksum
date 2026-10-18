import { db, loadWorkspace } from '../data/db';
import { getSettings, saveSettings } from '../platform/settings';
import type { ExtensionMessage, ExtensionResponse } from '../shared/messages';
import {
  DEFAULT_SETTINGS,
  type PageAnnotation,
  type SavedReport,
  type Settings,
  type TrackerStatus,
} from '../shared/types';
import { createDemoData } from './demo';

export const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
export const isDemo = !isExtension && new URLSearchParams(location.search).get('demo') === '1';
const preview = isDemo ? createDemoData() : { activities: [], snapshots: [], annotations: [] };
let previewSettings = { ...DEFAULT_SETTINGS };
let previewReports: SavedReport[] = [];

export async function command(message: ExtensionMessage): Promise<ExtensionResponse> {
  if (!isExtension) return { ok: true };
  const result = (await chrome.runtime.sendMessage(message)) as ExtensionResponse | undefined;
  if (!result) throw new Error('扩展后台暂未响应，请重新打开 TickSum。');
  if (!result.ok) throw new Error(result.error);
  return result;
}

export const api = {
  async workspace(from: number, to: number) {
    if (!isExtension) return { ...preview, annotations: [...preview.annotations] };
    await command({ type: 'REFRESH_TRACKING' });
    return loadWorkspace(from, to);
  },
  async settings(): Promise<Settings> {
    return isExtension ? getSettings() : { ...previewSettings };
  },
  async updateSettings(next: Partial<Settings>) {
    if (!isExtension) {
      previewSettings = { ...previewSettings, ...next };
      return previewSettings;
    }
    const result = await saveSettings(next);
    await command({ type: 'REFRESH_TRACKING' });
    return result;
  },
  async status(): Promise<TrackerStatus | undefined> {
    const response = await command({ type: 'GET_STATUS' });
    return response.ok ? response.status : undefined;
  },
  async annotate(annotation: PageAnnotation) {
    if (isExtension) {
      await db.annotations.put(annotation);
      return;
    }
    const index = preview.annotations.findIndex((item) => item.pageKey === annotation.pageKey);
    if (index >= 0) preview.annotations[index] = annotation;
    else preview.annotations.push(annotation);
  },
  async reports() {
    return isExtension ? db.reports.orderBy('updatedAt').reverse().toArray() : [...previewReports];
  },
  async saveReport(report: SavedReport) {
    if (isExtension) {
      await db.reports.put(report);
      return;
    }
    previewReports = [report, ...previewReports.filter((item) => item.id !== report.id)];
  },
  async deleteReport(id: string) {
    if (isExtension) {
      await db.reports.delete(id);
      return;
    }
    previewReports = previewReports.filter((item) => item.id !== id);
  },
  async origins(): Promise<string[]> {
    return isExtension ? ((await chrome.permissions.getAll()).origins ?? []) : [];
  },
  async grantSite(input: string) {
    if (!isExtension) throw new Error('请在 Chrome 扩展中授权网站。');
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hostname.includes('*')
    )
      throw new Error('请输入有效的网站域名或 HTTP(S) 地址。');
    const granted = await chrome.permissions.request({
      origins: [`${url.protocol}//${url.hostname}/*`],
    });
    if (!granted) throw new Error('未获得网站授权，浏览时长仍可正常记录。');
    await command({ type: 'SYNC_CAPTURE_PERMISSIONS' });
  },
  async revokeSite(origin: string) {
    await chrome.permissions.remove({ origins: [origin] });
    await command({ type: 'SYNC_CAPTURE_PERMISSIONS' });
  },
  async clear() {
    if (isExtension) {
      await command({ type: 'CLEAR_DATA' });
      return;
    }
    preview.activities.length = 0;
    preview.snapshots.length = 0;
    preview.annotations.length = 0;
    previewReports = [];
  },
};

export function downloadText(text: string, filename: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试。';
}
