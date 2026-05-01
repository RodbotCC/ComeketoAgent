/**
 * Lead-local timezone resolution. Used by the heartbeat send-window check.
 *
 * Strategy (highest priority first):
 *   1. Lead's address state field → IANA timezone
 *   2. Primary contact's phone number area code → US state → timezone
 *   3. Operator-machine local timezone (fallback)
 *
 * US-only for now. International leads fall back to operator-local with
 * source="fallback_operator". When a state spans multiple zones (e.g.
 * Tennessee), we pick the dominant zone — operator will see the source
 * tag and can override later.
 */

import type { CloseLead } from "./close";

export type TimezoneResolution = {
  tz: string; // IANA timezone string
  source: "address_state" | "phone_area_code" | "fallback_operator";
  detail?: string; // e.g. "TX" or "+1 415" — small breadcrumb for the report
};

// ─── State → IANA timezone (dominant zone for split states) ───────────────

const STATE_TZ: Record<string, string> = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DC: "America/New_York",
  DE: "America/New_York",
  FL: "America/New_York", // Panhandle is Central; majority Eastern
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  ID: "America/Boise", // Northern is Pacific; majority Mountain
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis", // most of state
  IA: "America/Chicago",
  KS: "America/Chicago", // 4 western counties Mountain
  KY: "America/New_York", // western half Central
  LA: "America/Chicago",
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/Detroit", // 4 UP counties Central
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  MT: "America/Denver",
  NE: "America/Chicago", // western Mountain
  NV: "America/Los_Angeles",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NY: "America/New_York",
  NC: "America/New_York",
  ND: "America/Chicago", // SW Mountain
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles", // small eastern slice Mountain
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago", // western Mountain
  TN: "America/Chicago", // eastern Eastern
  TX: "America/Chicago", // El Paso area Mountain
  UT: "America/Denver",
  VT: "America/New_York",
  VA: "America/New_York",
  WA: "America/Los_Angeles",
  WV: "America/New_York",
  WI: "America/Chicago",
  WY: "America/Denver",
  // Territories
  PR: "America/Puerto_Rico",
};

// ─── Area code → state (most populous mapping; ~300 NPAs) ────────────────
//
// We only need the state — the state→tz step handles tz. This is a
// compact list focused on populous codes; gaps fall through to operator
// local. (We're catering software, not a phone carrier.)

const AREA_CODE_STATE: Record<string, string> = {
  // Northeast
  "201": "NJ", "202": "DC", "203": "CT", "207": "ME", "212": "NY", "215": "PA",
  "216": "OH", "217": "IL", "218": "MN", "219": "IN", "220": "OH", "223": "PA",
  "224": "IL", "225": "LA", "227": "MD", "228": "MS", "229": "GA", "231": "MI",
  "234": "OH", "239": "FL", "240": "MD", "248": "MI", "251": "AL", "252": "NC",
  "253": "WA", "254": "TX", "256": "AL", "260": "IN", "262": "WI", "267": "PA",
  "269": "MI", "270": "KY", "272": "PA", "276": "VA", "281": "TX", "283": "OH",
  "301": "MD", "302": "DE", "303": "CO", "304": "WV", "305": "FL", "307": "WY",
  "308": "NE", "309": "IL", "310": "CA", "312": "IL", "313": "MI", "314": "MO",
  "315": "NY", "316": "KS", "317": "IN", "318": "LA", "319": "IA", "320": "MN",
  "321": "FL", "323": "CA", "325": "TX", "330": "OH", "331": "IL", "334": "AL",
  "336": "NC", "337": "LA", "339": "MA", "346": "TX", "347": "NY", "351": "MA",
  "352": "FL", "360": "WA", "361": "TX", "364": "KY", "380": "OH", "385": "UT",
  "386": "FL", "401": "RI", "402": "NE", "404": "GA", "405": "OK", "406": "MT",
  "407": "FL", "408": "CA", "409": "TX", "410": "MD", "412": "PA", "413": "MA",
  "414": "WI", "415": "CA", "417": "MO", "419": "OH", "423": "TN", "424": "CA",
  "425": "WA", "430": "TX", "432": "TX", "434": "VA", "435": "UT", "440": "OH",
  "442": "CA", "443": "MD", "458": "OR", "463": "IN", "469": "TX", "470": "GA",
  "475": "CT", "478": "GA", "479": "AR", "480": "AZ", "484": "PA", "501": "AR",
  "502": "KY", "503": "OR", "504": "LA", "505": "NM", "507": "MN", "508": "MA",
  "509": "WA", "510": "CA", "512": "TX", "513": "OH", "515": "IA", "516": "NY",
  "517": "MI", "518": "NY", "520": "AZ", "530": "CA", "531": "NE", "534": "WI",
  "539": "OK", "540": "VA", "541": "OR", "551": "NJ", "557": "MO", "559": "CA",
  "561": "FL", "562": "CA", "563": "IA", "564": "WA", "567": "OH", "570": "PA",
  "571": "VA", "573": "MO", "574": "IN", "575": "NM", "580": "OK", "585": "NY",
  "586": "MI", "601": "MS", "602": "AZ", "603": "NH", "605": "SD", "606": "KY",
  "607": "NY", "608": "WI", "609": "NJ", "610": "PA", "612": "MN", "614": "OH",
  "615": "TN", "616": "MI", "617": "MA", "618": "IL", "619": "CA", "620": "KS",
  "623": "AZ", "626": "CA", "628": "CA", "629": "TN", "630": "IL", "631": "NY",
  "636": "MO", "641": "IA", "646": "NY", "650": "CA", "651": "MN", "657": "CA",
  "660": "MO", "661": "CA", "662": "MS", "667": "MD", "669": "CA", "678": "GA",
  "681": "WV", "682": "TX", "701": "ND", "702": "NV", "703": "VA", "704": "NC",
  "706": "GA", "707": "CA", "708": "IL", "712": "IA", "713": "TX", "714": "CA",
  "715": "WI", "716": "NY", "717": "PA", "718": "NY", "719": "CO", "720": "CO",
  "724": "PA", "725": "NV", "727": "FL", "731": "TN", "732": "NJ", "734": "MI",
  "737": "TX", "740": "OH", "743": "NC", "747": "CA", "754": "FL", "757": "VA",
  "760": "CA", "762": "GA", "763": "MN", "765": "IN", "769": "MS", "770": "GA",
  "772": "FL", "773": "IL", "774": "MA", "775": "NV", "779": "IL", "781": "MA",
  "785": "KS", "786": "FL", "801": "UT", "802": "VT", "803": "SC", "804": "VA",
  "805": "CA", "806": "TX", "808": "HI", "810": "MI", "812": "IN", "813": "FL",
  "814": "PA", "815": "IL", "816": "MO", "817": "TX", "818": "CA", "828": "NC",
  "830": "TX", "831": "CA", "832": "TX", "843": "SC", "845": "NY", "847": "IL",
  "848": "NJ", "850": "FL", "856": "NJ", "857": "MA", "858": "CA", "859": "KY",
  "860": "CT", "862": "NJ", "863": "FL", "864": "SC", "865": "TN", "870": "AR",
  "872": "IL", "878": "PA", "901": "TN", "903": "TX", "904": "FL", "906": "MI",
  "907": "AK", "908": "NJ", "909": "CA", "910": "NC", "912": "GA", "913": "KS",
  "914": "NY", "915": "TX", "916": "CA", "917": "NY", "918": "OK", "919": "NC",
  "920": "WI", "925": "CA", "928": "AZ", "929": "NY", "930": "IN", "931": "TN",
  "934": "NY", "936": "TX", "937": "OH", "938": "AL", "940": "TX", "941": "FL",
  "947": "MI", "949": "CA", "951": "CA", "952": "MN", "954": "FL", "956": "TX",
  "959": "CT", "970": "CO", "971": "OR", "972": "TX", "973": "NJ", "978": "MA",
  "979": "TX", "980": "NC", "984": "NC", "985": "LA", "989": "MI",
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function operatorLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

/** Extract a 3-digit US area code from a phone string, or null. */
function extractAreaCode(phone: string): string | null {
  if (!phone) return null;
  // Strip everything except digits.
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  // +1 NPA NXX XXXX → 11 digits starting with 1; NPA at digits[1..4].
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1, 4);
  // 10 digits → NPA NXX XXXX
  if (digits.length === 10) return digits.slice(0, 3);
  return null;
}

