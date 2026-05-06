import { cache } from "react";
import {
  closeGetLeadFull,
  checkOwnershipAndStatus,
  isOwnedByAndre,
  isReplyGateActive,
  type CloseLeadFull,
  type SkipCode,
} from "@/lib/close";
import { env } from "@/lib/env";
import { snapshotIdForBox } from "@/lib/plan";
import { getLatestPlanForLead } from "@/lib/plans-db";
import { getLatestHeartbeatForLead } from "@/lib/heartbeat";
import { getSettings } from "@/lib/settings";
import { getLatestWebhookActivityForLead } from "@/lib/webhook-events";
import { buildBoxTimeline } from "@/lib/box-timeline";
import { listRecentExecutionForLead } from "@/lib/execution-audit";
import { listIntakeArtifactsForLead } from "@/lib/intake-artifacts";
import { listAssetsForLead } from "@/lib/assets";

export type GateBadge = { label: string; tone: "ok" | "warn" | "block" };

export function gateBadgeLabel(skip: SkipCode | null): GateBadge {
  if (!skip) return { label: "OK to act", tone: "ok" };
  if (skip === "OWNERSHIP") return { label: "[OWNERSHIP] not Andre's lead", tone: "block" };
  if (skip === "STATUS_WON") return { label: "[STATUS_WON] no-touch", tone: "block" };
  if (skip === "STATUS_LOST") return { label: "[STATUS_LOST] no-touch", tone: "block" };
  return { label: `[${skip}]`, tone: "warn" };
}

export type LeadBoxPageData = {
  leadId: string;
  box: CloseLeadFull;
  plan: Awaited<ReturnType<typeof getLatestPlanForLead>>;
  /**
   * Set when getLatestPlanForLead threw. Lets PlanSection distinguish
   * "this lead has no plan" (plan === null && planError === null — show
   * Generate button) from "the plan exists but we couldn't load it"
   * (plan === null && planError !== null — show fetch-failed UI).
   */
  planError: string | null;
  latestHeartbeat: Awaited<ReturnType<typeof getLatestHeartbeatForLead>>;
  settings: Awaited<ReturnType<typeof getSettings>>;
  whLatestAt: string | null;
  skip: SkipCode | null;
  gate: GateBadge;
  planEligible: boolean;
  currentSnapshotId: string;
  replyGate: boolean;
  planFresh: boolean;
  cycleDayDisplay: string;
  timelineItems: ReturnType<typeof buildBoxTimeline>;
  execRows: Awaited<ReturnType<typeof listRecentExecutionForLead>>;
  intakeArtifacts: Awaited<ReturnType<typeof listIntakeArtifactsForLead>>;
  assets: Awaited<ReturnType<typeof listAssetsForLead>>;
  customFields: { key: string; value: unknown }[];
  sortedActivities: CloseLeadFull["activities"];
  lastInbound: CloseLeadFull["activities"][number] | undefined;
  lastOutbound: CloseLeadFull["activities"][number] | undefined;
  counts: Record<string, number>;
  ownerName: string;
};

export type LeadBoxLoadFailure = { error: string; box: null };

