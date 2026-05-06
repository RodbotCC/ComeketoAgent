import {
  closeGetCall,
  closeGetLeadFull,
  type CloseActivity,
  type CloseEmailThread,
  type CloseLead,
  type CloseLeadFull,
  type CloseSequenceSubscription,
} from "./close";

const CALL_ENRICH_CONCURRENCY = 5;

/** What the renderer (Atom 3) consumes. Activities split by kind; calls are
 *  the *enriched* per-call payloads (with `recording_transcript`), not the
 *  trimmed list rows. `unknown_activities` catches anything we didn't bucket
 *  so the renderer can keep raw fidelity in the verbatim file. */
export type LeadHydration = {
  lead: CloseLead;
  calls: CloseActivity[];
  emails: CloseActivity[];
  smses: CloseActivity[];
  whatsapps: CloseActivity[];
  meetings: CloseActivity[];
  notes: CloseActivity[];
  tasks: CloseActivity[];
  threads: CloseEmailThread[];
  subscriptions: CloseSequenceSubscription[];
  unknown_activities: CloseActivity[];
  fetched_at: string;
  /** Total number of activities seen, before bucketing — useful for the
   *  ledger's "did we hit the 500 cap?" check. */
  activity_total: number;
};

/** Direct-REST hydration for one lead. Bulk fan-out via `closeGetLeadFull`
 *  (lead core + paginated activity feed + email threads + workflow subs) +
 *  per-call enrichment for `recording_transcript`.
 *
 *  Returns raw payloads. Renderer (Atom 3) shapes them into Markdown. */
export async function hydrateLead(leadId: string): Promise<LeadHydration> {
  const bulk: CloseLeadFull = await closeGetLeadFull(leadId);
  const buckets = bucketActivities(bulk.activities);
  const enrichedCalls = await enrichCalls(buckets.calls);

  return {
    lead: bulk.lead,
    calls: enrichedCalls,
    emails: buckets.emails,
    smses: buckets.smses,
    whatsapps: buckets.whatsapps,
    meetings: buckets.meetings,
    notes: buckets.notes,
    tasks: buckets.tasks,
    threads: bulk.email_threads,
    subscriptions: bulk.subscriptions,
    unknown_activities: buckets.unknown,
    fetched_at: bulk.fetched_at,
    activity_total: bulk.activities.length,
  };
}

type Buckets = {
  calls: CloseActivity[];
  emails: CloseActivity[];
  smses: CloseActivity[];
  whatsapps: CloseActivity[];
  meetings: CloseActivity[];
  notes: CloseActivity[];
  tasks: CloseActivity[];
  unknown: CloseActivity[];
};

export function bucketActivities(activities: CloseActivity[]): Buckets {
  const out: Buckets = {
    calls: [],
    emails: [],
    smses: [],
    whatsapps: [],
    meetings: [],
    notes: [],
    tasks: [],
    unknown: [],
  };
  for (const a of activities) {
    switch (a._type) {
      case "Call":
        out.calls.push(a);
        break;
      case "Email":
        out.emails.push(a);
        break;
      case "SMS":
        out.smses.push(a);
        break;
      // Close has used both spellings historically; match defensively.
      case "WhatsappMessage":
      case "WhatsAppMessage":
      case "Whatsapp":
      case "WhatsApp":
        out.whatsapps.push(a);
        break;
      case "Meeting":
        out.meetings.push(a);
        break;
      case "Note":
        out.notes.push(a);
        break;
      case "Task":
      case "TaskCompleted":
        out.tasks.push(a);
        break;
      default:
        out.unknown.push(a);
    }
  }
  return out;
}

/** For each call activity, GET /activity/call/{id}/ to pull the full payload
 *  including `recording_transcript`. Concurrency capped to be polite to
 *  Close's API. Failures (expired recordings, transient 5xx) fall back to
 *  the trimmed list row so the lead still hydrates. */
async function enrichCalls(
  trimmedCalls: CloseActivity[],
): Promise<CloseActivity[]> {
  if (trimmedCalls.length === 0) return [];

  const out: CloseActivity[] = new Array(trimmedCalls.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= trimmedCalls.length) return;
      const trimmed = trimmedCalls[i];
      if (!trimmed) continue;
      try {
        out[i] = await closeGetCall(trimmed.id);
      } catch {
        // Close occasionally 5xx's or 404s on expired recordings. Keep the
        // trimmed row so the call still appears in the lead's history; we
        // just don't get the transcript field.
        out[i] = trimmed;
      }
    }
  }

  const lanes = Math.min(CALL_ENRICH_CONCURRENCY, trimmedCalls.length);
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return out;
}
