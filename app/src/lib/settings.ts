import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * App settings — picked in the Settings page, read everywhere model selection matters.
 * Persisted to .cmk-settings.json at the project root (gitignored).
 */

export const AVAILABLE_MODELS = [
  "gpt-5.4-nano-2026-03-17",
  "gpt-5.4-mini-2026-03-17",
  "gpt-5.4-2026-03-05",
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number];

export type Settings = {
  model: ModelId;
};

export const DEFAULT_SETTINGS: Settings = {
  model: "gpt-5.4-mini-2026-03-17",
};

const SETTINGS_PATH = path.join(process.cwd(), ".cmk-settings.json");

function isValidModel(value: unknown): value is ModelId {
  return typeof value === "string" && (AVAILABLE_MODELS as readonly string[]).includes(value);
}

export async function getSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      model: isValidModel(parsed.model) ? parsed.model : DEFAULT_SETTINGS.model,
    };
  } catch {
    // File doesn't exist or is unreadable — return defaults.
    return { ...DEFAULT_SETTINGS };
  }
}

export async function setSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = {
    model: isValidModel(partial.model) ? partial.model : current.model,
  };
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return next;
}
