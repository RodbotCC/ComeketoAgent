/**
 * Auxiliary Agents — the four-dot fleet.
 *
 * The wordmark has four dots (brown / gold / sage / lavender). The main agent
 * (lavender, by convention) is the chat brain — does the heavy lifting,
 * handles tool use, executes Close writes. The other three slots are
 * AUXILIARIES: small specialized agents that ride alongside the main one,
 * each given a role + a small set of capabilities.
 *
 * Capabilities are mutex-aware: certain capabilities can only be assigned to
 * one slot at a time (e.g. only one TTS narrator, only one prompt-rewriter
 * upstream of the main agent, only one ledger of truth).
 *
 * Configuration lives in `.cmk-auxiliaries.json` (gitignored, file-backed
 * like the main settings). The Auxiliaries page at `/settings/auxiliaries`
 * lets the operator pick which slot does what.
 *
 * This file ships the FRAME — capability catalog, slot config, mutex rules,
 * and persistence. Runtime wire-in happens per capability (the prompt-rewriter
 * is the first one wired into `/api/chat`).
 */

import { promises as fs } from "node:fs";
import path from "node:path";

/* ========== Slot identity (the four dots) ========== */

export const SLOT_KEYS = ["brown", "gold", "sage", "lavender"] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];

export const SLOT_PALETTE: Record<SlotKey, { hex: string; label: string }> = {
  brown:    { hex: "#8B7355", label: "Brown"    },
  gold:     { hex: "#A89968", label: "Gold"     },
  sage:     { hex: "#6B8E5A", label: "Sage"     },
  lavender: { hex: "#9B8FB8", label: "Lavender" },
};

/* ========== OpenAI key targeting ========== */

export const KEY_TARGETS = ["main", "brown", "gold", "sage"] as const;
export type KeyTarget = (typeof KEY_TARGETS)[number];

export const KEY_TARGET_LABEL: Record<KeyTarget, string> = {
  main:  "OPENAI_API_KEY (main)",
  brown: "OPENAI_API_KEY_AUX_BROWN",
  gold:  "OPENAI_API_KEY_AUX_GOLD",
  sage:  "OPENAI_API_KEY_AUX_SAGE",
};

/* ========== Capability catalog ==========
   Each capability is a small specialized job an auxiliary can perform.
   `mutex_group` means two slots can't both pick a capability in the same
   group (e.g. two TTS voices fighting). `wired` flags whether the runtime
   wire-in exists today. */

export type CapabilityId =
  | "prompt_rewriter"
  | "post_turn_reflector"
  | "screen_observer"
  | "tts_narrator"
  | "voice_lint_buddy"
  | "continuity_ledger"
  | "open_problems_ledger"
  | "slack_mirror"
  | "github_mirror"
  | "code_indexer";

type CapabilityDef = {
  id: CapabilityId;
  label: string;
  blurb: string;
  /** Capabilities in the same mutex group can only be picked by one slot total. */
  mutex_group: string | null;
  /** Whether the runtime wiring exists today. */
  wired: boolean;
};

