/**
 * Server-only Close CRM API client.
 *
 * Auth: HTTP Basic with the API key as the username and a blank password.
 * Docs: https://developer.close.com/api/overview/api-key-authentication
 *
 * Doc index (repo): `_reference/close-llms.md` — live tree: https://developer.close.com/llms.txt
 *
 * Coverage grows by product need; prefer adding typed helpers here over scattering
 * raw fetch across the app. Lead Box + plans: hydrated comms (activities +
 * email threads), snapshots, assignee-scoped lead lists. Automation: sequences,
 * subscriptions, templates, telephony. Wiring map: `_reference/close-llms.md`
 * section “Comeketo wiring”.
 */

import { env } from "./env";

const BASE = "https://api.close.com/api/v1";

function authHeader(): string {
  if (!env.CLOSE_API_KEY) {
    throw new Error(
      "CLOSE_API_KEY is not set in .env.local — get one at https://app.close.com/settings/developer/api-keys/"
    );
  }
  const b64 = Buffer.from(`${env.CLOSE_API_KEY}:`).toString("base64");
  return `Basic ${b64}`;
}

async function closeFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const { query, ...rest } = init;
  let url = `${BASE}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const res = await fetch(url, {
    ...rest,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Close ${res.status} ${path}: ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types (just what we touch — Close has many more fields per resource) ──

export type CloseWorkflow = {
  id: string;
  name: string;
  status: "active" | "paused" | "draft";
  html_url?: string;
  date_created?: string;
  date_updated?: string;
  steps: Array<{
    id: string;
    step_type: string;
    delay?: string;
    [k: string]: unknown;
  }>;
};

/** Close web app — sequence editor. Uses `html_url` from the API when present. */
export function closeSequenceBrowserUrl(workflow: CloseWorkflow): string {
  const h = workflow.html_url;
  if (typeof h === "string" && /^https?:\/\//i.test(h)) return h;
  const id = encodeURIComponent(workflow.id);
  return `https://app.close.com/sequences/${id}/`;
}

export type CloseLead = {
  id: string;
  display_name: string;
  name?: string;
  status_id?: string;
  status_label?: string;
  contacts?: Array<{
    id: string;
    name?: string;
    emails?: Array<{ email: string }>;
    phones?: Array<{ phone: string }>;
  }>;
  opportunities?: Array<Record<string, unknown>>;
  url?: string;
  html_url?: string;
  description?: string;
  date_created?: string;
  date_updated?: string;
  user_id?: string;
  user_name?: string;
  organization_id?: string;
};

export type CloseEmailTemplate = {
  id: string;
  name: string;
  subject?: string;
  is_shared?: boolean;
};

export type CloseOpportunity = {
  id: string;
  lead_id: string;
  status_id?: string;
  value?: number;
  value_period?: "one_time" | "monthly" | "annual";
  note?: string;
  contact_id?: string;
  user_id?: string;
  confidence?: number;
};

type Paged<T> = {
  data: T[];
  has_more?: boolean;
  cursor_next?: string | null;
};

// ─── Endpoints ────────────────────────────────────────────────────────────

/** GET /sequence/ — Close calls workflows "sequences" in the API. */
export async function closeListWorkflows(opts: { limit?: number } = {}): Promise<CloseWorkflow[]> {
  const r = await closeFetch<Paged<CloseWorkflow>>("/sequence/", {
    query: { _limit: opts.limit ?? 50 },
  });
  return r.data;
}

const LEAD_LIST_FIELDS = [
  "id",
  "display_name",
  "name",
  "status_id",
  "status_label",
  "contacts",
  "url",
  "date_created",
  "date_updated",
  "user_id",
  "user_name",
  "description",
] as const;

/** Cap how many leads we scan via `GET /lead/?_skip=` for assignee tabs (org-wide safety). */
const LEAD_SCAN_MAX_SKIP = 50_000;

/**
 * Page through GET /lead/ and collect leads matching `predicate`, stopping at `limit`
 * matches or when Close reports no more pages. Close Advanced Filtering does not expose
 * `user_id` on lead as a regular_field; assignee lives on REST `user_id` / `user_name`.
 */
