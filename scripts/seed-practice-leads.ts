/**
 * Openera practice org — seed synthetic leads and rebalance ownership.
 *
 * From repo root:
 *   npx tsx scripts/seed-practice-leads.ts
 *
 * Requires `.env.local` with CLOSE_API_KEY, CLOSE_USER_ID_ANDRE, CLOSE_USER_ID_JAKE.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) {
    console.error("Missing .env.local at", p);
    process.exit(1);
  }
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  loadEnvLocal();

  const { env } = await import("../src/lib/env");
  const {
    closeListLeads,
    closeCreateLead,
    closeUpdateLead,
    closeGetLead,
    closeLogSms,
    closeLogEmail,
    closeListActivities,
  } = await import("../src/lib/close");

  const { practiceSeedTagForRun } = await import("../src/lib/practice-seed");

  if (!env.CLOSE_API_KEY || !env.CLOSE_USER_ID_ANDRE || !env.CLOSE_USER_ID_JAKE) {
    console.error("Need CLOSE_API_KEY, CLOSE_USER_ID_ANDRE, CLOSE_USER_ID_JAKE in .env.local");
    process.exit(1);
  }

  const SEED_TAG = practiceSeedTagForRun("2026-05-01");
  const rand = mulberry32(0x20260501);

  const existing = await closeListLeads({ limit: 200 });
  const existingIds = existing.map((l) => l.id);
  console.log(`Fetched ${existing.length} existing leads from Close.`);

  const FIRST = [
    "Marcus",
    "Priya",
    "Helena",
    "Jordan",
    "Diego",
    "Amelia",
    "Samuel",
    "Renee",
    "Omar",
    "Claire",
    "Leo",
    "Tasha",
    "Brian",
    "Yuki",
    "Frank",
    "Nadia",
    "Chris",
    "Sofia",
    "Victor",
    "Maya",
    "Greg",
    "Anika",
    "Paul",
    "Wendy",
    "Eric",
    "Lin",
    "Jason",
    "Brittany",
    "Kevin",
    "Adriana",
  ];
  const LAST = [
    "Abbott",
    "Bennett",
    "Castillo",
    "Dalton",
    "Esposito",
    "Fischer",
    "Garcia",
    "Hayes",
    "Ingram",
    "Jensen",
    "Kim",
    "Lowell",
    "Martinez",
    "Nguyen",
    "Okafor",
    "Patel",
    "Quinn",
    "Ruiz",
    "Singh",
    "Torres",
    "Underwood",
    "Vargas",
    "Walsh",
    "Xu",
    "Young",
    "Zhang",
    "Brooks",
    "Carver",
    "Drummond",
    "Ellison",
  ];
  const COMPANY_A = [
    "Harborlight Events",
    "Copper Kettle Catering",
    "Northwind Hospitality",
    "Silver Birch Weddings",
    "Urban Fork Co-op",
    "Beacon Hill Banquets",
    "Lakefront Gatherings",
    "Elm Street Social Club",
    "Pacific Crest Foods",
    "Granite Room Hospitality",
  ];
  const COMPANY_B = [
    "Sunrise Gala Group",
    "Metro Taste Labs",
    "Riverbend Resorts",
    "Civic Arts Collective",
    "Atlas Conference Services",
    "Wildflower Picnic Co.",
    "Summit Ridge Lodges",
    "Canvas & Fork Studios",
    "Blueprint Gatherings LLC",
    "Trailhead Catering Guild",
  ];
  const CITIES = [
    ["Austin", "TX", "78701"],
    ["Denver", "CO", "80202"],
    ["Chicago", "IL", "60601"],
    ["Portland", "OR", "97205"],
    ["Nashville", "TN", "37203"],
    ["Seattle", "WA", "98101"],
    ["Miami", "FL", "33131"],
    ["Boston", "MA", "02108"],
    ["Phoenix", "AZ", "85004"],
    ["Atlanta", "GA", "30303"],
  ];
  const TITLE = [
    "Director of Operations",
    "VP Events",
    "Wedding Planner",
    "Facilities Manager",
    "Executive Assistant",
    "Marketing Lead",
    "General Manager",
    "Procurement",
  ];

  const newIds: string[] = [];

  for (let i = 0; i < 50; i++) {
    const fn = FIRST[i % FIRST.length];
    const ln = LAST[(i * 3 + 7) % LAST.length];
    const co =
      i % 2 === 0 ? COMPANY_A[i % COMPANY_A.length] : COMPANY_B[i % COMPANY_B.length];
    const [city, state, zip] = CITIES[i % CITIES.length];
    const phone = `+1555010${String(100 + i).padStart(3, "0")}`;
    const emailSlug = `${fn}.${ln}${i}`
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, "");
    const email = `practice.${emailSlug}@example.com`;
    const title = TITLE[i % TITLE.length];
    const headcount = 40 + ((i * 17) % 420);
    const budgetHint = ["4–6k", "8–12k", "15–22k", "25–40k"][i % 4];
    const eventTypes = [
      "corporate summit",
      "nonprofit gala",
      "product launch",
      "family-style wedding reception",
      "VIP donor dinner",
    ][i % 5];

    const description = [
      `${SEED_TAG}`,
      `Interested in ${eventTypes} for Q3–Q4.`,
      `Rough guest count ${headcount}; tasting budget ballpark ${budgetHint} (practice data).`,
      `Decision timeline: ${3 + (i % 5)}–${6 + (i % 4)} weeks. Dietary: ${
        i % 3 === 0 ? "kosher options" : i % 3 === 1 ? "nut-aware kitchen" : "vegan-forward menu requested"
      }.`,
      `Notes: referred by ${["peer venue", "LinkedIn", "walk-in tour", "last year's gala"][i % 4]}; parking for ${
        i % 2 ? "coach bus" : "valet"
      } preferred.`,
    ].join("\n");

    const created = await closeCreateLead({
      name: `${co} — ${fn} ${ln}`,
      description,
      url: `https://example.com/org/${i + 1}`,
      contacts: [
        {
          name: `${fn} ${ln}`,
          title,
          emails: [{ email, type: "office" }],
          phones: [{ phone, type: "office" }],
        },
      ],
      addresses: [
        {
          label: "business",
          address_1: `${500 + i} ${["River", "Maple", "Cedar", "Pine"][i % 4]} ${["Rd", "Ave", "Blvd"][i % 3]}`,
          city,
          state,
          zipcode: zip,
          country: "US",
        },
      ],
    });
    newIds.push(created.id);
    process.stdout.write(`Created ${i + 1}/50 ${created.display_name?.slice(0, 42)}...\r`);
  }
  console.log(`\nCreated ${newIds.length} new leads.`);

  const nOldAndre = Math.floor(existingIds.length / 2);
  const nNewAndre = Math.floor(newIds.length / 2);

  const shuffledOld = shuffle(existingIds, rand);
  const shuffledNew = shuffle(newIds, rand);

  const forAndre = [...shuffledOld.slice(0, nOldAndre), ...shuffledNew.slice(0, nNewAndre)];
  const forJake = [...shuffledOld.slice(nOldAndre), ...shuffledNew.slice(nNewAndre)];

  console.log(
    `Assigning: Andre ${forAndre.length} (${nOldAndre} legacy + ${nNewAndre} new), Jake ${forJake.length} (${existingIds.length - nOldAndre} legacy + ${newIds.length - nNewAndre} new).`
  );

  const totalAssign = forAndre.length + forJake.length;
  let done = 0;
  for (const id of forAndre) {
    await closeUpdateLead(id, { user_id: env.CLOSE_USER_ID_ANDRE });
    done++;
    if (done % 25 === 0) console.log(`  reassigned ${done}/${totalAssign}`);
  }
  for (const id of forJake) {
    await closeUpdateLead(id, { user_id: env.CLOSE_USER_ID_JAKE });
    done++;
    if (done % 25 === 0) console.log(`  reassigned ${done}/${totalAssign}`);
  }
  console.log(`Reassigned ${totalAssign} leads.`);

  const testLeadId = newIds[0];
  const lead = await closeGetLead(testLeadId);
  const contactId = lead.contacts?.[0]?.id;
  if (!contactId) {
    console.error("Comms probe skipped: no contact on test lead.");
    return;
  }

  const before = (await closeListActivities(testLeadId, 100)).length;

  const sms = await closeLogSms({
    lead_id: testLeadId,
    contact_id: contactId,
    text: "[Practice] Draft SMS ping — fictional 555-01xx line; no carrier send expected.",
    status: "draft",
    user_id: env.CLOSE_USER_ID_ANDRE,
  });

  const em = await closeLogEmail({
    lead_id: testLeadId,
    contact_id: contactId,
    subject: "[Practice] Draft email probe",
    body_text:
      "This is a logged draft outbound email via API (draft status). Recipient @example.com is fictional.",
    status: "draft",
    user_id: env.CLOSE_USER_ID_ANDRE,
  });

  const after = (await closeListActivities(testLeadId, 100)).length;

  console.log("\n--- Close activity probe (draft SMS + draft email) ---");
  console.log(`Lead: ${lead.display_name}`);
  console.log(`Lead id: ${testLeadId}`);
  console.log(`Activities before: ${before}, after: ${after} (expected +2)`);
  console.log(`SMS activity id: ${sms.id}`);
  console.log(`Email activity id: ${em.id}`);

  try {
    const ob = await closeLogSms({
      lead_id: testLeadId,
      contact_id: contactId,
      text: "[Practice] Outbox probe — may fail without SMS integration.",
      status: "outbox",
      user_id: env.CLOSE_USER_ID_ANDRE,
    });
    console.log(`Outbox SMS API accepted: id ${ob.id}`);
  } catch (e) {
    console.log(
      "Outbox SMS attempt:",
      e instanceof Error ? e.message : e
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
