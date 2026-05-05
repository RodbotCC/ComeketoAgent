"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * IA under Leads: Plan (7-day), Graph (plan-as-graph + simulator), Box (profile +
 * activity), Discovery (slot map + journey score + quest), Intake (lead-scoped
 * uploads), Heartbeat (ops trace).
 */
export function LeadSubNav({ leadId }: { leadId: string }) {
  const pathname = usePathname() || "";
  const base = `/lead/${leadId}`;

  const planActive = pathname === base || pathname === `${base}/`;
  const boxActive = pathname.startsWith(`${base}/box`);
  const graphActive = pathname.startsWith(`${base}/graph`);
  const discoveryActive = pathname.startsWith(`${base}/discovery`);
  const intakeActive = pathname.startsWith(`${base}/intake`);
  const hbActive = pathname.startsWith(`${base}/heartbeat`);

  return (
    <nav className="lead-subnav" aria-label="Lead sections">
      <Link href={base} className={`lead-subnav-link${planActive ? " lead-subnav-link-active" : ""}`}>
        Plan
      </Link>
      <Link href={`${base}/graph`} className={`lead-subnav-link${graphActive ? " lead-subnav-link-active" : ""}`}>
        Graph
      </Link>
      <Link href={`${base}/box`} className={`lead-subnav-link${boxActive ? " lead-subnav-link-active" : ""}`}>
        Box
      </Link>
      <Link
        href={`${base}/discovery`}
        className={`lead-subnav-link${discoveryActive ? " lead-subnav-link-active" : ""}`}
      >
        Discovery
      </Link>
      <Link
        href={`${base}/intake`}
        className={`lead-subnav-link${intakeActive ? " lead-subnav-link-active" : ""}`}
      >
        Intake
      </Link>
      <Link
        href={`${base}/heartbeat`}
        className={`lead-subnav-link${hbActive ? " lead-subnav-link-active" : ""}`}
      >
        Heartbeat
      </Link>
    </nav>
  );
}
