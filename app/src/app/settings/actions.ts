"use server";

import { revalidatePath } from "next/cache";
import { setSettings, AVAILABLE_MODELS, type ModelId } from "@/lib/settings";

export async function updateModelAction(formData: FormData): Promise<void> {
  const raw = String(formData.get("model") ?? "");
  if (!(AVAILABLE_MODELS as readonly string[]).includes(raw)) {
    throw new Error(`Invalid model: ${raw}`);
  }
  await setSettings({ model: raw as ModelId });
  // Refresh anywhere the model is read.
  revalidatePath("/settings");
  revalidatePath("/chat");
  revalidatePath("/test");
}
