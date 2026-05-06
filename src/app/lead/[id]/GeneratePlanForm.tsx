"use client";

import { useTransition } from "react";
import { useToast } from "@/components/Toast";
import { generatePlanAction } from "./actions";

const HORIZON_PRESETS = [1, 2, 3, 5, 7, 14, 21, 30, 45, 60, 90] as const;

export function GeneratePlanForm({
  leadId,
  defaultHorizonDays,
}: {
  leadId: string;
  defaultHorizonDays: number;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      try {
        await generatePlanAction(fd);
        toast.push("Plan generated.", { tone: "success" });
      } catch (err) {
        toast.push(`Plan generation failed: ${err instanceof Error ? err.message : String(err)}`, { tone: "error" });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="plan-generate-form">
      <input type="hidden" name="lead_id" value={leadId} />
      <label className="plan-horizon-label">
        <span>Calendar days in cycle</span>
        <input
          type="number"
          name="horizon_days"
          min={1}
          max={180}
          defaultValue={defaultHorizonDays}
          list={`plan-horizon-presets-${leadId}`}
          className="plan-horizon-input"
        />
        <datalist id={`plan-horizon-presets-${leadId}`}>
          {HORIZON_PRESETS.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>
      <button type="submit" className="plan-btn plan-btn-primary" disabled={pending}>
        {pending ? "Generating…" : "Generate plan"}
      </button>
    </form>
  );
}
