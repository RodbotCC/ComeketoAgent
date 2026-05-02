/**
 * Auxiliary runtime — every capability defined in `auxiliaries.ts` has its
 * actual server-side implementation here. Each runner is a pure function that
 * (a) checks if a slot owns the capability, (b) does its job, (c) never
 * throws into the caller. The chat route + heartbeat call these at the right
 * hooks; failures inside an auxiliary must never block the main agent.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { env } from "./env";
import {
  findSlotWithCapability,
  resolveKeyForTarget,
  type AuxiliariesConfig,
  type SlotConfig,
} from "./auxiliaries";

/* ========== Generic helpers ========== */

const CONTINUITY_PATH = path.join(process.cwd(), ".cmk-continuity.jsonl");
const OPEN_PROBLEMS_PATH = path.join(process.cwd(), ".cmk-open-problems.jsonl");

async function appendJsonl(filepath: string, entry: Record<string, unknown>) {
  try {
    await fs.appendFile(
      filepath,
      JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n",
      "utf-8"
    );
  } catch {
    /* swallow */
  }
}

function envAsRecord(): Record<string, string> {
  // OpenAI key resolution wants a plain record. Cast carefully.
  return env as unknown as Record<string, string>;
}

/* ========== Capability runners ========== */

/** Tighten the operator's prompt before the main agent sees it. */
export async function runPromptRewriter(
  config: AuxiliariesConfig,
  userText: string,
  fallbackModel: string
): Promise<{ rewritten: string; slot: string } | null> {
  const slot = findSlotWithCapability(config, "prompt_rewriter");
  if (!slot || !userText) return null;
  const key = resolveKeyForTarget(slot.key_target, envAsRecord());
  if (!key) return null;
  try {
    const client = new OpenAI({ apiKey: key });
    const r = await client.responses.create({
      model: fallbackModel,
      input: [
        {
          role: "developer",
          content:
            "You are a prompt-tightener for a CRM operator agent. Rewrite the operator's message in 1–2 sentences max — sharpen verbs, name the lead/asset explicitly, preserve every entity (lead names, IDs, numbers, dates). Do NOT add new asks. Do NOT explain. Output only the rewritten message.",
        },
        { role: "user", content: userText },
      ] as unknown as Parameters<typeof client.responses.create>[0]["input"],
    });
    const out = (r.output_text ?? "").trim();
    if (!out || out === userText) return null;
    return { rewritten: out, slot: slot.key };
  } catch {
    return null;
  }
}

/** After every assistant turn, the reflector slot writes a brief italic note
 *  appended to the assistant's response so the operator sees the second
 *  voice without needing a separate UI surface. */
export async function runPostTurnReflector(
  config: AuxiliariesConfig,
  prompt: string,
  response: string,
  fallbackModel: string
): Promise<{ note: string; slot: string } | null> {
  const slot = findSlotWithCapability(config, "post_turn_reflector");
  if (!slot || !response) return null;
  const key = resolveKeyForTarget(slot.key_target, envAsRecord());
  if (!key) return null;
  try {
    const client = new OpenAI({ apiKey: key });
    const r = await client.responses.create({
      model: fallbackModel,
      input: [
        {
          role: "developer",
          content:
            "You are the reflector slot riding alongside a CRM agent. Read the operator's prompt and the agent's response. Write ONE short italic note (≤ 25 words) — what worked, what's still open, or what to ask next. No flattery. No restating. Output the bare sentence, no markdown framing.",
        },
        {
          role: "user",
          content: `OPERATOR ASKED:\n${prompt}\n\nAGENT REPLIED:\n${response.slice(0, 4000)}`,
        },
      ] as unknown as Parameters<typeof client.responses.create>[0]["input"],
    });
    const out = (r.output_text ?? "").trim();
    if (!out) return null;
    return { note: out, slot: slot.key };
  } catch {
    return null;
  }
}

/** Run an outbound email/SMS body through NEPQ + draft-lint, and if blocking
 *  violations exist, send through the auxiliary to rewrite just enough to
 *  clear them. Returns null when no rewrite needed. */
export async function runVoiceLintBuddy(
  config: AuxiliariesConfig,
  channel: "email" | "sms",
  body: string,
  fallbackModel: string
): Promise<{ rewritten: string; slot: string } | null> {
  const slot = findSlotWithCapability(config, "voice_lint_buddy");
  if (!slot || !body) return null;
  const key = resolveKeyForTarget(slot.key_target, envAsRecord());
  if (!key) return null;

  // Lazy-import to avoid pulling lint into routes that don't need it.
  const [{ validateNepqVoice, hasBlockingViolation }, { lintOutboundDraft, draftLintHasBlocking }] =
    await Promise.all([import("./nepq"), import("./draft-lint")]);
  const voice = validateNepqVoice(body);
  const lint = lintOutboundDraft({ channel, text: body });
  const blocking = hasBlockingViolation(voice) || draftLintHasBlocking(lint);
  if (!blocking) return null;

  try {
    const client = new OpenAI({ apiKey: key });
    const r = await client.responses.create({
      model: fallbackModel,
      input: [
        {
          role: "developer",
          content:
            "You are the voice-lint buddy for a NEPQ-style sales agent. Rewrite the draft so it passes our voice + draft-lint rules. Avoid: fake warmth, 'hope this finds you well', circle-back/touching-base, exclamation overuse, generic synergy language. Keep: the actual ask, every entity, the tone. Output only the rewrite.",
        },
        {
          role: "user",
          content: `CHANNEL: ${channel}\n\nDRAFT:\n${body}\n\nLINT FINDINGS:\n${[
            ...voice.map((v) => `voice: ${v.code} — ${v.matched}`),
            ...lint.map((l) => `lint: ${l.code} — ${l.message}`),
          ].join("\n")}`,
        },
      ] as unknown as Parameters<typeof client.responses.create>[0]["input"],
    });
    const out = (r.output_text ?? "").trim();
    if (!out || out === body) return null;
    return { rewritten: out, slot: slot.key };
  } catch {
    return null;
  }
}

