// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://example.com/guide"}
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import capture from '../entrypoints/capture.content';
import { SNAPSHOT_REFRESH_MS } from '../src/extraction/extract';

vi.mock('wxt/utils/define-content-script', () => ({ defineContentScript: (definition: unknown) => definition }));

type ContentMessageListener = (message: { type: string }, sender: chrome.runtime.MessageSender) => void;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('crypto', webcrypto);
  document.body.innerHTML = '<main><h1>Static article</h1><p>' + 'A reference about automatic activity tracking and useful reports. '.repeat(10) + '</p></main>';
});
afterEach(() => {
  (globalThis as typeof globalThis & { __ticksumStopCapture?: () => void }).__ticksumStopCapture?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('content capture resume', () => {
  it('keeps all host matches out of the entrypoint so WXT cannot require site access', () => {
    expect(capture.registration).toBe('runtime');
    expect(capture.matches).toBeUndefined();
  });

  it('retries a previously denied static page when the background announces resumed activity', async () => {
    let allowed = false;
    const listeners: ContentMessageListener[] = [];
    let saved = false;
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === 'TICKSUM_CAPTURE_CHECK') return { ok: true, allowed };
      if (message.type === 'SAVE_SNAPSHOT') saved = true;
      return { ok: true };
    });
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test', sendMessage,
        onMessage: {
          addListener: (listener: ContentMessageListener) => listeners.push(listener),
          removeListener: (listener: ContentMessageListener) => { const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); },
        },
      },
    });
    const context = { isInvalid: false, onInvalidated: vi.fn() } as unknown as NonNullable<Parameters<typeof capture.main>[0]>;
    capture.main(context);
    await vi.advanceTimersByTimeAsync(1200);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(saved).toBe(false);

    allowed = true;
    listeners[0]!({ type: 'TICKSUM_CAPTURE_RUN' }, { id: 'test' });
    await vi.advanceTimersByTimeAsync(1200);
    // WebCrypto completes off the fake timer queue.
    await vi.waitFor(() => expect(saved).toBe(true));
    expect(sendMessage.mock.calls.filter(([message]) => message.type === 'SAVE_SNAPSHOT')).toHaveLength(1);
    const checks = sendMessage.mock.calls.filter(([message]) => message.type === 'TICKSUM_CAPTURE_CHECK').length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(sendMessage.mock.calls.filter(([message]) => message.type === 'TICKSUM_CAPTURE_CHECK')).toHaveLength(checks);
  });

  it('can re-save unchanged contents after data reset and after the observation expiry', async () => {
    const listeners: ContentMessageListener[] = [];
    let saves = 0;
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === 'TICKSUM_CAPTURE_CHECK') return { ok: true, allowed: true };
      if (message.type === 'SAVE_SNAPSHOT') saves += 1;
      return { ok: true };
    });
    vi.stubGlobal('chrome', { runtime: {
      id: 'test', sendMessage,
      onMessage: { addListener: (listener: ContentMessageListener) => listeners.push(listener), removeListener: vi.fn() },
    } });
    const context = { isInvalid: false, onInvalidated: vi.fn() } as unknown as NonNullable<Parameters<typeof capture.main>[0]>;
    capture.main(context);
    await vi.advanceTimersByTimeAsync(1200);
    await vi.waitFor(() => expect(saves).toBe(1));

    listeners[0]!({ type: 'TICKSUM_CAPTURE_RUN' }, { id: 'test' });
    await vi.advanceTimersByTimeAsync(1200);
    await vi.waitFor(() => expect(sendMessage.mock.calls.filter(([message]) => message.type === 'TICKSUM_CAPTURE_CHECK')).toHaveLength(2));
    expect(saves).toBe(1);

    listeners[0]!({ type: 'TICKSUM_CAPTURE_RESET' }, { id: 'test' });
    await vi.advanceTimersByTimeAsync(1200);
    await vi.waitFor(() => expect(saves).toBe(2));

    vi.setSystemTime(Date.now() + SNAPSHOT_REFRESH_MS);
    listeners[0]!({ type: 'TICKSUM_CAPTURE_RUN' }, { id: 'test' });
    await vi.advanceTimersByTimeAsync(1200);
    await vi.waitFor(() => expect(saves).toBe(3));
  });
});
