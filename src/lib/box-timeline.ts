/**
 * Merged chronological view: Close activities + email threads + plan touchpoints.
 */

import type { CloseActivity, CloseEmailThread, CloseLeadFull } from "./close";
import type { SevenDayPlanDay } from "./plan";

export type TimelineKind = "activity" | "thread" | "plan_touch";

export type TimelineItem =
  | {
      kind: "activity";
      id: string;
      at: string;
      sort: number;
      activity: CloseActivity;
    }
  | {
      kind: "thread";
      id: string;
      at: string;
      sort: number;
      thread: CloseEmailThread;
    }
  | {
      kind: "plan_touch";
      id: string;
      at: string;
      sort: number;
      dayIndex: number;
      dayNumber: number;
      date: string;
      approval_status: SevenDayPlanDay["approval_status"];
      channels: string[];
      intents: string[];
    };

function parseTime(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function addDaysIso(startIso: string, dayIndex: number): string {
  const d = new Date(startIso);
  d.setDate(d.getDate() + dayIndex);
  return d.toISOString().slice(0, 10);
}

export function buildBoxTimeline(opts: {
  box: CloseLeadFull;
  planDays: SevenDayPlanDay[];
  cycleStartedAt: string;
}): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const a of opts.box.activities) {
    items.push({
      kind: "activity",
      id: `act-${a.id}`,
      at: a.date_created,
      sort: parseTime(a.date_created),
      activity: a,
    });
  }

  for (const th of opts.box.email_threads ?? []) {
    const at = th.date_updated || th.date_created || "";
    items.push({
      kind: "thread",
      id: `th-${th.id}`,
      at,
      sort: parseTime(at),
      thread: th,
    });
  }

  const cycleStart = parseTime(opts.cycleStartedAt);
  for (let i = 0; i < opts.planDays.length; i++) {
    const d = opts.planDays[i];
    const intents = d.required_actions.map((x) => x.intent);
    const channels = d.required_actions.map((x) => x.channel);
    const dk = addDaysIso(opts.cycleStartedAt, i);
    const sort = parseTime(dk + "T12:00:00.000Z") || cycleStart + i * 86400000;
    items.push({
      kind: "plan_touch",
      id: `plan-${i}-${dk}`,
      at: dk,
      sort,
      dayIndex: i,
      dayNumber: d.day,
      date: dk,
      approval_status: d.approval_status,
      channels,
      intents,
    });
  }

  items.sort((a, b) => b.sort - a.sort);
  return items;
}