export const CAPABILITIES: CapabilityDef[] = [
  {
    id: "prompt_rewriter",
    label: "Prompt rewriter",
    blurb:
      "Intercepts every operator message before the main agent sees it and tightens it — clearer ask, fewer ambiguities, sharper verbs. Operator can preview the rewritten prompt or auto-route.",
    mutex_group: "upstream",
    wired: true,
  },
  {
    id: "post_turn_reflector",
    label: "Post-turn reflector",
    blurb:
      "After every assistant turn, writes a short reflection — what got done, what didn't, what to ask next. Returned as `aux_reflection` on the chat response so the UI can surface it under the turn.",
    mutex_group: null,
    wired: true,
  },
  {
    id: "screen_observer",
    label: "Screen observer",
    blurb:
      "Watches the operator's active surface (current page + last actions) and posts a quiet 'you might want to…' nudge when it spots a missed move. (Spec pending — what does it watch, how often.)",
    mutex_group: null,
    wired: false,
  },
  {
    id: "tts_narrator",
    label: "TTS narrator",
    blurb:
      "Speaks the assistant's reply via OpenAI's gpt-4o-mini-tts. Returns base64 mp3 as `aux_audio` on the chat response — client plays it inline. Only one slot can hold the mic.",
    mutex_group: "voice",
    wired: true,
  },
  {
    id: "voice_lint_buddy",
    label: "Voice lint buddy",
    blurb:
      "Intercepts every `close_log_email_activity` / `close_log_sms_activity` body, runs NEPQ voice + draft-lint, and rewrites just enough to clear blocking violations before the activity hits Close.",
    mutex_group: "voice_lint",
    wired: true,
  },
  {
    id: "continuity_ledger",
    label: "Continuity ledger",
    blurb:
      "Appends a timestamped record of every assistant turn (user excerpt, agent excerpt, tool count) to `.cmk-continuity.jsonl` — institutional memory across sessions.",
    mutex_group: "ledger",
    wired: true,
  },
  {
    id: "open_problems_ledger",
    label: "Open-problems ledger",
    blurb:
      "Captures every chat error + tool failure to `.cmk-open-problems.jsonl` so the daily punch-list never goes silent. Surface in /heartbeat or /console next round.",
    mutex_group: "ledger",
    wired: true,
  },
  {
    id: "slack_mirror",
    label: "Slack mirror",
    blurb:
      "POSTs a one-line summary to `SLACK_WEBHOOK_URL` after every assistant turn (thread id, tool count, user excerpt, error if any). Set the env var to enable.",
    mutex_group: null,
    wired: true,
  },
  {
    id: "github_mirror",
    label: "GitHub mirror",
    blurb:
      "Appends a JSON line to a versioned audit file in the GitHub repo (`GITHUB_AUDIT_REPO`/`GITHUB_AUDIT_PATH`, default `RodbotCC/ComeketoAgent` `_audit/auxiliary-events.jsonl`). One commit per turn.",
    mutex_group: null,
    wired: true,
  },
  {
    id: "code_indexer",
    label: "Code indexer",
    blurb:
      "After every code-touching action, indexes the change into a searchable map. (Spec pending — needs a definition of 'code-touching action' on this app's surface.)",
    mutex_group: null,
    wired: false,
  },
];

export const CAPABILITY_BY_ID: Record<CapabilityId, CapabilityDef> = Object.fromEntries(
  CAPABILITIES.map((c) => [c.id, c])
) as Record<CapabilityId, CapabilityDef>;

/* ========== Slot config + persistence ========== */

export type SlotConfig = {
  key: SlotKey;
  /** Operator-supplied display name for the slot ("Reflector", "Slack", "Hairbrush"). */
  display_name: string;
  /** Operator-supplied one-line role description. */
  role: string;
  /** Capabilities assigned to this slot. */
  capabilities: CapabilityId[];
  /** Which OpenAI key powers this slot. */
  key_target: KeyTarget;
  /** When false, the slot is configured but not running. */
  enabled: boolean;
};

export type AuxiliariesConfig = {
  /** Master switch — turns the whole fleet on/off. */
  engine_enabled: boolean;
  slots: Record<SlotKey, SlotConfig>;
};

export const DEFAULT_AUX_CONFIG: AuxiliariesConfig = {
  engine_enabled: false,
  slots: {
    brown:    { key: "brown",    display_name: "",  role: "", capabilities: [], key_target: "brown", enabled: false },
    gold:     { key: "gold",     display_name: "",  role: "", capabilities: [], key_target: "gold",  enabled: false },
    sage:     { key: "sage",     display_name: "",  role: "", capabilities: [], key_target: "sage",  enabled: false },
    lavender: { key: "lavender", display_name: "",  role: "", capabilities: [], key_target: "main",  enabled: false },
  },
};

const AUX_PATH = path.join(process.cwd(), ".cmk-auxiliaries.json");