/** Pull a US state code (2 letters, uppercase) from a Close address object. */
function extractStateFromAddress(addr: { state?: unknown; country?: unknown } | null | undefined): string | null {
  if (!addr) return null;
  const country = (addr.country as string | undefined) || "";
  if (country && country.toUpperCase() !== "US" && country.toLowerCase() !== "united states") {
    // Non-US — bail; we don't have a global tz table.
    return null;
  }
  const state = (addr.state as string | undefined) || "";
  if (!state) return null;
  const trimmed = state.trim().toUpperCase();
  if (trimmed.length === 2 && STATE_TZ[trimmed]) return trimmed;
  // Long-form state names (e.g. "California") — quick lookup
  const LONG_FORMS: Record<string, string> = {
    ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
    COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", FLORIDA: "FL", GEORGIA: "GA",
    HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA",
    KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD",
    MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN", MISSISSIPPI: "MS", MISSOURI: "MO",
    MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ",
    "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH",
    OKLAHOMA: "OK", OREGON: "OR", PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
    "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT",
    VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI", WYOMING: "WY",
    "DISTRICT OF COLUMBIA": "DC", "PUERTO RICO": "PR",
  };
  if (LONG_FORMS[trimmed]) return LONG_FORMS[trimmed];
  return null;
}

// ─── Resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve the lead-local IANA timezone. Returns the tz, the source we
 * derived it from, and a small detail string for the heartbeat report.
 */
export function resolveLeadTimezone(
  lead: CloseLead & { addresses?: Array<{ state?: string; country?: string }> }
): TimezoneResolution {
  // 1. Address state (any address on the lead)
  for (const addr of lead.addresses ?? []) {
    const state = extractStateFromAddress(addr);
    if (state && STATE_TZ[state]) {
      return { tz: STATE_TZ[state], source: "address_state", detail: state };
    }
  }

  // 2. Phone area code (any phone on any contact)
  for (const c of lead.contacts ?? []) {
    for (const p of c.phones ?? []) {
      const npa = extractAreaCode(p.phone);
      if (npa && AREA_CODE_STATE[npa]) {
        const state = AREA_CODE_STATE[npa];
        if (STATE_TZ[state]) {
          return { tz: STATE_TZ[state], source: "phone_area_code", detail: `+1 ${npa} → ${state}` };
        }
      }
    }
  }

  // 3. Fallback
  return { tz: operatorLocalTimezone(), source: "fallback_operator" };
}
