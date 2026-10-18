export type CaptureControl = { type: 'TICKSUM_CAPTURE_STOP' | 'TICKSUM_CAPTURE_RUN' | 'TICKSUM_CAPTURE_RESET' };
export type CaptureCheck = { type: 'TICKSUM_CAPTURE_CHECK' };
export type CaptureAvailability = { ok: boolean; allowed: boolean };
