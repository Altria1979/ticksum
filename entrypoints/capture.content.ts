import { defineContentScript } from 'wxt/utils/define-content-script';
import { captureFingerprint, extractSnapshot, pageChanged, SNAPSHOT_REFRESH_MS } from '../src/extraction/extract';
import type { CaptureAvailability, CaptureControl } from '../src/extraction/protocol';
import type { ExtensionResponse } from '../src/shared/messages';

export default defineContentScript({
  registration: 'runtime',
  // WXT promotes runtime `matches` to required host permissions. The background
  // supplies matches only after a user grants optional site access.
  runAt: 'document_idle',
  allFrames: false,
  main(ctx) {
    const scope = globalThis as typeof globalThis & { __ticksumStopCapture?: () => void };
    scope.__ticksumStopCapture?.();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let rerun = false;
    let scheduledAt = 0;
    let previousUrl = location.href;
    let lastFingerprint = '';
    let lastSavedAt = 0;
    let captureGeneration = 0;

    const capture = async () => {
      if (stopped || ctx.isInvalid || document.visibilityState !== 'visible') return;
      if (running) { rerun = true; return; }
      running = true;
      try {
        const check = await chrome.runtime.sendMessage({ type: 'TICKSUM_CAPTURE_CHECK' }) as CaptureAvailability;
        if (!check?.allowed || stopped || document.visibilityState !== 'visible') return;
        const sourceUrl = location.href;
        const generation = captureGeneration;
        const snapshot = await extractSnapshot(document, sourceUrl);
        if (!snapshot || stopped || sourceUrl !== location.href || document.visibilityState !== 'visible') return;
        const fingerprint = captureFingerprint(snapshot);
        if (fingerprint === lastFingerprint && Date.now() - lastSavedAt < SNAPSHOT_REFRESH_MS) return;
        const result = await chrome.runtime.sendMessage({ type: 'SAVE_SNAPSHOT', snapshot }) as ExtensionResponse;
        if (result?.ok && generation === captureGeneration) { lastFingerprint = fingerprint; lastSavedAt = Date.now(); }
      } catch {
        if (ctx.isInvalid || !chrome.runtime?.id) stop();
      } finally {
        running = false;
        if (rerun) { rerun = false; schedule(); }
      }
    };

    function schedule() {
      if (stopped || document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      if (!scheduledAt) scheduledAt = Date.now();
      const delay = Math.max(0, Math.min(1200, 5000 - (Date.now() - scheduledAt)));
      timer = setTimeout(() => { timer = undefined; scheduledAt = 0; void capture(); }, delay);
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    const onVisibility = () => {
      if (document.visibilityState === 'visible') schedule();
      else if (timer) { clearTimeout(timer); timer = undefined; scheduledAt = 0; }
    };
    const onNavigation = () => {
      if (pageChanged(previousUrl, location.href)) {
        previousUrl = location.href;
        lastFingerprint = '';
        captureGeneration += 1;
        schedule();
      }
    };
    // pushState does not fire popstate; a low-frequency URL check covers SPA routes
    // without injecting code into the page's own JavaScript world.
    const navigationTimer = setInterval(onNavigation, 1500);
    // Re-observe at most hourly so retention pruning never makes a stable page's
    // in-memory fingerprint suppress its contents for the lifetime of the tab.
    const refreshTimer = setInterval(schedule, SNAPSHOT_REFRESH_MS);
    const onMessage = (message: CaptureControl, sender: chrome.runtime.MessageSender) => {
      if (sender.id !== chrome.runtime.id || sender.tab) return;
      if (message?.type === 'TICKSUM_CAPTURE_STOP') stop();
      if (message?.type === 'TICKSUM_CAPTURE_RUN') schedule();
      if (message?.type === 'TICKSUM_CAPTURE_RESET') {
        lastFingerprint = '';
        lastSavedAt = 0;
        captureGeneration += 1;
        schedule();
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('popstate', onNavigation);
    window.addEventListener('hashchange', onNavigation);

    function stop() {
      if (stopped) return;
      stopped = true;
      observer.disconnect();
      if (timer) clearTimeout(timer);
      clearInterval(navigationTimer);
      clearInterval(refreshTimer);
      chrome.runtime.onMessage.removeListener(onMessage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('popstate', onNavigation);
      window.removeEventListener('hashchange', onNavigation);
      if (scope.__ticksumStopCapture === stop) delete scope.__ticksumStopCapture;
    }
    scope.__ticksumStopCapture = stop;
    ctx.onInvalidated(stop);
    schedule();
  },
});
