"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * IA under Leads: Plan (7-day), Box (profile + activity), Heartbeat (ops trace).
 */
export function LeadSubNav({ leadId }: { leadId: string }) {
  const pathname = usePathname() || "";
  const base = `/lead/${leadId}`;

  const planActive = pathname === base || pathname === `${base}/`;
  const boxActive = pathname.startsWith(`${base}/box`);
  const hbActive = pathname.startsWith(`${base}/heartbeat`);

  return (
    <nav className="lead-subnav" aria-label="Lead sections">
      <Link href={base} className={`lead-subnav-link${planActive ? " lead-subnav-link-active" : ""}`}>
        Plan
      </Link>
      <Link href={`${base}/box`} className={`lead-subnav-link${boxActive ? " lead-subnav-link-active" : ""}`}>
        Box
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
