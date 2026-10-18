import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity, Snapshot, TrackerStatus } from '../src/shared/types';

const database = vi.hoisted(() => ({
  activities: new Map<string, Activity>(), snapshots: [] as Snapshot[],
  put: vi.fn(async (_activity: Activity) => undefined),
  clear: vi.fn(async () => undefined), prune: vi.fn(async () => undefined),
  save: vi.fn(async (_snapshot: Snapshot) => undefined),
}));
vi.mock('wxt/utils/define-background', () => ({ defineBackground: (fn: () => void) => ({ main: fn }) }));
vi.mock('../src/data/db', () => ({
  db: { activities: { put: database.put } }, clearAllData: database.clear,
  pruneData: database.prune, saveSnapshot: database.save,
}));
import background from '../entrypoints/background';

function event<T extends (...args: never[]) => unknown>() {
  const listeners: T[] = [];
  return { addListener: (listener: T) => listeners.push(listener), listeners };
}

type Listener = (message: unknown, sender: chrome.runtime.MessageSender, respond: (response: unknown) => void) => boolean;

function fakeChrome(session: Record<string, unknown> = {}) {
  const local: Record<string, unknown> = {};
  const area = (values: Record<string, unknown>) => ({
    get: vi.fn(async () => ({ ...values })),
    set: vi.fn(async (changes: Record<string, unknown>) => { Object.assign(values, changes); }),
    remove: vi.fn(async (key: string) => { delete values[key]; }),
    setAccessLevel: vi.fn(async () => undefined),
  });
  const tab: chrome.tabs.Tab = {
    id: 1, index: 0, windowId: 1, active: true, highlighted: true, pinned: false, incognito: false,
    selected: true, discarded: false, frozen: false, autoDiscardable: true, groupId: -1, url: 'https://example.com/guide', title: 'Real title',
  };
  const messages = event<Listener>();
  return {
    session, tab, messages,
    api: {
      runtime: { id: 'test', getURL: (path: string) => `chrome-extension://test/${path.replace(/^\//, '')}`, onMessage: messages },
      storage: { local: area(local), session: area(session), onChanged: event() },
      windows: { WINDOW_ID_NONE: -1, getLastFocused: vi.fn(async () => ({ id: 1, focused: true, type: 'normal' })), get: vi.fn(async () => ({ focused: true, type: 'normal' })), onFocusChanged: event(), onRemoved: event() },
      tabs: { query: vi.fn(async () => [tab]), get: vi.fn(async () => tab), sendMessage: vi.fn(async (_id: number, _message: { type: string }) => undefined), create: vi.fn(async () => undefined), onActivated: event(), onUpdated: event(), onRemoved: event() },
      idle: { queryState: vi.fn(async () => 'active'), setDetectionInterval: vi.fn(), onStateChanged: event() },
      alarms: { create: vi.fn(async () => undefined), onAlarm: event() },
      permissions: { getAll: vi.fn(async () => ({ origins: [] as string[] })), contains: vi.fn(async () => false), onAdded: event(), onRemoved: event() },
      scripting: { getRegisteredContentScripts: vi.fn(async () => []), registerContentScripts: vi.fn(async () => undefined), unregisterContentScripts: vi.fn(async () => undefined), executeScript: vi.fn(async (injection: { target: { tabId: number; documentIds?: string[] }; files?: string[] }) => injection.target.documentIds ? [{ frameId: 0, documentId: 'document-1', result: { url: tab.url, visible: true } }] : []) },
      action: { onClicked: event() },
    },
  };
}

