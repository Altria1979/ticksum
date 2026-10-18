import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/types';
import { advanceTracker, initialTrackingState, MAX_CHECKPOINT_GAP_MS, observationStatus, type TrackingObservation } from '../src/tracking/engine';
import { getPageIdentity, hostPermissionPattern, isExcludedHost, normalizeExcludedHost } from '../src/tracking/url';
import { validateSettings } from '../src/platform/settings';

const observation = (now: number, partial: Partial<TrackingObservation> = {}): TrackingObservation => ({
  now, focused: true, idle: false, settings: DEFAULT_SETTINGS,
  tab: { id: 1, url: 'https://example.com/guide', title: 'Guide' }, ...partial,
});

describe('foreground tracking transitions', () => {
  it('upserts one segment across repeated checkpoints and worker recovery', () => {
    const first = advanceTracker(initialTrackingState(), observation(1000), () => 'visit-a');
    expect(first.activity).toBeUndefined();
    const checkpoint = advanceTracker(first.state, observation(31_000), () => 'unused');
    expect(checkpoint.activity).toMatchObject({ id: 'visit-a', startedAt: 1000, endedAt: 31_000 });
    const restored = JSON.parse(JSON.stringify(checkpoint.state));
    const next = advanceTracker(restored, observation(51_000), () => 'unused');
    expect(next.activity).toMatchObject({ id: 'visit-a', startedAt: 1000, endedAt: 51_000 });
    const repeated = advanceTracker(next.state, observation(51_000), () => 'unused');
    expect(repeated.activity).toEqual(next.activity);
    const persisted = new Map([checkpoint.activity, next.activity, repeated.activity].map((item) => [item!.id, item!]));
    expect(persisted.size).toBe(1);
    expect(persisted.get('visit-a')!.endedAt - persisted.get('visit-a')!.startedAt).toBe(50_000);
  });

  it('closes the previous tab at a switch and starts exactly one new segment', () => {
    const first = advanceTracker(initialTrackingState(), observation(1000), () => 'a');
    const switched = advanceTracker(first.state, observation(11_000, { tab: { id: 2, url: 'https://other.test/' } }), () => 'b');
    expect(switched.activity).toMatchObject({ id: 'a', endedAt: 11_000 });
    expect(switched.state.active?.activity).toMatchObject({ id: 'b', startedAt: 11_000 });
  });

  it('splits SPA routes while preserving query and fragment identity', () => {
    const first = advanceTracker(initialTrackingState(), observation(1000), () => 'a');
    const next = advanceTracker(first.state, observation(10_000, { tab: { id: 1, url: 'https://example.com/guide#chapter-2' } }), () => 'b');
    expect(next.activity?.id).toBe('a');
    expect(next.state.active?.activity.pageKey).toBe('https://example.com/guide#chapter-2');
  });

  it.each([
    ['unfocused', { focused: false }],
    ['idle', { idle: true }],
    ['paused', { settings: { ...DEFAULT_SETTINGS, trackingEnabled: false } }],
    ['excluded', { settings: { ...DEFAULT_SETTINGS, excludedHosts: ['example.com'] } }],
    ['unsupported', { tab: { id: 1, url: 'chrome://settings/' } }],
    ['unsupported', { tab: { id: 1, url: 'https://example.com', incognito: true } }],
  ] as const)('stops active timing for %s', (reason, partial) => {
    const first = advanceTracker(initialTrackingState(), observation(1000), () => 'a');
    const stopped = advanceTracker(first.state, observation(11_000, partial as Partial<TrackingObservation>), () => 'b');
    expect(stopped.activity?.endedAt).toBe(11_000);
    expect(stopped.state.active).toBeUndefined();
    expect(stopped.state.status.reason).toBe(reason);
  });

  it('never backfills a suspended, sleeping, or otherwise unexplained long gap', () => {
    const first = advanceTracker(initialTrackingState(), observation(1000), () => 'a');
    const checkpoint = advanceTracker(first.state, observation(31_000), () => 'unused');
    const resumedAt = 31_000 + MAX_CHECKPOINT_GAP_MS + 1;
    const resumed = advanceTracker(checkpoint.state, observation(resumedAt), () => 'b');
    expect(resumed.activity).toBeUndefined();
    expect(resumed.state.active?.activity).toMatchObject({ id: 'b', startedAt: resumedAt, endedAt: resumedAt });
  });

  it('does not create negative duration when the system clock goes backwards', () => {
    const first = advanceTracker(initialTrackingState(), observation(10_000), () => 'a');
    const changedClock = advanceTracker(first.state, observation(5000), () => 'b');
    expect(changedClock.activity).toBeUndefined();
    expect(changedClock.state.active?.activity.startedAt).toBe(5000);
  });

  it('returns paused even when no valid tab exists', () => {
    expect(observationStatus(observation(1, { tab: undefined, settings: { ...DEFAULT_SETTINGS, trackingEnabled: false } })).reason).toBe('paused');
  });
});

describe('page identity and settings boundaries', () => {
  it('accepts only HTTP(S) and strips URL credentials without merging documents', () => {
    expect(getPageIdentity('https://user:secret@Example.com/a?q=1#part')?.pageKey).toBe('https://example.com/a?q=1#part');
    expect(getPageIdentity('file:///tmp/file.html')).toBeNull();
    expect(getPageIdentity('not a url')).toBeNull();
    expect(hostPermissionPattern('https://example.com:8080/a?q=1')).toBe('https://example.com/*');
  });
  it('matches exact excluded hosts and true subdomains only', () => {
    expect(normalizeExcludedHost('https://Example.com/path')).toBe('example.com');
    expect(isExcludedHost('docs.example.com', ['example.com'])).toBe(true);
    expect(isExcludedHost('example.com', ['example.com'])).toBe(true);
    expect(isExcludedHost('notexample.com', ['example.com'])).toBe(false);
    expect(isExcludedHost('example.com.attacker.test', ['example.com'])).toBe(false);
  });
  it('validates ranges and normalizes exclusion rules', () => {
    expect(() => validateSettings({ idleSeconds: 59 })).toThrow();
    expect(() => validateSettings({ retentionDays: 366 })).toThrow();
    expect(() => validateSettings({ idleSeconds: NaN })).toThrow();
    expect(validateSettings({ excludedHosts: ['Example.com', '*.example.com'] }).excludedHosts).toEqual(['example.com']);
  });
});
