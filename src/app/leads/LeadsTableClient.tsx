"use client";

import { useEffect, useState, useTransition } from "react";
import { LeadActionsRow, type LeadRowSeed } from "./LeadActionsRow";
import { getLeadFreshnessBatch, type LeadFreshness } from "./freshness";

type Props = {
  seeds: LeadRowSeed[];
};

export function LeadsTableClient({ seeds }: Props) {
  const [freshness, setFreshness] = useState<Record<string, LeadFreshness>>({});
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    if (seeds.length === 0) {
      setLoaded(true);
      return;
    }
    startTransition(async () => {
      try {
        const ids = seeds.map((s) => s.lead_id);
        const r = await getLeadFreshnessBatch(ids);
        setFreshness(r);
      } finally {
        setLoaded(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeds]);

  return (
    <div className="leads-table widget">
      {!loaded || pending ? (
        <div className="leads-fresh-banner">
          <span className="leads-action-spinner" aria-hidden="true" />
          <span>checking harness…</span>
        </div>
      ) : null}
      <div className="leads-row leads-row-head leads-row-with-actions">
        <div className="leads-col-name">Lead</div>
        <div className="leads-col-status">Status</div>
        <div className="leads-col-meta">Created / Checked</div>
        <div className="leads-actions-cell" style={{ justifyContent: "flex-end" }}>Actions</div>
      </div>
      {seeds.map((seed) => (
        <LeadActionsRow
          key={seed.lead_id}
          seed={seed}
          freshness={freshness[seed.lead_id] ?? null}
        />
      ))}
    </div>
  );
}
