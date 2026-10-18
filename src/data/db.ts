import Dexie, { type Table } from 'dexie';
import type { Activity, PageAnnotation, SavedReport, Snapshot, WorkspaceData } from '../shared/types';

interface StoredSnapshot extends Snapshot { observationTimes?: number[] }

class TickSumDatabase extends Dexie {
  activities!: Table<Activity, string>;
  snapshots!: Table<StoredSnapshot, string>;
  annotations!: Table<PageAnnotation, string>;
  reports!: Table<SavedReport, string>;

  constructor() {
    super('ticksum');
    this.version(1).stores({
      activities: 'id, pageKey, startedAt, endedAt, hostname',
      snapshots: 'id, pageKey, capturedAt, [pageKey+capturedAt], &[pageKey+contentHash]',
      annotations: 'pageKey, tag',
      reports: 'id, createdAt, updatedAt',
    });
  }
}

// Only extension pages and the background import this database. Content scripts
// send snapshots to the background so the host page never owns our storage.
export const db = new TickSumDatabase();

export async function loadWorkspace(from: number, to: number): Promise<WorkspaceData> {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return { activities: [], snapshots: [], annotations: [] };
  }

  return db.transaction('r', db.activities, db.snapshots, db.annotations, async () => {
    const activities = await db.activities.where('endedAt').above(from)
      .filter(activity => activity.startedAt < to && activity.endedAt > activity.startedAt)
      .toArray();
    const pageKeys = [...new Set(activities.map(activity => activity.pageKey))];
    const snapshots = await Promise.all(pageKeys.map(async pageKey => {
      const versions = await db.snapshots.where('[pageKey+capturedAt]')
        .between([pageKey, Dexie.minKey], [pageKey, to], true, true).toArray();
      let latest: Snapshot | undefined;
      for (const version of versions) {
        const { observationTimes, ...snapshot } = version;
        const observedAt = (observationTimes ?? [version.capturedAt])
          .filter(timestamp => timestamp <= to).at(-1);
        if (observedAt === undefined || (latest && (latest.capturedAt > observedAt
          || (latest.capturedAt === observedAt && latest.id > snapshot.id)))) continue;
        latest = { ...snapshot, capturedAt: observedAt };
      }
      return latest;
    }));
    const annotations = await db.annotations.bulkGet(pageKeys);
    return {
      activities,
      snapshots: snapshots.filter((snapshot): snapshot is Snapshot => snapshot !== undefined),
      annotations: annotations.filter((annotation): annotation is PageAnnotation => annotation !== undefined),
    };
  });
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  if (!Number.isFinite(snapshot.capturedAt) || !snapshot.pageKey || !snapshot.contentHash) {
    throw new Error('页面快照缺少有效的时间、页面标识或内容指纹。');
  }

  await db.transaction('rw', db.snapshots, async () => {
    const existing = await db.snapshots.where('[pageKey+contentHash]')
      .equals([snapshot.pageKey, snapshot.contentHash]).first();
    if (existing) {
      // Keep one body per content hash, but retain its observation times. This
      // preserves A → B → A history even when captures arrive out of order.
      const observationTimes = [...new Set([
        ...(existing.observationTimes ?? [existing.capturedAt]), snapshot.capturedAt,
      ])].sort((a, b) => a - b);
      await db.snapshots.update(existing.id, { capturedAt: observationTimes[0]!, observationTimes });
    } else {
      await db.snapshots.add({ ...snapshot, observationTimes: [snapshot.capturedAt] });
    }
  });
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.activities, db.snapshots, db.annotations, db.reports, async () => {
    await Promise.all([
      db.activities.clear(), db.snapshots.clear(), db.annotations.clear(), db.reports.clear(),
    ]);
  });
}

export async function pruneData(retentionDays: number, now = Date.now()): Promise<void> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0 || !Number.isFinite(now)) {
    throw new Error('数据保留天数和当前时间必须有效。');
  }
  const cutoff = now - retentionDays * 86_400_000;
  await db.transaction('rw', db.activities, db.snapshots, async () => {
    await db.activities.where('endedAt').belowOrEqual(cutoff).delete();
    await db.activities.where('startedAt').below(cutoff).modify({ startedAt: cutoff });
    const oldVersions = await db.snapshots.where('capturedAt').below(cutoff).toArray();
    for (const version of oldVersions) {
      const observationTimes = (version.observationTimes ?? [version.capturedAt]).filter(time => time >= cutoff);
      if (observationTimes.length === 0) await db.snapshots.delete(version.id);
      else await db.snapshots.update(version.id, { capturedAt: observationTimes[0]!, observationTimes });
    }
  });
  // User-authored annotations and saved Markdown reports have an independent
  // lifetime. Only explicit deletion / clearAllData removes them.
}
