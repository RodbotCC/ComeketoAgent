"use server";

import { revalidatePath } from "next/cache";
import {
  setSettings,
  AVAILABLE_MODELS,
  EXECUTION_MODES,
  type ModelId,
  type ExecutionMode,
} from "@/lib/settings";

export async function updateModelAction(formData: FormData): Promise<void> {
  const raw = String(formData.get("model") ?? "");
  if (!(AVAILABLE_MODELS as readonly string[]).includes(raw)) {
    throw new Error(`Invalid model: ${raw}`);
  }
  await setSettings({ model: raw as ModelId });
  revalidatePath("/settings");
  revalidatePath("/chat");
  revalidatePath("/test");
}

export async function updateExecutionModeAction(formData: FormData): Promise<void> {
  const raw = String(formData.get("execution_mode") ?? "");
  if (!(EXECUTION_MODES as readonly string[]).includes(raw)) {
    throw new Error(`Invalid execution mode: ${raw}`);
  }
  await setSettings({ execution_mode: raw as ExecutionMode });
  revalidatePath("/settings");
  // Heartbeat reads on each invocation, no need to revalidate Lead pages.
}
