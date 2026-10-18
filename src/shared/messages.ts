import type { Snapshot, TrackerStatus } from './types';

export type ExtensionMessage =
  | { type: 'GET_STATUS' }
  | { type: 'REFRESH_TRACKING' }
  | { type: 'SYNC_CAPTURE_PERMISSIONS' }
  | { type: 'CAPTURE_NOW' }
  | { type: 'CLEAR_DATA' }
  | { type: 'SAVE_SNAPSHOT'; snapshot: Snapshot };

export type ExtensionResponse = { ok: true; status?: TrackerStatus } | { ok: false; error: string };
