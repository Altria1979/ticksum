import type {
  Activity, AnalysisFilter, AnalyticsResult, DomainSummary, PageAnnotation,
  PageSummary, Snapshot, TimeBucket,
} from '../shared/types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface Interval { activity: Activity; startedAt: number; endedAt: number }

function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

function validRange(from: number, to: number): boolean {
  return Number.isFinite(from) && Number.isFinite(to) && from < to
    && Number.isFinite(new Date(from).getTime()) && Number.isFinite(new Date(to).getTime());
}

/** Latest-starting activity owns overlapping time, independently of input order. */
function disjointIntervals(activities: Activity[], from: number, to: number): Interval[] {
  const unique = new Map<string, Activity>();
  for (const activity of activities) {
    if (!validRange(activity.startedAt, activity.endedAt)
      || activity.startedAt >= to || activity.endedAt <= from) continue;
    const previous = unique.get(activity.id);
    if (!previous || activity.endedAt > previous.endedAt
      || (activity.endedAt === previous.endedAt && activity.startedAt < previous.startedAt)) {
      unique.set(activity.id, activity);
    }
  }
  const records = [...unique.values()].sort((a, b) => a.startedAt - b.startedAt
    || compareText(a.id, b.id));
  const events = records.flatMap((activity, index) => [
    { time: Math.max(from, activity.startedAt), index, starts: true },
    { time: Math.min(to, activity.endedAt), index, starts: false },
  ]).sort((a, b) => a.time - b.time);
  const heap: number[] = [];
  const active = new Set<number>();
  // records are ordered by precedence, making their indices heap priorities.
  const push = (value: number) => {
    let index = heap.length;
    heap.push(value);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent]! >= value) break;
      heap[index] = heap[parent]!;
      index = parent;
    }
    heap[index] = value;
  };
  const pop = () => {
    const last = heap.pop();
    if (heap.length === 0 || last === undefined) return;
    let index = 0;
    while (index * 2 + 1 < heap.length) {
      let child = index * 2 + 1;
      if (child + 1 < heap.length && heap[child + 1]! > heap[child]!) child++;
      if (heap[child]! <= last) break;
      heap[index] = heap[child]!;
      index = child;
    }
    heap[index] = last;
  };

  const result: Interval[] = [];
  for (let index = 0; index < events.length;) {
    const time = events[index]!.time;
    while (index < events.length && events[index]!.time === time) {
      const event = events[index++]!;
      if (event.starts) { active.add(event.index); push(event.index); }
      else active.delete(event.index);
    }
    while (heap.length > 0 && !active.has(heap[0]!)) pop();
    const nextTime = events[index]?.time;
    if (heap.length === 0 || nextTime === undefined || nextTime <= time) continue;
    const activity = records[heap[0]!]!;
    const previous = result[result.length - 1];
    if (previous && previous.activity.id === activity.id && previous.endedAt === time) previous.endedAt = nextTime;
    else result.push({ activity, startedAt: time, endedAt: nextTime });
  }
  return result;
}

function createBuckets(from: number, to: number): TimeBucket[] {
  const result: TimeBucket[] = [];
  const span = to - from;
  if (span <= DAY) {
    const step = [5 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 2 * HOUR]
      .find(value => Math.ceil(span / value) + 1 <= 24) ?? 2 * HOUR;
    const midnight = new Date(from);
    midnight.setHours(0, 0, 0, 0);
    let next = midnight.getTime() + (Math.floor((from - midnight.getTime()) / step) + 1) * step;
    let cursor = from;
    while (cursor < to) {
      const end = Math.min(to, next);
      result.push({ startedAt: cursor, endedAt: end, durationMs: 0 });
      cursor = end;
      next += step;
    }
  } else {
    // Calendar-day boundaries, rather than 24-hour increments, respect DST.
    const daysPerBucket = Math.max(1, Math.ceil((span / DAY + 1) / 23));
    const boundary = new Date(from);
    boundary.setHours(0, 0, 0, 0);
    boundary.setDate(boundary.getDate() + daysPerBucket);
    let cursor = from;
    while (cursor < to) {
      const end = Math.min(to, Number.isFinite(boundary.getTime()) ? boundary.getTime() : to);
      if (!Number.isFinite(end) || end <= cursor) break;
      result.push({ startedAt: cursor, endedAt: end, durationMs: 0 });
      cursor = end;
      boundary.setDate(boundary.getDate() + daysPerBucket);
    }
  }
  return result;
}

