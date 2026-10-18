import { DEFAULT_SETTINGS, hasTrackingConsent, type Settings } from '../shared/types';
import { normalizeExcludedHost } from '../tracking/url';

export const SETTINGS_KEY = 'settings';

export function validateSettings(value: Partial<Settings>): Settings {
  const idleSeconds = value.idleSeconds ?? DEFAULT_SETTINGS.idleSeconds;
  const retentionDays = value.retentionDays ?? DEFAULT_SETTINGS.retentionDays;
  if (!Number.isInteger(idleSeconds) || idleSeconds < 60 || idleSeconds > 3600) {
    throw new Error('闲置阈值应为 60–3600 秒的整数。');
  }
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    throw new Error('保留天数应为 1–365 的整数。');
  }
  if (value.trackingEnabled !== undefined && typeof value.trackingEnabled !== 'boolean') {
    throw new Error('计时开关无效。');
  }
  if (value.excludedHosts !== undefined && (!Array.isArray(value.excludedHosts) || value.excludedHosts.length > 200)) {
    throw new Error('排除网站最多为 200 个。');
  }
  const excludedHosts = (value.excludedHosts ?? []).map((host) => {
    if (typeof host !== 'string') throw new Error('排除网站格式无效。');
    const normalized = normalizeExcludedHost(host);
    if (!normalized) throw new Error(`网站格式无效：${host.slice(0, 100)}`);
    return normalized;
  });
  const trackingConsent = hasTrackingConsent({ trackingConsent: value.trackingConsent ?? null })
    ? { version: value.trackingConsent!.version, acceptedAt: value.trackingConsent!.acceptedAt }
    : null;
  return {
    trackingEnabled: trackingConsent !== null && (value.trackingEnabled ?? DEFAULT_SETTINGS.trackingEnabled),
    trackingConsent,
    idleSeconds, retentionDays, excludedHosts: [...new Set(excludedHosts)],
  };
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return validateSettings(stored[SETTINGS_KEY] ?? DEFAULT_SETTINGS);
}

export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  const next = validateSettings({ ...await getSettings(), ...partial });
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}
