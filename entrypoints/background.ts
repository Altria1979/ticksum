import { defineBackground } from 'wxt/utils/define-background';
import { clearAllData, db, pruneData, saveSnapshot } from '../src/data/db';
import { MAX_CONTENT_LENGTH, MAX_TITLE_LENGTH, countWords, hashContent } from '../src/extraction/extract';
import { getSettings, SETTINGS_KEY } from '../src/platform/settings';
import type { ExtensionMessage, ExtensionResponse } from '../src/shared/messages';
import { hasTrackingConsent, type Activity, type Settings, type Snapshot } from '../src/shared/types';
import { advanceTracker, initialTrackingState, type TrackingObservation, type TrackingState, type TrackingTransition } from '../src/tracking/engine';
import { getPageIdentity, hostPermissionPattern, isExcludedHost } from '../src/tracking/url';

const STATE_KEY = 'trackingState';
const JOURNAL_KEY = 'trackingJournal';
const ERROR_KEY = 'trackingError';
const CAPTURE_SCRIPT_ID = 'ticksum-capture';
const CHECKPOINT_ALARM = 'ticksum-checkpoint';
const PRUNE_ALARM = 'ticksum-prune';

interface Journal { state: TrackingState; activity?: Activity; clear?: boolean }

export default defineBackground(() => {
  let state = initialTrackingState();
  let lastError: string | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  function noteError(error: unknown) {
    lastError = error instanceof Error ? error.message : String(error);
    void chrome.storage.session.set({ [ERROR_KEY]: lastError }).catch(() => undefined);
  }

  function serial<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    queue = result.catch(noteError);
    return result;
  }

  async function applyJournal(journal: Journal) {
    if (journal.clear) await clearAllData();
    if (journal.activity) await db.activities.put(journal.activity);
    await chrome.storage.session.set({ [STATE_KEY]: journal.state, [JOURNAL_KEY]: null });
    state = journal.state;
  }

  async function commit(transition: TrackingTransition | Journal) {
    // Persist the intended operation first. A suspended worker can replay it safely.
    await chrome.storage.session.set({ [JOURNAL_KEY]: transition });
    await applyJournal(transition);
  }

  async function observe(settings: Settings, overrides: Partial<Pick<TrackingObservation, 'idle' | 'focused'>> = {}): Promise<TrackingObservation> {
    const [window, idleState] = await Promise.all([
      chrome.windows.getLastFocused().catch(() => undefined), chrome.idle.queryState(settings.idleSeconds),
    ]);
    const tabs = window?.id === undefined ? [] : await chrome.tabs.query({ active: true, windowId: window.id });
    const tab = tabs[0];
    return {
      now: Date.now(), settings, focused: !!window?.focused && window.type === 'normal', idle: idleState !== 'active',
      tab: tab?.id === undefined ? undefined : { id: tab.id, title: tab.title, url: tab.url, incognito: tab.incognito },
      ...overrides,
    };
  }

  async function reconcile(overrides: Partial<Pick<TrackingObservation, 'idle' | 'focused'>> = {}) {
    const settings = await getSettings();
    if (!hasTrackingConsent(settings)) {
      await commit({ state: { status: { tracking: false, reason: 'paused' } } });
      return;
    }
    const previousSegmentId = state.active?.activity.id;
    await commit(advanceTracker(state, await observe(settings, overrides), () => crypto.randomUUID()));
    if (lastError) {
      await chrome.storage.session.remove(ERROR_KEY);
      lastError = undefined;
    }
    if (state.active && state.active.activity.id !== previousSegmentId) {
      // A visible, static page may have been denied while Chrome was unfocused or
      // idle. Wake its existing script when activity resumes; checkpoints do not
      // reinject scripts or trigger this notification again.
      void chrome.tabs.sendMessage(state.active.tabId, { type: 'TICKSUM_CAPTURE_RUN' }).catch(() => undefined);
    }
  }

  const trustedUi = (sender: chrome.runtime.MessageSender) => sender.id === chrome.runtime.id
    && !!sender.url?.startsWith(chrome.runtime.getURL(''))
    && (sender.frameId === undefined || sender.frameId === 0);

  async function captureTab(sender: chrome.runtime.MessageSender): Promise<chrome.tabs.Tab | null> {
    if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || sender.tab?.id === undefined || !sender.url
      || !sender.documentId || (sender.documentLifecycle && sender.documentLifecycle !== 'active')) return null;
    const tab = await chrome.tabs.get(sender.tab.id);
    const page = getPageIdentity(tab.url);
    const senderPage = getPageIdentity(sender.url);
    const settings = await getSettings();
    // Chrome keeps sender.url at the original document URL after pushState.
    // Origin stays useful, but documentId plus an isolated-world probe below
    // establishes the live document and its current route without trusting payloads.
    if (!page || !senderPage || new URL(page.url).origin !== new URL(senderPage.url).origin || tab.incognito || !tab.active
      || !settings.trackingEnabled || isExcludedHost(page.hostname, settings.excludedHosts)) return null;
    const [window, idleState, allowed] = await Promise.all([
      chrome.windows.get(tab.windowId), chrome.idle.queryState(settings.idleSeconds),
      chrome.permissions.contains({ origins: [hostPermissionPattern(page.url)] }),
    ]);
    if (!window.focused || window.type !== 'normal' || idleState !== 'active' || !allowed) return null;
    const frames = await chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, documentIds: [sender.documentId] },
      func: () => ({ url: location.href, visible: document.visibilityState === 'visible' }),
    }).catch(() => []);
    const currentDocument = frames.some((frame) => frame.frameId === 0 && frame.documentId === sender.documentId
      && frame.result?.visible && getPageIdentity(frame.result.url)?.pageKey === page.pageKey);
    return currentDocument ? tab : null;
  }

  async function receiveSnapshot(input: unknown, sender: chrome.runtime.MessageSender): Promise<ExtensionResponse> {
    const tab = await captureTab(sender);
    if (!tab?.url) return { ok: false, error: '当前页面未获正文授权、未在前台，或采集已暂停。' };
    if (!input || typeof input !== 'object') return { ok: false, error: '正文格式无效。' };
    const raw = input as Partial<Snapshot>;
    const page = getPageIdentity(tab.url)!;
    if (getPageIdentity(raw.url)?.pageKey !== page.pageKey || typeof raw.text !== 'string'
      || raw.text.length < 40 || raw.text.length > MAX_CONTENT_LENGTH
      || !['readability', 'adapter', 'fallback'].includes(raw.method ?? '')
      || !['partial', 'unknown'].includes(raw.coverage ?? '')
      || !Array.isArray(raw.headings) || raw.headings.length > 40
      || raw.headings.some((item) => typeof item !== 'string' || item.length > 200)) {
      return { ok: false, error: '正文大小或提取字段无效。' };
    }
    const snapshot: Snapshot = {
      id: crypto.randomUUID(), ...page, title: (tab.title || page.hostname).slice(0, MAX_TITLE_LENGTH),
      capturedAt: Date.now(), text: raw.text, contentHash: await hashContent(raw.text),
      excerpt: raw.text.slice(0, 280), headings: raw.headings,
      method: raw.method as Snapshot['method'], coverage: raw.coverage as Snapshot['coverage'], wordCount: countWords(raw.text),
    };
    // Recheck after hashing, including permission removal and navigation races.
    const current = await captureTab(sender);
    if (!current || getPageIdentity(current.url)?.pageKey !== page.pageKey) return { ok: false, error: '页面或授权已变化。' };
    await saveSnapshot(snapshot);
    return { ok: true };
  }

  async function syncCapturePermissions() {
    const [permissions, settings, registered, tabs] = await Promise.all([
      chrome.permissions.getAll(), getSettings(), chrome.scripting.getRegisteredContentScripts({ ids: [CAPTURE_SCRIPT_ID] }), chrome.tabs.query({}),
    ]);
    const origins = (permissions.origins ?? []).filter((origin) => /^https?:\/\//.test(origin) || origin.startsWith('*://'));
    if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [CAPTURE_SCRIPT_ID] });
    if (settings.trackingEnabled && origins.length) {
      await chrome.scripting.registerContentScripts([{
        id: CAPTURE_SCRIPT_ID, js: ['content-scripts/capture.js'], matches: origins,
        allFrames: false, runAt: 'document_idle', persistAcrossSessions: true,
      }]);
    }
    await Promise.all(tabs.map(async (tab) => {
      if (tab.id === undefined) return;
      const page = getPageIdentity(tab.url);
      const allowed = page && !tab.incognito && settings.trackingEnabled
        && !isExcludedHost(page.hostname, settings.excludedHosts)
        && await chrome.permissions.contains({ origins: [hostPermissionPattern(page.url)] });
      if (!allowed) {
        await chrome.tabs.sendMessage(tab.id, { type: 'TICKSUM_CAPTURE_STOP' }).catch(() => undefined);
        return;
      }
      // executeScript handles already-open pages; the script tears down any old instance.
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-scripts/capture.js'] }).catch(() => undefined);
    }));
  }

  async function handleMessage(message: ExtensionMessage, sender: chrome.runtime.MessageSender): Promise<ExtensionResponse> {
    if (message.type === 'SAVE_SNAPSHOT') return receiveSnapshot(message.snapshot, sender);
    if (!trustedUi(sender)) return { ok: false, error: '只允许 TickSum 扩展页面执行此操作。' };
    switch (message.type) {
      case 'GET_STATUS':
        try { await reconcile(); } catch (error) { noteError(error); }
        return { ok: true, status: { ...state.status, lastError } };
      case 'REFRESH_TRACKING':
        await reconcile();
        return { ok: true, status: { ...state.status, lastError } };
      case 'SYNC_CAPTURE_PERMISSIONS':
        await syncCapturePermissions();
        return { ok: true };
      case 'CAPTURE_NOW': {
        await reconcile();
        if (!state.active) return { ok: false, error: '请切回已授权的网页，TickSum 会自动提取正文。' };
        await chrome.tabs.sendMessage(state.active.tabId, { type: 'TICKSUM_CAPTURE_RUN' });
        return { ok: true };
      }
      case 'CLEAR_DATA':
        await commit({ clear: true, state: initialTrackingState() });
        await Promise.all((await chrome.tabs.query({})).map((tab) => tab.id === undefined ? undefined
          : chrome.tabs.sendMessage(tab.id, { type: 'TICKSUM_CAPTURE_RESET' }).catch(() => undefined)));
        await reconcile();
        return { ok: true };
      default:
        return { ok: false, error: '不支持的操作。' };
    }
  }

  // Register listeners synchronously so events can wake a suspended MV3 worker.
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return false;
    if (message.type === 'TICKSUM_CAPTURE_CHECK') {
      void serial(async () => ({ ok: true, allowed: !!await captureTab(sender) }))
        .then(sendResponse, () => sendResponse({ ok: false, allowed: false }));
    } else {
      void serial(() => handleMessage(message as ExtensionMessage, sender))
        .then(sendResponse, (error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    }
    return true;
  });
  const track = () => { void serial(() => reconcile()).catch(() => undefined); };
  chrome.tabs.onActivated.addListener(track);
  chrome.tabs.onUpdated.addListener((_id, change, tab) => {
    if (tab.active && (change.url || change.title || change.status === 'complete')) track();
  });
  chrome.tabs.onRemoved.addListener(track);
  chrome.windows.onFocusChanged.addListener((id) => {
    void serial(() => reconcile(id === chrome.windows.WINDOW_ID_NONE ? { focused: false } : {})).catch(() => undefined);
  });
  chrome.windows.onRemoved.addListener(track);
  chrome.idle.onStateChanged.addListener((idle) => {
    void serial(() => reconcile({ idle: idle !== 'active' })).catch(() => undefined);
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CHECKPOINT_ALARM) track();
    if (alarm.name === PRUNE_ALARM) void serial(async () => pruneData((await getSettings()).retentionDays)).catch(() => undefined);
  });
  const syncPermissions = () => { void serial(syncCapturePermissions).catch(() => undefined); };
  chrome.permissions.onAdded.addListener(syncPermissions);
  chrome.permissions.onRemoved.addListener(syncPermissions);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && SETTINGS_KEY in changes) {
      void serial(async () => {
        const settings = await getSettings();
        chrome.idle.setDetectionInterval(settings.idleSeconds);
        await reconcile();
        await syncCapturePermissions();
        await pruneData(settings.retentionDays);
      }).catch(() => undefined);
    }
  });
  chrome.action.onClicked.addListener(() => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') });
  });
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') });
    }
  });

  void serial(async () => {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    const settings = await getSettings();
    const stored = await chrome.storage.session.get([STATE_KEY, JOURNAL_KEY, ERROR_KEY]);
    state = hasTrackingConsent(settings) ? (stored[STATE_KEY] as TrackingState | undefined) ?? initialTrackingState() : initialTrackingState();
    lastError = typeof stored[ERROR_KEY] === 'string' ? stored[ERROR_KEY] : undefined;
    if (hasTrackingConsent(settings) && stored[JOURNAL_KEY]) await applyJournal(stored[JOURNAL_KEY] as Journal);
    chrome.idle.setDetectionInterval(settings.idleSeconds);
    await chrome.alarms.create(CHECKPOINT_ALARM, { periodInMinutes: 0.5 });
    await chrome.alarms.create(PRUNE_ALARM, { periodInMinutes: 60 });
    await reconcile();
    await syncCapturePermissions();
    await pruneData(settings.retentionDays);
  }).catch(() => undefined);
});