export function analyzeActivities(
  activities: Activity[], snapshots: Snapshot[], annotations: PageAnnotation[], filter: AnalysisFilter,
): AnalyticsResult {
  const { from, to } = filter;
  const empty: AnalyticsResult = { from, to, totalMs: 0, pages: [], domains: [], timeline: [], snapshotCount: 0 };
  if (!validRange(from, to)) return empty;
  const annotationByPage = new Map(annotations.map(annotation => [annotation.pageKey, annotation]));
  const latestSnapshots = new Map<string, Snapshot>();
  for (const snapshot of snapshots) {
    if (!Number.isFinite(snapshot.capturedAt) || snapshot.capturedAt > to) continue;
    const previous = latestSnapshots.get(snapshot.pageKey);
    if (!previous || previous.capturedAt < snapshot.capturedAt
      || (previous.capturedAt === snapshot.capturedAt && compareText(previous.id, snapshot.id) < 0)) {
      latestSnapshots.set(snapshot.pageKey, snapshot);
    }
  }
  const selected = filter.pageKeys === undefined ? undefined : new Set(filter.pageKeys);
  const search = filter.search?.trim().toLocaleLowerCase();
  const hostname = filter.hostname?.toLocaleLowerCase();
  const timeline = createBuckets(from, to);
  const pages = new Map<string, PageSummary>();
  let previousInterval: Interval | undefined;
  for (const interval of disjointIntervals(activities, from, to)) {
    const { activity, startedAt, endedAt } = interval;
    const annotation = annotationByPage.get(activity.pageKey);
    const matches = (!selected || selected.has(activity.pageKey))
      && (!hostname || activity.hostname.toLocaleLowerCase() === hostname)
      && (!filter.tag || annotation?.tag === filter.tag)
      && (!search || [activity.title, activity.url, activity.hostname, annotation?.tag ?? '']
        .some(value => value.toLocaleLowerCase().includes(search)));
    if (matches) {
      const durationMs = endedAt - startedAt;
      let page = pages.get(activity.pageKey);
      if (!page) {
        page = {
          pageKey: activity.pageKey, title: activity.title, url: activity.url, hostname: activity.hostname,
          durationMs: 0, visits: 0, lastSeenAt: endedAt,
          tag: annotation?.tag ?? '', note: annotation?.note ?? '',
          snapshot: latestSnapshots.get(activity.pageKey),
        };
        pages.set(activity.pageKey, page);
      }
      page.durationMs += durationMs;
      if (previousInterval?.activity.pageKey !== activity.pageKey || previousInterval.endedAt !== startedAt) {
        page.visits++;
      }
      if (endedAt >= page.lastSeenAt) {
        page.lastSeenAt = endedAt;
        page.title = activity.title;
        page.url = activity.url;
      }
      for (const bucket of timeline) {
        bucket.durationMs += Math.max(0, Math.min(endedAt, bucket.endedAt) - Math.max(startedAt, bucket.startedAt));
      }
    }
    previousInterval = matches ? interval : undefined;
  }
  const pageList = [...pages.values()].sort((a, b) => b.durationMs - a.durationMs || compareText(a.pageKey, b.pageKey));
  const domains = new Map<string, DomainSummary>();
  for (const page of pageList) {
    const domain = domains.get(page.hostname) ?? { hostname: page.hostname, durationMs: 0, pages: 0 };
    domain.durationMs += page.durationMs;
    domain.pages++;
    domains.set(page.hostname, domain);
  }
  return {
    from, to, totalMs: pageList.reduce((total, page) => total + page.durationMs, 0), pages: pageList,
    domains: [...domains.values()].sort((a, b) => b.durationMs - a.durationMs || compareText(a.hostname, b.hostname)),
    timeline, snapshotCount: pageList.filter(page => page.snapshot !== undefined).length,
  };
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 秒';
  if (ms < 1_000) return '不足 1 秒';
  const seconds = Math.floor(ms / 1_000);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor(seconds % 3_600 / 60);
  const remainder = seconds % 60;
  return [hours ? `${hours} 小时` : '', minutes ? `${minutes} 分钟` : '', remainder ? `${remainder} 秒` : '']
    .filter(Boolean).join(' ');
}
