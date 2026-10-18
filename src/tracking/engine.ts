import type { Activity, Settings, TrackerStatus } from '../shared/types';
import { getPageIdentity, isExcludedHost } from './url';

export const MAX_CHECKPOINT_GAP_MS = 60_000;

export interface TrackingTab {
  id: number;
  url?: string;
  title?: string;
  incognito?: boolean;
}
export interface TrackingObservation {
  now: number;
  focused: boolean;
  idle: boolean;
  settings: Settings;
  tab?: TrackingTab;
}
export interface ActiveSegment {
  activity: Activity;
  tabId: number;
  checkpointAt: number;
}
export interface TrackingState {
  active?: ActiveSegment;
  status: TrackerStatus;
}
export interface TrackingTransition {
  state: TrackingState;
  activity?: Activity;
}

export function initialTrackingState(): TrackingState {
  return { status: { tracking: false, reason: 'unsupported' } };
}

export function observationStatus(input: TrackingObservation): TrackerStatus {
  if (!input.settings.trackingEnabled) return { tracking: false, reason: 'paused' };
  if (input.idle) return { tracking: false, reason: 'idle' };
  if (!input.focused) return { tracking: false, reason: 'unfocused' };
  const page = getPageIdentity(input.tab?.url);
  if (!page || input.tab?.incognito) return { tracking: false, reason: 'unsupported' };
  if (isExcludedHost(page.hostname, input.settings.excludedHosts)) return { tracking: false, reason: 'excluded' };
  return { tracking: true, reason: 'active', activeTitle: input.tab?.title || page.hostname, activeUrl: page.url };
}

/** Pure transition. Activity updates keep the same ID, so journal replay is idempotent. */
export function advanceTracker(
  previous: TrackingState,
  input: TrackingObservation,
  newId: () => string,
): TrackingTransition {
  const status = observationStatus(input);
  const old = previous.active;
  const elapsed = old ? input.now - old.checkpointAt : 0;
  const continuous = !!old && elapsed >= 0 && elapsed <= MAX_CHECKPOINT_GAP_MS;
  const activity = continuous && input.now > old.activity.startedAt
    ? { ...old.activity, endedAt: Math.max(old.activity.endedAt, input.now) }
    : undefined;
  if (!status.tracking || !input.tab) return { state: { status }, activity };

  const page = getPageIdentity(input.tab.url)!;
  if (continuous && old.tabId === input.tab.id && old.activity.pageKey === page.pageKey) {
    const current = { ...(activity ?? old.activity), title: input.tab.title || page.hostname };
    return { state: { status, active: { ...old, activity: current, checkpointAt: input.now } }, activity: activity ? current : undefined };
  }

  return {
    state: {
      status,
      active: {
        activity: {
          id: newId(), ...page, title: input.tab.title || page.hostname,
          startedAt: input.now, endedAt: input.now,
        },
        tabId: input.tab.id,
        checkpointAt: input.now,
      },
    },
    activity,
  };
}