async function scanLeadsMatching(
  predicate: (lead: CloseLead & { user_id?: string }) => boolean,
  limit: number
): Promise<CloseLead[]> {
  const matches: CloseLead[] = [];
  const pageSize = 100;
  let skip = 0;

  while (matches.length < limit && skip < LEAD_SCAN_MAX_SKIP) {
    const r = await closeFetch<Paged<CloseLead>>("/lead/", {
      query: {
        _limit: pageSize,
        _skip: skip,
        _fields: [...LEAD_LIST_FIELDS].join(","),
      },
    });
    const batch = r.data ?? [];
    for (const lead of batch) {
      const row = lead as CloseLead & { user_id?: string };
      if (predicate(row)) {
        matches.push(lead);
        if (matches.length >= limit) return matches;
      }
    }
    const more =
      r.has_more === true || (r.has_more === undefined && batch.length === pageSize);
    if (!more || batch.length === 0) break;
    skip += pageSize;
  }

  return matches;
}

/** POST /data/search/ — flexible lead search. Pass a Close query string. */
export async function closeSearchLeads(query: string, limit = 10): Promise<CloseLead[]> {
  const body = {
    query: {
      type: "saved_search" as const,
      _query: query,
    },
    _limit: limit,
    _fields: {
      lead: [...LEAD_LIST_FIELDS],
    },
  };
  // Close's /data/search/ wraps results in { data: [...] } too.
  const r = await closeFetch<Paged<CloseLead>>("/data/search/", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return r.data;
}

/**
 * Leads assigned to a Close user (REST `user_id`). Uses GET /lead/ pagination + filter —
 * not POST /data/search/ `user_id` (invalid field on lead in Advanced Filtering).
 */
export async function closeListLeadsByAssignee(
  assigneeUserId: string,
  limit = 200
): Promise<CloseLead[]> {
  return scanLeadsMatching((row) => row.user_id === assigneeUserId, limit);
}

/**
 * POST /data/search/ — leads with a specific lead status (stat_*).
 * Uses Advanced Filtering reference `status.lead` per Close docs.
 */
export async function closeListLeadsByStatusId(
  statusId: string,
  limit = 200
): Promise<CloseLead[]> {
  const body = {
    query: {
      type: "and" as const,
      queries: [
        { type: "object_type" as const, object_type: "lead" as const },
        {
          type: "field_condition" as const,
          field: {
            type: "regular_field" as const,
            object_type: "lead" as const,
            field_name: "status_id",
          },
          condition: {
            type: "reference" as const,
            reference_type: "status.lead" as const,
            object_ids: [statusId],
          },
        },
      ],
    },
    _limit: limit,
    _fields: {
      lead: [...LEAD_LIST_FIELDS],
    },
  };
  type Row = CloseLead & { __object_type?: string };
  const r = await closeFetch<Paged<Row>>("/data/search/", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return (r.data ?? []).map(({ __object_type: _o, ...lead }) => lead as CloseLead);
}

/** Assignee (REST user_id) AND lead status — GET /lead/ scan; status-only path still uses Advanced Filtering. */
export async function closeListLeadsByAssigneeAndStatus(
  assigneeUserId: string,
  statusId: string,
  limit = 200
): Promise<CloseLead[]> {
  return scanLeadsMatching(
    (row) => row.user_id === assigneeUserId && row.status_id === statusId,
    limit
  );
}

/** GET /lead/{id}/ */
export async function closeGetLead(leadId: string): Promise<CloseLead> {
  return closeFetch<CloseLead>(`/lead/${encodeURIComponent(leadId)}/`);
}

/** POST /sequence_subscription/ — enroll a lead's contact into a workflow. */
export async function closeEnrollInWorkflow(input: {
  sequence_id: string;
  contact_id: string;
  sender_account_id?: string;
  sender_email?: string;
  sender_name?: string;
}): Promise<{ id: string; status: string }> {
  return closeFetch("/sequence_subscription/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** GET /email_template/ */
export async function closeListEmailTemplates(opts: { limit?: number } = {}): Promise<CloseEmailTemplate[]> {
  const r = await closeFetch<Paged<CloseEmailTemplate>>("/email_template/", {
    query: { _limit: opts.limit ?? 50 },
  });
  return r.data;
}

/** POST /opportunity/ */
export async function closeCreateOpportunity(input: {
  lead_id: string;
  status_id?: string;
  value?: number;
  value_period?: "one_time" | "monthly" | "annual";
  note?: string;
  contact_id?: string;
  user_id?: string;
  confidence?: number;
}): Promise<CloseOpportunity> {
  return closeFetch<CloseOpportunity>("/opportunity/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─── Activity feed + sequence subscriptions (for the Lead Box) ────────────

export type CloseActivity = {
  id: string;
  _type: string; // "Email" | "SMS" | "Call" | "Note" | "Task" | "Meeting" | ...
  lead_id: string;
  contact_id?: string;
  user_id?: string;
  user_name?: string;
  date_created: string;
  direction?: "inbound" | "outbound" | null;
  status?: string;
  // Email
  subject?: string;
  body_text?: string;
  body_html?: string;
  // SMS
  text?: string;
  // Call
  duration?: number;
  note?: string;
  recording_url?: string;
  transcript?: unknown;
  // Note
  // (note uses `note` field above)
  [k: string]: unknown;
};

export type CloseSequenceSubscription = {
  id: string;
  sequence_id: string;
  sequence_name?: string;
  contact_id: string;
  lead_id: string;
  status: string; // active | paused | error | ...
  date_created: string;
  date_updated?: string;
  pause_reason?: string;
};

/** GET /activity/?lead_id=... — one page of activity feed (all types). */
export async function closeListActivities(leadId: string, limit = 100): Promise<CloseActivity[]> {
  const r = await closeFetch<Paged<CloseActivity>>(`/activity/`, {
    query: { lead_id: leadId, _limit: limit },
  });
  return r.data;
}

/**
 * GET /activity/?lead_id=... with pagination until `has_more` is false or `maxItems` reached.
 * Newest-first order matches Close list default. Use for Box hydration + snapshot accuracy.
 */
export async function closeListActivitiesForLead(
  leadId: string,
  opts: { pageSize?: number; maxItems?: number } = {}
): Promise<CloseActivity[]> {
  const pageSize = opts.pageSize ?? 100;
  const maxItems = opts.maxItems ?? 500;
  const all: CloseActivity[] = [];
  let skip = 0;
  for (;;) {
    const r = await closeFetch<Paged<CloseActivity>>(`/activity/`, {
      query: { lead_id: leadId, _limit: pageSize, _skip: skip },
    });
    const batch = r.data ?? [];
    all.push(...batch);
    if (!r.has_more || batch.length === 0 || all.length >= maxItems) break;
    skip += pageSize;
  }
  return all.length > maxItems ? all.slice(0, maxItems) : all;
}

/** GET /activity/emailthread/?lead_id= — one row per email conversation (subject thread). */
export type CloseEmailThread = {
  id: string;
  lead_id?: string;
  date_created?: string;
  date_updated?: string;
  subject?: string;
  organization_id?: string;
  [k: string]: unknown;
};

export async function closeListEmailThreadsForLead(
  leadId: string,
  opts: { limit?: number } = {}
): Promise<CloseEmailThread[]> {
  const r = await closeFetch<Paged<CloseEmailThread>>("/activity/emailthread/", {
    query: { lead_id: leadId, _limit: opts.limit ?? 50 },
  });
  return r.data ?? [];
}

/** GET /sequence_subscription/?lead_id=... — workflow enrollments for a lead. */
export async function closeListSequenceSubscriptions(
  leadId: string,
  limit = 50
): Promise<CloseSequenceSubscription[]> {
  const r = await closeFetch<Paged<CloseSequenceSubscription>>("/sequence_subscription/", {
    query: { lead_id: leadId, _limit: limit },
  });
  return r.data;
}

export type CloseLeadFull = {
  lead: CloseLead;
  /** All activity types; paginated up to maxItems in closeGetLeadFull. */
  activities: CloseActivity[];
  /** Email conversation threads (supplements flat Email activities in the feed). */
  email_threads: CloseEmailThread[];
  subscriptions: CloseSequenceSubscription[];
  fetched_at: string;
};

/**
 * Fan-out fetch for a single lead Box: lead core + paginated activity feed +
 * email threads + workflow subscriptions in parallel.
 */
export async function closeGetLeadFull(leadId: string): Promise<CloseLeadFull> {
  const [lead, activities, email_threads, subscriptions] = await Promise.all([
    closeGetLead(leadId),
    closeListActivitiesForLead(leadId, { pageSize: 100, maxItems: 500 }),
    closeListEmailThreadsForLead(leadId, { limit: 50 }),
    closeListSequenceSubscriptions(leadId, 50),
  ]);
  return {
    lead,
    activities,
    email_threads,
    subscriptions,
    fetched_at: new Date().toISOString(),
  };
}

/** GET /lead/?_limit=N — list leads (newest first by default). */
export async function closeListLeads(opts: { limit?: number; query?: string } = {}): Promise<CloseLead[]> {
  const r = await closeFetch<Paged<CloseLead>>("/lead/", {
    query: {
      _limit: opts.limit ?? 25,
      query: opts.query,
      _fields: [...LEAD_LIST_FIELDS].join(","),
    },
  });
  return r.data;
}

/** POST /lead/ — create a lead with nested contacts (and optional addresses). */
export type CloseCreateLeadInput = {
  name: string;
  description?: string;
  url?: string;
  /** Lead owner (Assignee) — Close user id. */
  user_id?: string;
  contacts: Array<{
    name: string;
    title?: string;
    emails?: Array<{ email: string; type?: string }>;
    phones?: Array<{ phone: string; type?: string }>;
  }>;
  addresses?: Array<{
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    zipcode?: string;
    country?: string;
    label?: string;
  }>;
};

export async function closeCreateLead(input: CloseCreateLeadInput): Promise<CloseLead> {
  return closeFetch<CloseLead>("/lead/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * PUT /lead/{id}/ — partial update. Pass any writable fields Close accepts (e.g.
 * status_id, name, description, url, user_id, custom.cf_*).
 */
export async function closeUpdateLead(leadId: string, patch: Record<string, unknown>): Promise<CloseLead> {
  return closeFetch<CloseLead>(`/lead/${encodeURIComponent(leadId)}/`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

// ─── Write helpers (used by heartbeat in execution mode) ─────────────────

export type CloseTaskCreated = { id: string; lead_id: string; text: string; date: string };
export type CloseActivityCreated = { id: string; lead_id: string; _type: string };

/**
 * POST /task/ — Create a task on a lead, optionally assigned to a user.
 * `date` is ISO yyyy-mm-dd.
 */
export async function closeCreateTask(input: {
  lead_id: string;
  text: string;
  date: string;
  assigned_to: string;
  is_complete?: boolean;
}): Promise<CloseTaskCreated> {
  return closeFetch<CloseTaskCreated>("/task/", {
    method: "POST",
    body: JSON.stringify({
      lead_id: input.lead_id,
      text: input.text,
      date: input.date,
      assigned_to: input.assigned_to,
      is_complete: input.is_complete ?? false,
    }),
  });
}

/**
 * POST /activity/email/ — Log an outbound email activity. With `status: "draft"`
 * Close stores it as a draft visible in the lead's activity feed but does NOT
 * actually send via SMTP. With `status: "outbox"` Close attempts to send via
 * the configured email integration.
 *
 * For our heartbeat's first execution mode we use `status: "draft"` so the
 * activity is recorded and visible without surprise sends. Real send-on-fire
 * is a separate, deliberate flag.
 */
export async function closeLogEmail(input: {
  lead_id: string;
  contact_id: string;
  subject: string;
  body_text: string;
  status?: "draft" | "outbox" | "sent";
  user_id?: string;
}): Promise<CloseActivityCreated> {
  return closeFetch<CloseActivityCreated>("/activity/email/", {
    method: "POST",
    body: JSON.stringify({
      lead_id: input.lead_id,
      contact_id: input.contact_id,
      subject: input.subject,
      body_text: input.body_text,
      direction: "outgoing",
      status: input.status ?? "draft",
      user_id: input.user_id,
    }),
  });
}

/**
 * POST /activity/sms/ — Log an outbound SMS activity.
 * Same draft/outbox/sent semantics as email.
 */
export async function closeLogSms(input: {
  lead_id: string;
  contact_id: string;
  text: string;
  status?: "draft" | "outbox" | "sent";
  user_id?: string;
}): Promise<CloseActivityCreated> {
  return closeFetch<CloseActivityCreated>("/activity/sms/", {
    method: "POST",
    body: JSON.stringify({
      lead_id: input.lead_id,
      contact_id: input.contact_id,
      text: input.text,
      direction: "outbound",
      status: input.status ?? "draft",
      user_id: input.user_id,
    }),
  });
}

// ─── Automation + org config (sequences, subscriptions, templates, telephony) ─

export type CloseLeadStatusEntry = {
  id: string;
  label: string;
  organization_id?: string;
  [k: string]: unknown;
};

export type CloseSmsTemplate = {
  id: string;
  name: string;
  body?: string;
  [k: string]: unknown;
};

export type ClosePhoneNumber = {
  id: string;
  phone?: string;
  [k: string]: unknown;
};

/** GET /sequence/{id}/ — full workflow (steps, delays, channel actions). */
export async function closeGetWorkflow(
  sequenceId: string
): Promise<CloseWorkflow & Record<string, unknown>> {
  return closeFetch(`/sequence/${encodeURIComponent(sequenceId)}/`);
}

/** POST /sequence/ — create a sequence (name, timezone, schedule, steps, …). */
export async function closeCreateSequence(
  body: Record<string, unknown>
): Promise<CloseWorkflow & Record<string, unknown>> {
  return closeFetch(`/sequence/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** PUT /sequence/{id}/ — update an existing sequence. */
export async function closeUpdateSequence(
  sequenceId: string,
  patch: Record<string, unknown>
): Promise<CloseWorkflow & Record<string, unknown>> {
  return closeFetch(`/sequence/${encodeURIComponent(sequenceId)}/`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

/** GET /sequence_subscription/{id}/ — subscription detail (status, pause_reason, …). */
export async function closeGetSequenceSubscription(
  subscriptionId: string
): Promise<CloseSequenceSubscription & Record<string, unknown>> {
  return closeFetch(`/sequence_subscription/${encodeURIComponent(subscriptionId)}/`);
}

/**
 * PUT /sequence_subscription/{id}/ — e.g. `{ "status": "paused" }` or `{ "status": "active" }`.
 * https://developer.close.com/api/resources/sequences/update-subscription
 */
export async function closeUpdateSequenceSubscription(
  subscriptionId: string,
  patch: Record<string, unknown>
): Promise<CloseSequenceSubscription & Record<string, unknown>> {
  return closeFetch(`/sequence_subscription/${encodeURIComponent(subscriptionId)}/`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

/** GET /sms_template/ */
export async function closeListSmsTemplates(opts: { limit?: number } = {}): Promise<CloseSmsTemplate[]> {
  const r = await closeFetch<Paged<CloseSmsTemplate>>("/sms_template/", {
    query: { _limit: opts.limit ?? 50 },
  });
  return r.data;
}

/** GET /status/lead/ — lead status picklist for automation + UI. */
export async function closeListLeadStatuses(): Promise<CloseLeadStatusEntry[]> {
  const r = await closeFetch<Paged<CloseLeadStatusEntry>>("/status/lead/");
  return r.data;
}

/** GET /phone_number/ — org sending lines (SMS/call). Use for `local_phone` on real sends. */
export async function closeListPhoneNumbers(opts: { limit?: number } = {}): Promise<ClosePhoneNumber[]> {
  const r = await closeFetch<Paged<ClosePhoneNumber>>("/phone_number/", {
    query: { _limit: opts.limit ?? 50 },
  });
  return r.data;
}

export type CloseWebhookSubscription = {
  id: string;
  url?: string;
  status?: string;
  /** Present on create/list — store in `CLOSE_WEBHOOK_SIGNATURE_KEY` for `/api/webhooks/close`. */
  signature_key?: string;
  events?: Array<{ object_type: string; action: string; extra_filter?: unknown }>;
  [k: string]: unknown;
};

/** GET /webhook/ — org webhook subscriptions (URLs, event filters, signature keys). */
export async function closeListWebhookSubscriptions(
  opts: { limit?: number } = {}
): Promise<CloseWebhookSubscription[]> {
  const r = await closeFetch<Paged<CloseWebhookSubscription>>("/webhook/", {
    query: { _limit: opts.limit ?? 50 },
  });
  return r.data;
}

/**
 * POST /activity/note/ — internal note on a lead (operator-visible, not customer send).
 */
export async function closeLogNote(input: {
  lead_id: string;
  note?: string;
  note_html?: string;
  contact_id?: string;
  user_id?: string;
  pinned?: boolean;
  title?: string;
}): Promise<CloseActivityCreated> {
  return closeFetch<CloseActivityCreated>("/activity/note/", {
    method: "POST",
    body: JSON.stringify({
      lead_id: input.lead_id,
      note: input.note,
      note_html: input.note_html,
      contact_id: input.contact_id,
      user_id: input.user_id,
      pinned: input.pinned,
      title: input.title,
    }),
  });
}

// ─── Guardrails: ownership / status gates ─────────────────────────────────

/**
 * Check whether a lead is safe for outbound action per Guardrails §C.
 * Returns null if safe, or a skip code string if not.
 */
export type SkipCode =
  | "OWNERSHIP"
  | "STATUS_WON"
  | "STATUS_LOST"
  | "STOP_SIGNAL"
  | "REPLY_GATE"
  | "SEND_WINDOW"
  | "FREQUENCY_CAP"
  | "FREQUENCY_CAP_24H"
  | "FREQUENCY_CAP_7D"
  | "STALE_BOX"
  | "NEEDS_APPROVAL"
  | "HTML_FAIL"
  | "VOICE_FAIL"
  | "NO_SMS_ROUTE"
  | "NO_CONTACT"
  | "DAY_NOT_APPROVED"
  | "DAY_SKIPPED"
  | "DAY_ALREADY_SENT"
  | "DAY_NOT_TODAY"
  | "EXECUTION_DISABLED"
  | "COMMITMENT_FLAG"
  | "ENRICHMENT_BOUNDARY"
  | "CALL_TRANSCRIPT_PENDING"
  | "CLOSE_API_ERROR"
  | "WORKFLOW_MISMATCH";

/**
 * Hard gate per Guardrails §C1+C2. The app only acts on Andre-owned leads
 * that are not Won/Lost. Pass `andreUserId` from env (CLOSE_USER_ID_ANDRE).
 * Returns null when safe, otherwise a SkipCode that must be surfaced.
 */
export function checkOwnershipAndStatus(
  lead: CloseLead & { user_id?: string; status_label?: string },
  andreUserId: string
): SkipCode | null {
  // C1: Ownership.
  if (!andreUserId) return "OWNERSHIP"; // env not configured = treat as gate fail
  if (lead.user_id && lead.user_id !== andreUserId) return "OWNERSHIP";
  // C2: Status no-touch for outbound. Match Close labels permissively.
  const s = (lead.status_label || "").toLowerCase();
  if (s.includes("won")) return "STATUS_WON";
  if (s === "lost" || s.includes("lost")) return "STATUS_LOST";
  return null;
}

// ─── Stop-signal detection (Guardrails §C3) ──────────────────────────────

const STOP_PHRASES = [
  /\bstop\b/i,
  /\bunsubscribe\b/i,
  /\bremove me\b/i,
  /\bdon'?t contact\b/i,
  /\bdo not (?:contact|text|email|call)\b/i,
  /\bplease stop\b/i,
  /\btake me off\b/i,
  /\bno longer interested\b/i,
  /\bgoing with someone else\b/i,
  /\bfound (?:another|someone else)\b/i,
];

export type StopSignalHit = {
  activity_id: string;
  matched: string;
  occurred_at: string;
  channel: string;
  preview: string;
};

/**
 * Scan recent inbound activities for opt-out phrases. Returns matches
 * (most recent first). Empty array = no stop signal detected.
 */
export function detectStopSignal(activities: CloseActivity[]): StopSignalHit[] {
  const hits: StopSignalHit[] = [];
  for (const a of activities) {
    if (a.direction !== "inbound") continue;
    const text =
      (a.text as string) ||
      (a.body_text as string) ||
      (a.note as string) ||
      "";
    if (!text) continue;
    for (const pat of STOP_PHRASES) {
      const m = text.match(pat);
      if (m) {
        hits.push({
          activity_id: a.id,
          matched: m[0],
          occurred_at: a.date_created,
          channel: a._type,
          preview: text.slice(0, 200),
        });
        break;
      }
    }
  }
  return hits.sort(
    (x, y) => new Date(y.occurred_at).getTime() - new Date(x.occurred_at).getTime()
  );
}

// ─── Reply gate (Guardrails §F3) ──────────────────────────────────────────

/**
 * If there's a new inbound since the last outbound, the plan must pause.
 * Returns true if the gate is active (last inbound is more recent than
 * last outbound).
 */
export function isReplyGateActive(activities: CloseActivity[]): boolean {
  let lastIn: number | null = null;
  let lastOut: number | null = null;
  for (const a of activities) {
    const t = new Date(a.date_created).getTime();
    if (a.direction === "inbound" && (lastIn == null || t > lastIn)) lastIn = t;
    if (a.direction === "outbound" && (lastOut == null || t > lastOut)) lastOut = t;
  }
  if (lastIn == null) return false;
  if (lastOut == null) return true;
  return lastIn > lastOut;
}

// ─── Send window (Guardrails §J2) ─────────────────────────────────────────

/**
 * Check whether `now` is within the send window for a given channel.
 * Defaults per Guardrails §J2:
 *   - SMS: 9:00 AM – 7:00 PM lead-local time
 *   - Email: 7:00 AM – 9:00 PM lead-local time
 *   - Sunday SMS: after 11:00 AM lead-local time
 *
 * Pass `tz` (IANA, e.g. "America/Chicago") to evaluate in lead-local time.
 * Omit it for legacy operator-machine-local behavior.
 */
export function isInSendWindow(
  channel: "email" | "sms" | "call" | "task",
  now: Date = new Date(),
  tz?: string
): boolean {
  // Calls and tasks aren't customer-facing — the gate doesn't apply.
  if (channel === "call" || channel === "task") return true;

  let day: number;
  let hour: number;
  if (tz) {
    // Compute weekday and hour-in-zone via Intl.
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
      weekday: "short",
    });
    const parts = fmt.formatToParts(now);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    const h = parts.find((p) => p.type === "hour")?.value ?? "0";
    const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    day = wdMap[wd] ?? now.getDay();
    hour = parseInt(h, 10);
    if (Number.isNaN(hour)) hour = now.getHours();
  } else {
    day = now.getDay();
    hour = now.getHours();
  }

  if (channel === "sms") {
    if (day === 0 && hour < 11) return false; // Sunday SMS only after 11am
    return hour >= 9 && hour < 19;
  }
  // email
  return hour >= 7 && hour < 21;
}

// ─── Frequency cap (Guardrails §J3) ───────────────────────────────────────

/**
 * Default: max 1 outbound/24h, max 4 outbound/7d. Returns the violated cap
 * code if the next outbound would breach it, otherwise null.
 */
export function checkFrequencyCap(
  activities: CloseActivity[],
  now: Date = new Date()
): "FREQUENCY_CAP_24H" | "FREQUENCY_CAP_7D" | null {
  const nowMs = now.getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  const sevenDays = 7 * oneDay;
  let in24h = 0;
  let in7d = 0;
  for (const a of activities) {
    if (a.direction !== "outbound") continue;
    if (!["Email", "SMS"].includes(a._type)) continue;
    const dt = new Date(a.date_created).getTime();
    if (nowMs - dt <= oneDay) in24h += 1;
    if (nowMs - dt <= sevenDays) in7d += 1;
  }
  if (in24h >= 1) return "FREQUENCY_CAP_24H";
  if (in7d >= 4) return "FREQUENCY_CAP_7D";
  return null;
}