const uiSender = { id: 'test', url: 'chrome-extension://test/dashboard.html', frameId: 0 };
const contentSender = { id: 'test', url: 'https://example.com/guide', frameId: 0, documentId: 'document-1', tab: { id: 1 } } as chrome.runtime.MessageSender;
function send(fake: ReturnType<typeof fakeChrome>, message: unknown, sender: chrome.runtime.MessageSender = uiSender): Promise<{ ok: boolean; error?: string; status?: TrackerStatus }> {
  return new Promise((resolve) => fake.messages.listeners[0]!(message, sender, (response) => resolve(response as { ok: boolean; error?: string; status?: TrackerStatus })));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  vi.clearAllMocks();
  database.activities.clear();
  database.snapshots.length = 0;
  database.put.mockImplementation(async (activity) => { database.activities.set(activity.id, activity); });
  database.save.mockImplementation(async (snapshot) => { database.snapshots.push(snapshot); });
  database.clear.mockImplementation(async () => { database.activities.clear(); database.snapshots.length = 0; });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('background persistence and trust boundaries', () => {
  it('clears a transient tracker error once reconciliation succeeds again', async () => {
    const fake = fakeChrome();
    vi.stubGlobal('chrome', fake.api);
    background.main();
    await send(fake, { type: 'GET_STATUS' });
    vi.setSystemTime(20_000);
    database.put.mockRejectedValueOnce(new Error('temporary write failure'));
    expect((await send(fake, { type: 'GET_STATUS' })).status?.lastError).toBe('temporary write failure');
    expect(fake.session.trackingError).toBe('temporary write failure');
    expect((await send(fake, { type: 'GET_STATUS' })).status?.lastError).toBeUndefined();
    expect(fake.session.trackingError).toBeUndefined();
    await send(fake, { type: 'GET_STATUS' });
    expect(fake.api.storage.session.remove).toHaveBeenCalledExactlyOnceWith('trackingError');
  });

  it('restores a worker state and upserts the same activity without duplication', async () => {
    const first = fakeChrome();
    vi.stubGlobal('chrome', first.api);
    background.main();
    expect((await send(first, { type: 'GET_STATUS' })).ok).toBe(true);
    vi.setSystemTime(30_000);
    await send(first, { type: 'GET_STATUS' });
    expect(database.activities.size).toBe(1);
    const second = fakeChrome(first.session);
    vi.stubGlobal('chrome', second.api);
    vi.setSystemTime(40_000);
    background.main();
    await send(second, { type: 'GET_STATUS' });
    expect([...database.activities.values()]).toHaveLength(1);
    expect([...database.activities.values()][0]).toMatchObject({ startedAt: 10_000, endedAt: 40_000 });
  });

  it('replays an interrupted write journal and then resumes with no duplicate rows', async () => {
    const activity: Activity = { id: 'journal-visit', pageKey: 'https://example.com/guide', url: 'https://example.com/guide', hostname: 'example.com', title: 'Real title', startedAt: 1000, endedAt: 8000 };
    const fake = fakeChrome({ trackingJournal: { activity, state: { active: { activity, tabId: 1, checkpointAt: 8000 }, status: { tracking: true, reason: 'active' } } } });
    vi.stubGlobal('chrome', fake.api);
    background.main();
    await send(fake, { type: 'GET_STATUS' });
    expect(database.activities.size).toBe(1);
    expect(database.activities.get('journal-visit')?.endedAt).toBe(10_000);
    expect(fake.session.trackingJournal).toBeNull();
  });

  it('rejects management commands from a content script', async () => {
    const fake = fakeChrome();
    vi.stubGlobal('chrome', fake.api);
    background.main();
    const result = await send(fake, { type: 'CLEAR_DATA' }, contentSender);
    expect(result.ok).toBe(false);
    expect(database.clear).not.toHaveBeenCalled();
  });

  it('accepts own extension views with or without frame metadata but rejects nested or foreign frames', async () => {
    const fake = fakeChrome();
    vi.stubGlobal('chrome', fake.api);
    background.main();
    expect((await send(fake, { type: 'GET_STATUS' }, { ...uiSender, frameId: undefined })).ok).toBe(true);
    expect((await send(fake, { type: 'GET_STATUS' }, { ...uiSender, frameId: 1 })).ok).toBe(false);
    expect((await send(fake, { type: 'GET_STATUS' }, { ...uiSender, url: 'https://example.com' })).ok).toBe(false);
    expect((await send(fake, { type: 'GET_STATUS' }, { ...uiSender, id: 'different-extension' })).ok).toBe(false);
  });

  it.each(['unfocused', 'idle'])('wakes existing content once after %s becomes active, without a capture-check loop', async (reason) => {
    const fake = fakeChrome();
    fake.api.permissions.contains.mockResolvedValue(true);
    if (reason === 'unfocused') fake.api.windows.getLastFocused.mockResolvedValue({ id: 1, focused: false, type: 'normal' });
    else fake.api.idle.queryState.mockResolvedValue('idle');
    vi.stubGlobal('chrome', fake.api);
    background.main();
    await send(fake, { type: 'GET_STATUS' });
    expect(fake.api.tabs.sendMessage.mock.calls.filter((call) => call[1]?.type === 'TICKSUM_CAPTURE_RUN')).toHaveLength(0);
    const injections = fake.api.scripting.executeScript.mock.calls.filter(([injection]) => injection.files).length;

    fake.api.windows.getLastFocused.mockResolvedValue({ id: 1, focused: true, type: 'normal' });
    fake.api.idle.queryState.mockResolvedValue('active');
    await send(fake, { type: 'REFRESH_TRACKING' });
    expect(fake.api.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'TICKSUM_CAPTURE_RUN' });
    const notifications = fake.api.tabs.sendMessage.mock.calls.length;
    await send(fake, { type: 'TICKSUM_CAPTURE_CHECK' }, contentSender);
    await send(fake, { type: 'GET_STATUS' });
    expect(fake.api.tabs.sendMessage).toHaveBeenCalledTimes(notifications);
    expect(fake.api.scripting.executeScript.mock.calls.filter(([injection]) => injection.files)).toHaveLength(injections);
  });

  it('resets existing content-script fingerprints after clearing data', async () => {
    const fake = fakeChrome();
    vi.stubGlobal('chrome', fake.api);
    background.main();
    expect((await send(fake, { type: 'CLEAR_DATA' })).ok).toBe(true);
    expect(database.clear).toHaveBeenCalledOnce();
    expect(fake.api.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'TICKSUM_CAPTURE_RESET' });
  });

  it('refuses unpermitted, background, and cross-document snapshot messages', async () => {
    const fake = fakeChrome();
    vi.stubGlobal('chrome', fake.api);
    background.main();
    const message = { type: 'SAVE_SNAPSHOT', snapshot: { url: contentSender.url, text: 'a'.repeat(80), headings: [], method: 'adapter', coverage: 'partial' } };
    expect((await send(fake, message, contentSender)).ok).toBe(false);
    fake.api.permissions.contains.mockResolvedValue(true);
    fake.tab.active = false;
    expect((await send(fake, message, contentSender)).ok).toBe(false);
    fake.tab.active = true;
    expect((await send(fake, message, { ...contentSender, documentId: 'stale-document' })).ok).toBe(false);
    expect(database.save).not.toHaveBeenCalled();
  });

  it('accepts a same-document SPA route even when Chrome retains the sender initial URL', async () => {
    const fake = fakeChrome();
    fake.api.permissions.contains.mockResolvedValue(true);
    fake.tab.url = 'https://example.com/guide/next';
    fake.tab.title = 'Next article';
    vi.stubGlobal('chrome', fake.api);
    background.main();
    const result = await send(fake, { type: 'SAVE_SNAPSHOT', snapshot: {
      url: fake.tab.url, text: 'SPA article content. '.repeat(10), headings: [], method: 'adapter', coverage: 'partial',
    } }, contentSender);
    expect(result.ok).toBe(true);
    expect(database.snapshots[0]).toMatchObject({ pageKey: fake.tab.url, url: fake.tab.url, title: 'Next article' });
    expect(fake.api.scripting.executeScript.mock.calls.some(([injection]) => injection.target.documentIds?.[0] === contentSender.documentId)).toBe(true);
  });

  it.each(['wrong-origin', 'stale-route', 'inactive-document', 'missing-document'])('rejects %s despite a permitted tab', async (scenario) => {
    const fake = fakeChrome();
    fake.api.permissions.contains.mockResolvedValue(true);
    vi.stubGlobal('chrome', fake.api);
    background.main();
    const sender: chrome.runtime.MessageSender = { ...contentSender };
    const url = scenario === 'stale-route' ? 'https://example.com/old-route' : fake.tab.url;
    if (scenario === 'wrong-origin') sender.url = 'https://another.test/guide';
    if (scenario === 'inactive-document') sender.documentLifecycle = 'cached';
    if (scenario === 'missing-document') sender.documentId = undefined;
    const result = await send(fake, { type: 'SAVE_SNAPSHOT', snapshot: {
      url, text: 'Article content. '.repeat(10), headings: [], method: 'adapter', coverage: 'partial',
    } }, sender);
    expect(result.ok).toBe(false);
    expect(database.save).not.toHaveBeenCalled();
  });

  it('rebuilds snapshot identity, timestamp, title, and hash from trusted state', async () => {
    const fake = fakeChrome();
    fake.api.permissions.contains.mockResolvedValue(true);
    vi.stubGlobal('chrome', fake.api);
    background.main();
    const result = await send(fake, { type: 'SAVE_SNAPSHOT', snapshot: {
      id: 'forged-id', pageKey: 'forged-key', hostname: 'forged.test', contentHash: 'forged-hash',
      title: 'forged-title', capturedAt: 1, url: contentSender.url,
      text: 'a'.repeat(80), headings: [], method: 'adapter', coverage: 'partial',
    } }, contentSender);
    expect(result.ok).toBe(true);
    expect(database.snapshots[0]).toMatchObject({ pageKey: 'https://example.com/guide', hostname: 'example.com', capturedAt: 10_000, title: 'Real title' });
    expect(database.snapshots[0]?.id).not.toBe('forged-id');
    expect(database.snapshots[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
