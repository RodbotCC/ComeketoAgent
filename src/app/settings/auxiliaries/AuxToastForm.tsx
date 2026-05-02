"use client";

import { useEffect, type ReactNode } from "react";
import { useFormState } from "react-dom";
import { useToast } from "@/components/Toast";
import { initialAuxState, type AuxActionState } from "./aux-action-state";

export function AuxToastForm({
  action,
  children,
}: {
  action: (prev: AuxActionState, fd: FormData) => Promise<AuxActionState>;
  children: ReactNode;
}) {
  const [state, formAction] = useFormState(action, initialAuxState);
  const toast = useToast();

  useEffect(() => {
    if (state.nonce === 0) return;
    toast.push(state.message, { tone: state.ok ? "success" : "error", ttl: state.ok ? 2400 : 4500 });
  }, [state.nonce, state.ok, state.message, toast]);

  return <form action={formAction}>{children}</form>;
}
