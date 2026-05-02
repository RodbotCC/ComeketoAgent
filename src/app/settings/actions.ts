"use server";

import { revalidatePath } from "next/cache";
import {
  setSettings,
  AVAILABLE_MODELS,
  EXECUTION_MODES,
  clampPlanHorizonDays,
  type ModelId,
  type ExecutionMode,
} from "@/lib/settings";
import type { SettingsActionState } from "./settings-action-state";

export type { SettingsActionState };

export async function updateModelAction(
  prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const raw = String(formData.get("model") ?? "");
  if (!(AVAILABLE_MODELS as readonly string[]).includes(raw)) {
    return { ok: false, message: `Invalid model: ${raw}`, nonce: prev.nonce + 1 };
  }
  await setSettings({ model: raw as ModelId });
  revalidatePath("/settings");
  revalidatePath("/chat");
  revalidatePath("/test");
  return { ok: true, message: `Model saved · ${raw}`, nonce: prev.nonce + 1 };
}

export async function updateExecutionModeAction(
  prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const raw = String(formData.get("execution_mode") ?? "");
  if (!(EXECUTION_MODES as readonly string[]).includes(raw)) {
    return { ok: false, message: `Invalid execution mode: ${raw}`, nonce: prev.nonce + 1 };
  }
  await setSettings({ execution_mode: raw as ExecutionMode });
  revalidatePath("/settings");
  return { ok: true, message: `Execution mode → ${raw.replace(/_/g, " ")}`, nonce: prev.nonce + 1 };
}

export async function updateDefaultPlanHorizonAction(
  prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const raw = formData.get("default_plan_horizon_days");
  const days = clampPlanHorizonDays(Number(raw ?? NaN));
  await setSettings({ default_plan_horizon_days: days });
  revalidatePath("/settings");
  return { ok: true, message: `Plan horizon default · ${days} days`, nonce: prev.nonce + 1 };
}
