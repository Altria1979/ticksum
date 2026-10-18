export interface Activity {
  id: string;
  pageKey: string;
  url: string;
  title: string;
  hostname: string;
  startedAt: number;
  endedAt: number;
}

export interface Snapshot {
  id: string;
  pageKey: string;
  url: string;
  title: string;
  hostname: string;
  capturedAt: number;
  contentHash: string;
  text: string;
  excerpt: string;
  headings: string[];
  method: 'readability' | 'adapter' | 'fallback';
  coverage: 'partial' | 'unknown';
  wordCount: number;
}

export interface PageAnnotation { pageKey: string; tag: string; note: string }
export type ReportTemplate = 'review' | 'learning' | 'work' | 'research';
export interface SavedReport {
  id: string;
  title: string;
  template: ReportTemplate;
  createdAt: number;
  updatedAt: number;
  from: number;
  to: number;
  pageKeys: string[];
  markdown: string;
}

export interface Settings {
  trackingEnabled: boolean;
  trackingConsent: { version: number; acceptedAt: number } | null;
  idleSeconds: number;
  excludedHosts: string[];
  retentionDays: number;
}
export const TRACKING_DISCLOSURE_VERSION = 1;
export function hasTrackingConsent(settings: Pick<Settings, 'trackingConsent'>): boolean {
  const consent = settings.trackingConsent;
  return consent?.version === TRACKING_DISCLOSURE_VERSION
    && Number.isFinite(consent.acceptedAt) && consent.acceptedAt > 0;
}
export const DEFAULT_SETTINGS: Settings = {
  trackingEnabled: false, trackingConsent: null, idleSeconds: 300, excludedHosts: [], retentionDays: 30,
};
export interface TrackerStatus {
  tracking: boolean;
  reason: 'active' | 'paused' | 'idle' | 'unfocused' | 'excluded' | 'unsupported';
  activeTitle?: string;
  activeUrl?: string;
  lastError?: string;
}
export interface AnalysisFilter {
  from: number;
  to: number;
  search?: string;
  hostname?: string;
  tag?: string;
  pageKeys?: string[];
}
export interface PageSummary {
  pageKey: string;
  url: string;
  title: string;
  hostname: string;
  durationMs: number;
  visits: number;
  lastSeenAt: number;
  tag: string;
  note: string;
  snapshot?: Snapshot;
}
export interface DomainSummary { hostname: string; durationMs: number; pages: number }
export interface TimeBucket { startedAt: number; endedAt: number; durationMs: number }
export interface AnalyticsResult {
  from: number;
  to: number;
  totalMs: number;
  pages: PageSummary[];
  domains: DomainSummary[];
  timeline: TimeBucket[];
  snapshotCount: number;
}
export interface WorkspaceData {
  activities: Activity[];
  snapshots: Snapshot[];
  annotations: PageAnnotation[];
}
