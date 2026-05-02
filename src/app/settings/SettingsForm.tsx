"use client";

import { useEffect, type ReactNode } from "react";
import { useFormState } from "react-dom";
import { useToast } from "@/components/Toast";
import {
  initialSettingsState,
  type SettingsActionState,
} from "./settings-action-state";

/**
 * Thin client wrapper for the settings page Server Action forms. Wraps the
 * action with `useFormState` so we can toast on success/failure based on the
 * returned `SettingsActionState`. Children render inside the form.
 */
export function SettingsForm({
  action,
  children,
  className,
  style,
}: {
  action: (
    prev: SettingsActionState,
    formData: FormData
  ) => Promise<SettingsActionState>;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [state, formAction] = useFormState(action, initialSettingsState);
  const toast = useToast();

  useEffect(() => {
    if (state.nonce === 0) return; // initial render — nothing fired yet
    if (state.ok) toast.push(state.message, { tone: "success" });
    else toast.push(state.message, { tone: "error", ttl: 4500 });
  }, [state.nonce, state.ok, state.message, toast]);

  return (
    <form action={formAction} className={className} style={style}>
      {children}
    </form>
  );
}
