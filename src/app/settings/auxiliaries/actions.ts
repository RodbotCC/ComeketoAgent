"use server";

import { revalidatePath } from "next/cache";
import {
  getAuxiliaries,
  setAuxiliaries,
  CAPABILITIES,
  KEY_TARGETS,
  SLOT_KEYS,
  type CapabilityId,
  type KeyTarget,
  type SlotKey,
} from "@/lib/auxiliaries";
import type { AuxActionState } from "./aux-action-state";

/** Master engine toggle (the four-dot fleet on/off). */
export async function setEngineEnabledAction(
  prev: AuxActionState,
  fd: FormData
): Promise<AuxActionState> {
  const next = String(fd.get("engine_enabled") ?? "off") === "on";
  const cfg = await getAuxiliaries();
  cfg.engine_enabled = next;
  await setAuxiliaries(cfg);
  revalidatePath("/settings/auxiliaries");
  revalidatePath("/chat");
  return {
    ok: true,
    message: next ? "Auxiliary fleet engaged" : "Auxiliary fleet idle",
    nonce: prev.nonce + 1,
  };
}

/** Update a single slot. Mutex-aware — drops capabilities that conflict with other slots. */
export async function updateSlotAction(
  prev: AuxActionState,
  fd: FormData
): Promise<AuxActionState> {
  const slotKeyRaw = String(fd.get("slot_key") ?? "");
  if (!(SLOT_KEYS as readonly string[]).includes(slotKeyRaw)) {
    return { ok: false, message: "Bad slot key", nonce: prev.nonce + 1 };
  }
  const slotKey = slotKeyRaw as SlotKey;

  const display_name = String(fd.get("display_name") ?? "").slice(0, 60);
  const role = String(fd.get("role") ?? "").slice(0, 240);
  const enabled = String(fd.get("enabled") ?? "off") === "on";

  const keyTargetRaw = String(fd.get("key_target") ?? "main");
  const key_target: KeyTarget = (KEY_TARGETS as readonly string[]).includes(keyTargetRaw)
    ? (keyTargetRaw as KeyTarget)
    : "main";

  // Multi-select capabilities arrive as repeated form entries.
  const requestedCaps = fd
    .getAll("capabilities")
    .map((v) => String(v))
    .filter((id): id is CapabilityId => CAPABILITIES.some((c) => c.id === id));

  const cfg = await getAuxiliaries();

  // Mutex enforcement: if a requested cap is in a mutex group already held by
  // another slot, drop it from this slot's request and surface a warning.
  const dropped: string[] = [];
  const accepted: CapabilityId[] = [];
  for (const capId of requestedCaps) {
    const cap = CAPABILITIES.find((c) => c.id === capId);
    if (!cap) continue;
    if (!cap.mutex_group) {
      accepted.push(capId);
      continue;
    }
    const conflict = SLOT_KEYS.some((k) => {
      if (k === slotKey) return false;
      return cfg.slots[k].capabilities.some(
        (c) => CAPABILITIES.find((cc) => cc.id === c)?.mutex_group === cap.mutex_group
      );
    });
    if (conflict) {
      dropped.push(cap.label);
      continue;
    }
    accepted.push(capId);
  }

  cfg.slots[slotKey] = {
    key: slotKey,
    display_name,
    role,
    capabilities: accepted,
    key_target,
    enabled,
  };
  await setAuxiliaries(cfg);
  revalidatePath("/settings/auxiliaries");
  revalidatePath("/chat");

  const msg = dropped.length
    ? `${slotKey} saved · dropped ${dropped.join(", ")} (held by another slot)`
    : `${slotKey} saved`;
  return { ok: true, message: msg, nonce: prev.nonce + 1 };
}
