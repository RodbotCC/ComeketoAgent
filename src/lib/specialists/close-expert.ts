import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";

const ROOT = path.join(process.cwd(), "Close Expert");
const ROUTER_PATH = path.join(ROOT, "ROUTER.json");
const SLUG_INDEX_PATH = path.join(ROOT, "slug_index.json");

type TopicId = string;

type Router = {
  _agent_instructions?: string;
  topic_hints?: Record<TopicId, string>;
  topic_files?: Record<TopicId, string>;
};

type SlugEntry = {
  slug: string;
  title: string;
  topics?: string[];
  body_file?: string;
  excerpt?: string;
  url?: string;
};

type SlugIndex = {
  slugs?: SlugEntry[];
};

type TopicArticle = {
  slug?: string;
  title?: string;
  url?: string;
  body_file?: string;
  excerpt?: string;
  keywords?: string[];
};

type TopicFile = {
  topic_id: string;
  article_count?: number;
  articles?: TopicArticle[];
};

export type CloseExpertSource = {
  title: string;
  url?: string;
  topic?: string;
  slug?: string;
};

export type CloseExpertResult = {
  answer: string;
  sources: CloseExpertSource[];
  routed_topics: string[];
};

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_ -]+/g, " ")
    .split(/\s+/)
    .filter((x) => x.length >= 3);
}

function scoreText(queryTokens: string[], text: string): number {
  const hay = text.toLowerCase();
  let score = 0;
  for (const t of queryTokens) {
    if (!hay.includes(t)) continue;
    score += t.length > 5 ? 3 : 1;
  }
  return score;
}

async function readJson<T>(file: string): Promise<T> {
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as T;
}

async function maybeReadBody(bodyFile?: string): Promise<string> {
  if (!bodyFile) return "";
  const candidates = [
    path.join(process.cwd(), bodyFile),
    path.join(ROOT, bodyFile),
    path.join(ROOT, "..", bodyFile),
  ];
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    const raw = await readFile(c, "utf8");
    return raw.slice(0, 6_000);
  }
  return "";
}

async function loadTopic(topicId: string): Promise<TopicFile | null> {
  const file = path.join(ROOT, "topics", `${topicId}.json`);
  if (!existsSync(file)) return null;
  return readJson<TopicFile>(file);
}

async function buildCloseExpertContext(question: string): Promise<{
  context: string;
  sources: CloseExpertSource[];
  routed_topics: string[];
}> {
  const router = await readJson<Router>(ROUTER_PATH);
  const slugIndex = await readJson<SlugIndex>(SLUG_INDEX_PATH);
  const tokens = tokenize(question);

  const topicScores = Object.entries(router.topic_hints ?? {})
    .map(([topic, hint]) => ({
      topic,
      score: scoreText(tokens, `${topic} ${hint}`),
    }))
    .sort((a, b) => b.score - a.score);

  const slugScores = (slugIndex.slugs ?? [])
    .map((s) => ({
      entry: s,
      score: scoreText(tokens, `${s.title} ${s.slug} ${(s.topics ?? []).join(" ")} ${s.excerpt ?? ""}`),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const routed = new Set<string>();
  for (const x of topicScores.slice(0, 4)) {
    if (x.score > 0) routed.add(x.topic);
  }
  for (const x of slugScores.slice(0, 8)) {
    for (const t of x.entry.topics ?? []) routed.add(t);
  }
  if (routed.size === 0) {
    routed.add("general_reference");
    routed.add("integrations");
    routed.add("leads_contacts_crm_core");
  }

  const articles = new Map<string, TopicArticle & { topic?: string; body?: string }>();

  for (const topic of Array.from(routed).slice(0, 6)) {
    const topicFile = await loadTopic(topic);
    for (const a of topicFile?.articles ?? []) {
      const key = a.slug || a.title || JSON.stringify(a).slice(0, 80);
      const score = scoreText(tokens, `${a.title ?? ""} ${a.slug ?? ""} ${a.excerpt ?? ""} ${(a.keywords ?? []).join(" ")}`);
      if (score > 0 || articles.size < 8) {
        articles.set(key, { ...a, topic });
      }
    }
  }

  for (const { entry } of slugScores) {
    articles.set(entry.slug, {
      slug: entry.slug,
      title: entry.title,
      url: entry.url,
      body_file: entry.body_file,
      excerpt: entry.excerpt,
      topic: entry.topics?.[0],
    });
  }

  const ranked = Array.from(articles.values())
    .map((a) => ({
      article: a,
      score: scoreText(tokens, `${a.title ?? ""} ${a.slug ?? ""} ${a.excerpt ?? ""} ${a.topic ?? ""}`),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const enriched = [];
  for (const r of ranked) {
    const body = await maybeReadBody(r.article.body_file);
    enriched.push({ ...r.article, body });
  }

  const sources: CloseExpertSource[] = enriched.map((a) => ({
    title: a.title || a.slug || "Close article",
    url: a.url,
    topic: a.topic,
    slug: a.slug,
  }));

  const context = [
    "## Close Expert Corpus Context",
    "",
    `Router instructions: ${router._agent_instructions ?? "(none)"}`,
    "",
    `Routed topics: ${Array.from(routed).join(", ")}`,
    "",
    ...enriched.map((a, i) =>
      [
        `### Source ${i + 1}: ${a.title || a.slug}`,
        a.url ? `URL: ${a.url}` : "",
        a.topic ? `Topic: ${a.topic}` : "",
        a.excerpt ? `Excerpt: ${a.excerpt}` : "",
        a.body ? `Body:\n${a.body}` : "",
      ].filter(Boolean).join("\n"),
    ),
  ].join("\n\n");

  return {
    context: context.slice(0, 28_000),
    sources,
    routed_topics: Array.from(routed),
  };
}

export async function askCloseExpert(args: {
  question: string;
  conversationContext?: string;
}): Promise<CloseExpertResult> {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  const question = args.question.trim();
  if (!question) throw new Error("question required");

  const settings = await getSettings();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const ctx = await buildCloseExpertContext(question);

  const instructions = `You are Close Expert, a specialist agent for Close CRM.

You answer only from the Close Expert corpus context and clearly label implementation inference.

Response contract:
1. Short answer.
2. How Close thinks about it.
3. Implementation note for Comeketo Agent.
4. Sources used.

If the corpus does not contain enough information, say that directly and give the safest next inspection step.`;

  const input = [
    ctx.context,
    "",
    args.conversationContext ? `## Current Comeketo Agent Conversation Context\n${args.conversationContext.slice(0, 6_000)}` : "",
    "",
    "## Operator Question",
    question,
  ].filter(Boolean).join("\n\n");

  const response = await client.responses.create({
    model: settings.model,
    instructions,
    input,
  });

  return {
    answer: response.output_text?.trim() || "(Close Expert returned no text.)",
    sources: ctx.sources,
    routed_topics: ctx.routed_topics,
  };
}

