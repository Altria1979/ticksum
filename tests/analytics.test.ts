import { describe, expect, it } from 'vitest';
import { analyzeActivities, formatDuration } from '../src/analytics/analyze';
import type { Activity, Snapshot } from '../src/shared/types';

const minute = 60_000;
const activity = (id: string, pageKey: string, startedAt: number, endedAt: number): Activity => ({
  id, pageKey, startedAt, endedAt, title: `${pageKey} 文档`,
  url: `https://${pageKey}.example/docs`, hostname: `${pageKey}.example`,
});
const snapshot = (id: string, capturedAt: number): Snapshot => ({
  id, pageKey: 'a', capturedAt, url: 'https://a.example/docs', title: '文档', hostname: 'a.example',
  contentHash: id, text: '正文', excerpt: '正文', headings: [], method: 'readability', coverage: 'partial', wordCount: 2,
});

describe('analyzeActivities', () => {
  it('clips intervals to the selected range, rejects invalid records, and excludes touching boundaries', () => {
    const result = analyzeActivities([
      activity('left', 'a', 0, 20 * minute), activity('right', 'b', 20 * minute, 40 * minute),
      activity('before', 'x', 0, 10 * minute), activity('after', 'x', 30 * minute, 40 * minute),
      activity('invalid', 'x', 25 * minute, 24 * minute), activity('nan', 'x', NaN, 30 * minute),
    ], [], [], { from: 10 * minute, to: 30 * minute });
    expect(result.totalMs).toBe(20 * minute);
    expect(result.pages.map(page => [page.pageKey, page.durationMs])).toEqual([['a', 10 * minute], ['b', 10 * minute]]);
    expect(result.timeline.reduce((sum, bucket) => sum + bucket.durationMs, 0)).toBe(result.totalMs);
  });

  it('deduplicates checkpoint updates and assigns overlaps to later-starting activity regardless of input order', () => {
    const records = [
      activity('a1', 'a', 0, 10 * minute), activity('a1', 'a', 0, 20 * minute),
      activity('b1', 'b', 5 * minute, 15 * minute), activity('c1', 'c', 7 * minute, 8 * minute),
      activity('duplicate', 'b', 5 * minute, 15 * minute),
    ];
    const result = analyzeActivities(records, [], [], { from: 0, to: 20 * minute });
    expect(analyzeActivities([...records].reverse(), [], [], { from: 0, to: 20 * minute })).toEqual(result);
    expect(result.totalMs).toBe(20 * minute);
    expect(result.pages.map(page => [page.pageKey, page.durationMs, page.visits])).toEqual([
      ['a', 10 * minute, 2], ['b', 9 * minute, 2], ['c', minute, 1],
    ]);
  });

  it('merges adjacent fragments of the same page into one visit but preserves a later return', () => {
    const result = analyzeActivities([
      activity('1', 'a', 0, minute), activity('2', 'a', minute, 2 * minute),
      activity('3', 'b', 2 * minute, 3 * minute), activity('4', 'a', 3 * minute, 4 * minute),
    ], [], [], { from: 0, to: 4 * minute });
    expect(result.pages.find(page => page.pageKey === 'a')?.visits).toBe(2);
  });

  it('resolves overlaps before filtering so filtered totals remain additive', () => {
    const records = [activity('1', 'a', 0, 10 * minute), activity('2', 'b', 5 * minute, 10 * minute)];
    const range = { from: 0, to: 10 * minute };
    const a = analyzeActivities(records, [], [], { ...range, pageKeys: ['a'] });
    const b = analyzeActivities(records, [], [], { ...range, pageKeys: ['b'] });
    expect(a.totalMs).toBe(5 * minute);
    expect(b.totalMs).toBe(5 * minute);
    expect(analyzeActivities(records, [], [], { ...range, pageKeys: [] }).pages).toEqual([]);
    expect(analyzeActivities(records, [], [], range).totalMs).toBe(a.totalMs + b.totalMs);
  });

  it('filters title, URL, hostname and tags, and attaches annotations', () => {
    const records = [activity('1', 'a', 0, minute), activity('2', 'b', minute, 2 * minute)];
    records[0]!.title = 'React 入门';
    const annotations = [{ pageKey: 'a', tag: '学习', note: '继续阅读 Hooks' }];
    const run = (filter: Record<string, string>) => analyzeActivities(records, [], annotations, { from: 0, to: 2 * minute, ...filter });
    expect(run({ search: 'REACT' }).pages[0]?.pageKey).toBe('a');
    expect(run({ search: '/docs' }).pages).toHaveLength(2);
    expect(run({ search: 'b.example' }).pages[0]?.pageKey).toBe('b');
    expect(run({ search: '学习' }).pages[0]?.note).toBe('继续阅读 Hooks');
    expect(run({ hostname: 'A.EXAMPLE', tag: '学习' }).totalMs).toBe(minute);
    expect(run({ hostname: 'a.example', tag: '工作' }).totalMs).toBe(0);
  });

  it('uses the latest snapshot before the range end, never future content', () => {
    const result = analyzeActivities([activity('1', 'a', 0, 100)], [
      snapshot('old', 1), snapshot('latest', 90), snapshot('future', 101),
    ], [], { from: 0, to: 100 });
    expect(result.pages[0]?.snapshot?.id).toBe('latest');
    expect(result.snapshotCount).toBe(1);
    expect(analyzeActivities([activity('1', 'a', 0, 100)], [snapshot('future', 101)], [], { from: 0, to: 100 }).snapshotCount).toBe(0);
  });

  it('aggregates distinct pages under one domain', () => {
    const first = activity('1', 'a', 0, minute);
    const second = { ...activity('2', 'b', minute, 2 * minute), hostname: first.hostname };
    expect(analyzeActivities([first, second], [], [], { from: 0, to: 2 * minute }).domains)
      .toEqual([{ hostname: 'a.example', durationMs: 2 * minute, pages: 2 }]);
  });

  it('splits long-range activity at local midnight and caps timeline buckets', () => {
    const from = new Date(2026, 9, 17, 0, 0).getTime();
    const midnight = new Date(2026, 9, 18, 0, 0).getTime();
    const to = new Date(2026, 9, 19, 0, 0).getTime();
    const records = [activity('1', 'a', midnight - 10 * minute, midnight + 20 * minute)];
    const result = analyzeActivities(records, [], [], { from, to });
    expect(result.timeline).toEqual([
      { startedAt: from, endedAt: midnight, durationMs: 10 * minute },
      { startedAt: midnight, endedAt: to, durationMs: 20 * minute },
    ]);
    const year = analyzeActivities(records, [], [], { from, to: new Date(2027, 9, 17).getTime() });
    expect(year.timeline.length).toBeLessThanOrEqual(24);
    expect(year.timeline.reduce((sum, bucket) => sum + bucket.durationMs, 0)).toBe(30 * minute);
  });

  it('builds bounded contiguous buckets for partial hours and no fabricated activity', () => {
    const from = new Date(2026, 9, 18, 9, 17).getTime();
    const to = from + 24 * 60 * minute;
    const result = analyzeActivities([], [], [], { from, to });
    expect(result.totalMs).toBe(0);
    expect(result.timeline.length).toBeLessThanOrEqual(24);
    expect(result.timeline[0]?.startedAt).toBe(from);
    expect(result.timeline.at(-1)?.endedAt).toBe(to);
    result.timeline.slice(1).forEach((bucket, index) => expect(bucket.startedAt).toBe(result.timeline[index]?.endedAt));
  });

  it('uses calendar midnights across both daylight-saving transitions', () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      for (const [month, day, expectedHours] of [[2, 8, 23], [10, 1, 25]] as const) {
        const from = new Date(2026, month, day).getTime();
        const to = new Date(2026, month, day + 2).getTime();
        const result = analyzeActivities([activity('1', 'a', from, to)], [], [], { from, to });
        expect(result.timeline.map(bucket => bucket.durationMs)).toEqual([expectedHours * 60 * minute, 24 * 60 * minute]);
        expect(result.totalMs).toBe(to - from);
      }
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });

  it('matches a discrete-time reference for many overlapping inputs', () => {
    let seed = 42;
    const random = () => { seed = (seed * 1_664_525 + 1_013_904_223) >>> 0; return seed / 2 ** 32; };
    for (let trial = 0; trial < 40; trial++) {
      const records = Array.from({ length: 25 }, (_, index) => {
        const start = Math.floor(random() * 100);
        return activity(String(index).padStart(2, '0'), `page-${index % 4}`, start, start + 1 + Math.floor(random() * 35));
      });
      const expected = new Map<string, number>();
      for (let tick = 10; tick < 90; tick++) {
        const winner = records.filter(record => record.startedAt <= tick && record.endedAt > tick)
          .sort((a, b) => b.startedAt - a.startedAt || b.id.localeCompare(a.id))[0];
        if (winner) expected.set(winner.pageKey, (expected.get(winner.pageKey) ?? 0) + 1);
      }
      const result = analyzeActivities(records, [], [], { from: 10, to: 90 });
      expect(new Map(result.pages.map(page => [page.pageKey, page.durationMs]))).toEqual(expected);
      expect(result.timeline.reduce((sum, bucket) => sum + bucket.durationMs, 0)).toBe(result.totalMs);
      expect(result.totalMs).toBeLessThanOrEqual(80);
    }
  });

  it('returns no buckets for invalid ranges', () => {
    for (const [from, to] of [[2, 1], [1, 1], [NaN, 1], [0, Infinity]] as const) {
      expect(analyzeActivities([], [], [], { from, to }).timeline).toEqual([]);
    }
  });
});

describe('formatDuration', () => {
  it('formats durations without rounding time up', () => {
    expect(formatDuration(0)).toBe('0 秒');
    expect(formatDuration(-1)).toBe('0 秒');
    expect(formatDuration(NaN)).toBe('0 秒');
    expect(formatDuration(100)).toBe('不足 1 秒');
    expect(formatDuration(61_999)).toBe('1 分钟 1 秒');
    expect(formatDuration(3_600_000)).toBe('1 小时');
  });
});
