import { describe, expect, it } from 'vitest';
import { validateSettings } from '../src/platform/settings';
import { DEFAULT_SETTINGS, TRACKING_DISCLOSURE_VERSION } from '../src/shared/types';

describe('first-use tracking consent', () => {
  it('requires acknowledgement for fresh and existing enabled installations', () => {
    expect(validateSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings({ trackingEnabled: true }).trackingEnabled).toBe(false);
  });

  it.each([
    null,
    { version: TRACKING_DISCLOSURE_VERSION + 1, acceptedAt: 1000 },
    { version: TRACKING_DISCLOSURE_VERSION, acceptedAt: 0 },
    { version: TRACKING_DISCLOSURE_VERSION, acceptedAt: NaN },
    { version: TRACKING_DISCLOSURE_VERSION, acceptedAt: Infinity },
  ])('ignores missing or invalid consent %j', (trackingConsent) => {
    expect(validateSettings({ trackingEnabled: true, trackingConsent })).toMatchObject({
      trackingEnabled: false, trackingConsent: null,
    });
  });

  it('retains acknowledgement independently from the pause switch', () => {
    const trackingConsent = { version: TRACKING_DISCLOSURE_VERSION, acceptedAt: 1000 };
    expect(validateSettings({ trackingEnabled: true, trackingConsent }).trackingEnabled).toBe(true);
    expect(validateSettings({ trackingEnabled: false, trackingConsent })).toMatchObject({
      trackingEnabled: false, trackingConsent,
    });
  });
});
