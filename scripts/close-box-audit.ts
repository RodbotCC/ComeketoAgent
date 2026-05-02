/**
 * Hydrate one lead Box (same fan-out as the app) and print JSON summary.
 * Usage: npx tsx scripts/close-box-audit.ts <lead_id>
 */
import { closeGetLeadFull } from "../src/lib/close";
import { snapshotIdForBox } from "../src/lib/plan";

const leadId = process.argv[2];
if (!leadId || !leadId.startsWith("lead_")) {
  console.error("Usage: npx tsx scripts/close-box-audit.ts lead_xxxxx");
  process.exit(1);
}

async function main() {
  const box = await closeGetLeadFull(leadId);
  const snap = snapshotIdForBox(box);
  console.log(
    JSON.stringify(
      {
        lead_id: box.lead.id,
        display_name: box.lead.display_name,
        status: box.lead.status_label,
        activities: box.activities.length,
        email_threads: box.email_threads.length,
        subscriptions: box.subscriptions.length,
        snapshot_id: snap,
        fetched_at: box.fetched_at,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