async function loadBox(leadId: string): Promise<{ box: CloseLeadFull | null; error: string | null }> {
  try {
    const box = await closeGetLeadFull(leadId);
    return { box, error: null };
  } catch (err) {
    return { box: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Per-request cached bundle for `/lead/[id]/*` so Plan / Box / Heartbeat tabs
 * dedupe fetches when navigating between routes.
 */
export const loadLeadBoxPageData = cache(
  async (leadId: string): Promise<LeadBoxPageData | LeadBoxLoadFailure> => {
    const { box, error } = await loadBox(leadId);
    if (error || !box) {
      return { error: error || "(unknown)", box: null };
    }

    let plan: Awaited<ReturnType<typeof getLatestPlanForLead>> = null;
    let planError: string | null = null;
    try {
      plan = await getLatestPlanForLead(leadId);
    } catch (err) {
      planError = err instanceof Error ? err.message : String(err);
      console.error(`[load-lead-box] getLatestPlanForLead(${leadId}) failed:`, planError);
    }
    const latestHeartbeat = plan
      ? await getLatestHeartbeatForLead(leadId).catch(() => null)
      : null;
    const settings = await getSettings();
    const whActivity = await getLatestWebhookActivityForLead(leadId).catch(() => ({
      latestReceivedAt: null as string | null,
      count24h: 0,
    }));
    const whLatestAt = whActivity.latestReceivedAt;

    const { lead, activities } = box;
    const leadAny = lead as typeof lead & { user_id?: string; user_name?: string };
    const skip = checkOwnershipAndStatus(leadAny, env.CLOSE_USER_ID_ANDRE);
    const gate = gateBadgeLabel(skip);
    const currentSnapshotId = snapshotIdForBox(box);
    const planEligible = !skip;

    const isAndre = isOwnedByAndre(leadAny);
    const isJake = !!(env.CLOSE_USER_ID_JAKE && leadAny.user_id === env.CLOSE_USER_ID_JAKE);
    const ownerName = isAndre ? "Andre" : isJake ? "Jake" : leadAny.user_name || "—";

    const sortedActivities = [...activities].sort(
      (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
    );
    const lastInbound = sortedActivities.find((a) => a.direction === "inbound");
    const lastOutbound = sortedActivities.find((a) => a.direction === "outbound");

    const counts: Record<string, number> = {};
    for (const a of activities) counts[a._type] = (counts[a._type] || 0) + 1;

    const replyGate = isReplyGateActive(activities);
    const planFresh = plan ? currentSnapshotId === plan.based_on_snapshot_id : true;
    const cycleDayDisplay = plan
      ? `${plan.days.filter((d) => d.approval_status === "sent").length} sent / ${plan.days.length} days`
      : "—";

    const timelineItems = buildBoxTimeline({
      box,
      planDays: plan?.days ?? [],
      cycleStartedAt: plan?.cycle_started_at ?? lead.date_created ?? new Date().toISOString(),
    });

    let execRows: Awaited<ReturnType<typeof listRecentExecutionForLead>> = [];
    try {
      execRows = await listRecentExecutionForLead(leadId, 10);
    } catch {
      execRows = [];
    }

    let intakeArtifacts: Awaited<ReturnType<typeof listIntakeArtifactsForLead>> = [];
    try {
      intakeArtifacts = await listIntakeArtifactsForLead(leadId);
    } catch {
      intakeArtifacts = [];
    }

    let assets: Awaited<ReturnType<typeof listAssetsForLead>> = [];
    try {
      assets = await listAssetsForLead(leadId);
    } catch {
      assets = [];
    }

    const customFields = Object.entries(lead as unknown as Record<string, unknown>)
      .filter(([k]) => k.startsWith("custom."))
      .map(([k, v]) => ({ key: k.replace("custom.", ""), value: v }));

    return {
      leadId,
      box,
      plan,
      planError,
      latestHeartbeat,
      settings,
      whLatestAt,
      skip,
      gate,
      planEligible,
      currentSnapshotId,
      replyGate,
      planFresh,
      cycleDayDisplay,
      timelineItems,
      execRows,
      intakeArtifacts,
      assets,
      customFields,
      sortedActivities,
      lastInbound,
      lastOutbound,
      counts,
      ownerName,
    };
  }
);

export function heartbeatLatestFromRow(
  latestHeartbeat: LeadBoxPageData["latestHeartbeat"]
) {
  return latestHeartbeat
    ? {
        ran_at: String(latestHeartbeat.ran_at),
        actions_eligible: Number(latestHeartbeat.actions_eligible || 0),
        actions_fired: Number(latestHeartbeat.actions_fired || 0),
        actions_skipped: Number(latestHeartbeat.actions_skipped || 0),
        skip_breakdown: (latestHeartbeat.skip_breakdown as Record<string, number>) || {},
        snapshot_match: Boolean(latestHeartbeat.snapshot_match),
        plan_was_stale: Boolean(latestHeartbeat.plan_was_stale),
      }
    : null;
}