function isValidCapability(id: unknown): id is CapabilityId {
  return typeof id === "string" && id in CAPABILITY_BY_ID;
}
function isValidKeyTarget(t: unknown): t is KeyTarget {
  return typeof t === "string" && (KEY_TARGETS as readonly string[]).includes(t);
}

function sanitizeSlot(raw: Partial<SlotConfig> | undefined, key: SlotKey): SlotConfig {
  const def = DEFAULT_AUX_CONFIG.slots[key];
  return {
    key,
    display_name: typeof raw?.display_name === "string" ? raw.display_name.slice(0, 60) : def.display_name,
    role: typeof raw?.role === "string" ? raw.role.slice(0, 240) : def.role,
    capabilities: Array.isArray(raw?.capabilities) ? raw.capabilities.filter(isValidCapability) : def.capabilities,
    key_target: isValidKeyTarget(raw?.key_target) ? raw.key_target : def.key_target,
    enabled: typeof raw?.enabled === "boolean" ? raw.enabled : def.enabled,
  };
}

export async function getAuxiliaries(): Promise<AuxiliariesConfig> {
  try {
    const raw = await fs.readFile(AUX_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AuxiliariesConfig>;
    return {
      engine_enabled:
        typeof parsed.engine_enabled === "boolean"
          ? parsed.engine_enabled
          : DEFAULT_AUX_CONFIG.engine_enabled,
      slots: {
        brown:    sanitizeSlot(parsed.slots?.brown,    "brown"),
        gold:     sanitizeSlot(parsed.slots?.gold,     "gold"),
        sage:     sanitizeSlot(parsed.slots?.sage,     "sage"),
        lavender: sanitizeSlot(parsed.slots?.lavender, "lavender"),
      },
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_AUX_CONFIG)) as AuxiliariesConfig;
  }
}

export async function setAuxiliaries(next: AuxiliariesConfig): Promise<void> {
  await fs.writeFile(AUX_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
}

/* ========== Mutex resolution ==========
   Given the current config + a target slot, return which capabilities are
   "locked" (already taken by another slot in a mutex group). */

export type CapabilityAvailability = {
  id: CapabilityId;
  /** False when another slot already claimed a mutex-grouped slot-mate. */
  available: boolean;
  /** The slot key holding the mutex if locked. */
  locked_by?: SlotKey;
};

export function capabilityAvailability(
  config: AuxiliariesConfig,
  forSlot: SlotKey
): CapabilityAvailability[] {
  return CAPABILITIES.map((cap) => {
    if (!cap.mutex_group) return { id: cap.id, available: true };
    // Check if any OTHER slot already holds this mutex group.
    for (const k of SLOT_KEYS) {
      if (k === forSlot) continue;
      const other = config.slots[k];
      if (!other) continue;
      const conflict = other.capabilities.some(
        (c) => CAPABILITY_BY_ID[c]?.mutex_group === cap.mutex_group
      );
      if (conflict) {
        return { id: cap.id, available: false, locked_by: k };
      }
    }
    return { id: cap.id, available: true };
  });
}

/** Return the OpenAI API key for a given target, or empty string if missing. */
export function resolveKeyForTarget(target: KeyTarget, env: Record<string, string>): string {
  switch (target) {
    case "main":  return env.OPENAI_API_KEY ?? "";
    case "brown": return env.OPENAI_API_KEY_AUX_BROWN ?? "";
    case "gold":  return env.OPENAI_API_KEY_AUX_GOLD ?? "";
    case "sage":  return env.OPENAI_API_KEY_AUX_SAGE ?? "";
  }
}

/** Find the (first) slot with a given capability assigned, if any. */
export function findSlotWithCapability(
  config: AuxiliariesConfig,
  cap: CapabilityId
): SlotConfig | null {
  if (!config.engine_enabled) return null;
  for (const k of SLOT_KEYS) {
    const slot = config.slots[k];
    if (slot.enabled && slot.capabilities.includes(cap)) return slot;
  }
  return null;
}
