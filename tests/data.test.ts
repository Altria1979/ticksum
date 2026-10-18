import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, db, loadWorkspace, pruneData, saveSnapshot } from '../src/data/db';
import type { Activity, SavedReport, Snapshot } from '../src/shared/types';

const activity = (id: string, pageKey: string, startedAt: number, endedAt: number): Activity => ({
  id, pageKey, startedAt, endedAt, title: '文档', url: `https://example.com/${pageKey}`, hostname: 'example.com',
});
const snapshot = (id: string, contentHash: string, capturedAt: number, pageKey = 'a'): Snapshot => ({
  id, pageKey, contentHash, capturedAt, title: '文档', url: `https://example.com/${pageKey}`, hostname: 'example.com',
  text: contentHash, excerpt: contentHash, headings: [], method: 'readability', coverage: 'partial', wordCount: 1,
});
const report: SavedReport = {
  id: 'report', title: '报告', template: 'review', createdAt: 10, updatedAt: 10,
  from: 0, to: 100, pageKeys: ['a'], markdown: '# 保存的报告及摘录',
};

beforeEach(async () => { await clearAllData(); });
afterAll(async () => { await db.delete(); });

describe('snapshot persistence', () => {
  it('deduplicates identical content while preserving observations, versions and page identity', async () => {
    await saveSnapshot(snapshot('a1', 'A', 10));
    await saveSnapshot(snapshot('a2', 'A', 20));
    await saveSnapshot(snapshot('b1', 'B', 30));
    await saveSnapshot(snapshot('a3', 'A', 40));
    await saveSnapshot(snapshot('other-page', 'A', 20, 'b'));
    expect((await db.snapshots.orderBy('capturedAt').toArray()).map(item => item.id))
      .toEqual(['a1', 'other-page', 'b1']);
    await db.activities.add(activity('1', 'a', 0, 100));
    expect((await loadWorkspace(0, 35)).snapshots[0]).toMatchObject({ contentHash: 'B', capturedAt: 30 });
    expect((await loadWorkspace(0, 45)).snapshots[0]).toMatchObject({ contentHash: 'A', capturedAt: 40 });
  });

  it('deduplicates concurrent writes inside transactions', async () => {
    await Promise.all(Array.from({ length: 8 }, (_, index) => saveSnapshot(snapshot(`same-${index}`, 'A', 10 + index))));
    expect(await db.snapshots.count()).toBe(1);
  });

  it('keeps the earlier observation on out-of-order delivery without leaking a later version into history', async () => {
    await saveSnapshot(snapshot('later', 'A', 30));
    await saveSnapshot(snapshot('earlier', 'A', 10));
    await saveSnapshot(snapshot('middle', 'B', 20));
    await saveSnapshot(snapshot('again', 'A', 40));
    expect((await db.snapshots.orderBy('capturedAt').toArray()).map(item => item.id))
      .toEqual(['later', 'middle']);
    await db.activities.add(activity('1', 'a', 0, 100));
    expect((await loadWorkspace(0, 25)).snapshots[0]?.id).toBe('middle');
    expect((await loadWorkspace(0, 15)).snapshots[0]).toMatchObject({ contentHash: 'A', capturedAt: 10 });
    expect((await loadWorkspace(0, 35)).snapshots[0]).toMatchObject({ contentHash: 'A', capturedAt: 30 });
  });

  it('rejects invalid snapshot metadata without partially writing', async () => {
    await expect(saveSnapshot(snapshot('bad', 'A', NaN))).rejects.toThrow();
    expect(await db.snapshots.count()).toBe(0);
  });
});

describe('workspace queries and retention', () => {
  it('loads only overlapping activity and associated snapshots that existed by the range end', async () => {
    await db.activities.bulkAdd([
      activity('before', 'a', 0, 10), activity('inside', 'b', 5, 25), activity('after', 'c', 20, 30),
    ]);
    await db.snapshots.bulkAdd([
      snapshot('old', 'A', 1, 'b'), snapshot('latest', 'B', 18, 'b'), snapshot('future', 'C', 21, 'b'),
      snapshot('unvisited', 'A', 15, 'x'),
    ]);
    await db.annotations.bulkAdd([{ pageKey: 'b', tag: '学习', note: '保留' }, { pageKey: 'x', tag: '其他', note: '' }]);
    const workspace = await loadWorkspace(10, 20);
    expect(workspace.activities.map(item => item.id)).toEqual(['inside']);
    expect(workspace.snapshots.map(item => item.id)).toEqual(['latest']);
    expect(workspace.annotations.map(item => item.pageKey)).toEqual(['b']);
    expect(await loadWorkspace(20, 10)).toEqual({ activities: [], snapshots: [], annotations: [] });
  });

  it('prunes expired activity and content, clips crossing sessions, and keeps saved reports and notes', async () => {
    const day = 86_400_000;
    await db.activities.bulkAdd([
      activity('old', 'a', 0, day), activity('crossing', 'b', day - 100, day + 100), activity('new', 'c', day + 100, day + 200),
    ]);
    await db.snapshots.bulkAdd([snapshot('old', 'A', day - 1), snapshot('at-cutoff', 'B', day)]);
    await db.annotations.add({ pageKey: 'a', tag: '学习', note: '用户备注' });
    await db.reports.add(report);
    await pruneData(1, day * 2);
    expect(await db.activities.get('old')).toBeUndefined();
    expect((await db.activities.get('crossing'))?.startedAt).toBe(day);
    expect((await db.snapshots.toArray()).map(item => item.id)).toEqual(['at-cutoff']);
    expect(await db.annotations.count()).toBe(1);
    expect(await db.reports.get(report.id)).toEqual(report);
    await expect(pruneData(0)).rejects.toThrow();
  });

  it('explicitly clears every data table, including saved reports and annotations', async () => {
    await db.activities.add(activity('1', 'a', 0, 100));
    await saveSnapshot(snapshot('1', 'A', 50));
    await db.annotations.add({ pageKey: 'a', tag: '学习', note: '用户备注' });
    await db.reports.add(report);
    await clearAllData();
    expect(await Promise.all([db.activities.count(), db.snapshots.count(), db.annotations.count(), db.reports.count()]))
      .toEqual([0, 0, 0, 0]);
  });

  it('retains recently observed identical content but removes its expired observation times', async () => {
    const day = 86_400_000;
    await saveSnapshot(snapshot('1', 'A', day - 100));
    await saveSnapshot(snapshot('2', 'A', day + 100));
    await db.activities.add(activity('a', 'a', day, day * 2));
    await pruneData(1, day * 2);
    expect(await db.snapshots.count()).toBe(1);
    expect((await db.snapshots.get('1'))?.observationTimes).toEqual([day + 100]);
    expect((await loadWorkspace(day, day * 2)).snapshots[0]?.capturedAt).toBe(day + 100);
    expect((await loadWorkspace(0, day)).snapshots).toEqual([]);
  });
});