/** Append a turn record to the operator's continuity ledger. */
export async function logContinuity(
  config: AuxiliariesConfig,
  entry: { thread_id: string; user: string; agent: string; tools_used: number }
): Promise<void> {
  const slot = findSlotWithCapability(config, "continuity_ledger");
  if (!slot) return;
  await appendJsonl(CONTINUITY_PATH, { kind: "turn", slot: slot.key, ...entry });
}

/** Append a problem to the open-problems ledger. Called when something
 *  fails or skips in a way that's worth surfacing as a punch-list item. */
export async function logOpenProblem(
  config: AuxiliariesConfig,
  entry: { kind: string; lead_id?: string; thread_id?: string; detail: string }
): Promise<void> {
  const slot = findSlotWithCapability(config, "open_problems_ledger");
  if (!slot) return;
  await appendJsonl(OPEN_PROBLEMS_PATH, { slot: slot.key, ...entry });
}

/** Mirror an event line to Slack via the operator's webhook URL. */
export async function mirrorToSlack(
  config: AuxiliariesConfig,
  text: string
): Promise<void> {
  const slot = findSlotWithCapability(config, "slack_mirror");
  if (!slot) return;
  if (!env.SLACK_WEBHOOK_URL) return;
  try {
    await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    /* swallow */
  }
}

/** Mirror an event line to GitHub by appending to a JSONL file in the
 *  audit repo. Uses the existing GITHUB_PAT + Contents API. */
export async function mirrorToGitHub(
  config: AuxiliariesConfig,
  entry: Record<string, unknown>
): Promise<void> {
  const slot = findSlotWithCapability(config, "github_mirror");
  if (!slot) return;
  if (!env.GITHUB_PAT) return;
  if (!env.GITHUB_AUDIT_REPO) return;

  const [owner, repo] = env.GITHUB_AUDIT_REPO.split("/");
  if (!owner || !repo) return;
  const filepath = env.GITHUB_AUDIT_PATH || "_audit/auxiliary-events.jsonl";

  try {
    // Octokit is heavy; lazy-load.
    const { Octokit } = await import("octokit");
    const octo = new Octokit({ auth: env.GITHUB_PAT });
    // 1) Try to read the existing file (if any) to get its sha + content.
    let existing = "";
    let sha: string | undefined;
    try {
      const r = await octo.rest.repos.getContent({ owner, repo, path: filepath });
      const data = r.data as { content?: string; encoding?: string; sha?: string };
      if (data && typeof data === "object" && data.content && data.encoding === "base64") {
        existing = Buffer.from(data.content, "base64").toString("utf-8");
        sha = data.sha;
      }
    } catch {
      /* file doesn't exist yet — first write creates it */
    }
    const next = existing + JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n";
    await octo.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filepath,
      message: `chore(audit): auxiliary event @ ${new Date().toISOString()}`,
      content: Buffer.from(next, "utf-8").toString("base64"),
      sha,
      branch: "main",
    });
  } catch {
    /* swallow — GitHub mirror failures are non-fatal */
  }
}

/** Generate TTS audio for a piece of text via OpenAI's TTS API. Returns
 *  base64 audio + mime so the client can play it inline. The chat panel
 *  surfaces this when the slot has tts_narrator AND a turn produced text
 *  worth narrating. Client UI plays the resulting blob. */
export async function runTtsNarrator(
  config: AuxiliariesConfig,
  text: string
): Promise<{ audio_b64: string; mime: string; slot: string } | null> {
  const slot = findSlotWithCapability(config, "tts_narrator");
  if (!slot || !text) return null;
  const key = resolveKeyForTarget(slot.key_target, envAsRecord());
  if (!key) return null;

  // Cap the text — TTS gets expensive fast, and the operator wants snippets
  // not novels.
  const clipped = text.length > 800 ? text.slice(0, 800) : text;

  try {
    const client = new OpenAI({ apiKey: key });
    const speech = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: clipped,
      // mp3 is small + plays in <audio> universally.
      response_format: "mp3",
    });
    const buf = Buffer.from(await speech.arrayBuffer());
    return { audio_b64: buf.toString("base64"), mime: "audio/mpeg", slot: slot.key };
  } catch {
    return null;
  }
}

/* ========== Slot-introspection helper ========== */

export function slotByKey(config: AuxiliariesConfig, key: string): SlotConfig | null {
  if (key === "brown" || key === "gold" || key === "sage" || key === "lavender") {
    return config.slots[key];
  }
  return null;
}
