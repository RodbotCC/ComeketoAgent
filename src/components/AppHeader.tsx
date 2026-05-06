"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GlobalMenu } from "./GlobalMenu";
import { icons } from "./icons";

type Props = {
  /** Where the wordmark links. Defaults to `/console`. */
  wordmarkHref?: string;
};

const SUBTABS: { key: string; label: string; suffix: string; pathFor: (id: string) => string }[] = [
  { key: "box",         label: "Client Box",     suffix: "/box",        pathFor: (id) => `/chat?lead=${encodeURIComponent(id)}&preset=raw&right=raw_box,comms,ledger&from=lead-box` },
  { key: "discovery",   label: "AI Profile",     suffix: "/discovery",  pathFor: (id) => `/chat?lead=${encodeURIComponent(id)}&preset=state&right=ai_profile,comms,ledger&from=ai-profile` },
  { key: "plan",        label: "Seven-Day Plan", suffix: "",            pathFor: (id) => `/chat?lead=${encodeURIComponent(id)}&preset=plan&right=plan,ai_profile,comms&from=plan` },
  { key: "delegations", label: "Delegations",    suffix: "__chat__",    pathFor: (id) => `/chat?lead=${encodeURIComponent(id)}&preset=state&right=plan,ai_profile&from=lead-box` },
  { key: "intake",      label: "Enrichment",     suffix: "/intake",     pathFor: (id) => `/chat?lead=${encodeURIComponent(id)}&preset=raw&right=enrichment,raw_box&from=enrichment` },
  { key: "heartbeat",   label: "Heartbeat",      suffix: "/heartbeat",  pathFor: (id) => `/chat?lead=${encodeURIComponent(id)}&preset=heartbeat&right=heartbeat,plan,ledger&from=heartbeat` },
];

function extractLeadId(pathname: string): string | null {
  const m = pathname.match(/^\/lead\/([^\/?#]+)/);
  return m ? m[1] : null;
}

export function AppHeader({ wordmarkHref = "/console" }: Props) {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const chatLeadId = pathname === "/chat" ? searchParams.get("lead") : null;
  const leadId = extractLeadId(pathname) ?? (chatLeadId?.startsWith("lead_") ? chatLeadId : null);
  const [staleLeadIds, setStaleLeadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    function onStale(e: Event) {
      const detail = (e as CustomEvent).detail as { leadId?: string };
      if (!detail?.leadId) return;
      setStaleLeadIds((prev) => {
        if (prev.has(detail.leadId!)) return prev;
        const next = new Set(prev);
        next.add(detail.leadId!);
        return next;
      });
    }
    function onFresh(e: Event) {
      const detail = (e as CustomEvent).detail as { leadId?: string };
      if (!detail?.leadId) return;
      setStaleLeadIds((prev) => {
        if (!prev.has(detail.leadId!)) return prev;
        const next = new Set(prev);
        next.delete(detail.leadId!);
        return next;
      });
    }
    window.addEventListener("cmk:lead-stale", onStale);
    window.addEventListener("cmk:lead-fresh", onFresh);
    return () => {
      window.removeEventListener("cmk:lead-stale", onStale);
      window.removeEventListener("cmk:lead-fresh", onFresh);
    };
  }, []);

  // Clear the box-stale dot when the user actually lands on the box tab.
  useEffect(() => {
    if (!leadId) return;
    if (pathname.startsWith(`/lead/${leadId}/box`)) {
      setStaleLeadIds((prev) => {
        if (!prev.has(leadId)) return prev;
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
    }
  }, [pathname, leadId]);

  const boxStale = leadId ? staleLeadIds.has(leadId) : false;
  const onLeadsList = pathname === "/leads" || pathname.startsWith("/leads/");
  const onLead = leadId !== null;
  const onProposals = pathname === "/proposals" || pathname.startsWith("/proposals/");
  const hideLeadSubtabs = pathname === "/chat";

  return (
    <header
      style={{
        flexShrink: 0,
        borderBottom: "0.5px solid rgba(0,0,0,0.05)",
      }}
    >
      {/* Row 1 — wordmark + primary nav */}
      <div
        style={{
          padding: "16px 28px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="cmk-dot" style={{ background: "#8B7355" }} />
          <span className="cmk-dot" style={{ background: "#A89968" }} />
          <span className="cmk-dot" style={{ background: "#6B8E5A" }} />
          <span className="cmk-dot" style={{ background: "#9B8FB8" }} />
          <Link
            href={wordmarkHref}
            style={{
              fontFamily: "var(--serif)",
              fontSize: 19,
              letterSpacing: "-0.01em",
              marginLeft: 4,
              color: "#1a1a1a",
              textDecoration: "none",
            }}
          >
            Comeketo <em style={{ fontStyle: "italic" }}>Agent.</em>
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "#6b6b66" }}>
          <GlobalMenu />
          <span style={{ opacity: 0.4 }}>·</span>
          <Link
            href="/proposals"
            className="cmk-utility-link"
            style={{
              fontWeight: onProposals ? 600 : undefined,
              textDecoration: onProposals ? "underline" : "none",
              color: onProposals ? "#1a1a1a" : "inherit",
            }}
          >
            Proposals
          </Link>
          <span style={{ opacity: 0.4 }}>·</span>
          <Link
            href="/leads"
            className="cmk-utility-link"
            style={{
              fontWeight: (onLeadsList || onLead) ? 600 : undefined,
              textDecoration: (onLeadsList || onLead) ? "underline" : "none",
              color: (onLeadsList || onLead) ? "#1a1a1a" : "inherit",
            }}
          >
            Leads
          </Link>
          <Link href="/settings" className="cmk-icon-hit" style={{ color: "inherit" }} aria-label="settings">
            {icons.gear}
          </Link>
        </div>
      </div>
      {/* Row 2 — legacy lead subtabs. Hidden in the chat workbench: widgets are the nav there. */}
      {!hideLeadSubtabs && (
      <div
        style={{
          padding: "0 28px",
          display: "flex",
          justifyContent: "flex-end",
          borderTop: "0.5px solid rgba(0,0,0,0.04)",
        }}
      >
        <nav
          aria-label="Lead sections"
          className="lead-subnav"
          style={{ paddingTop: 4 }}
        >
          {SUBTABS.map((tab) => {
            if (!leadId) {
              return (
                <span
                  key={tab.key}
                  className="lead-subnav-link"
                  title="Open a lead to use these"
                  aria-disabled="true"
                  style={{ opacity: 0.35, cursor: "default" }}
                >
                  {tab.label}
                </span>
              );
            }
            const href = tab.pathFor(leadId);
            const base = `/lead/${leadId}`;
            let active = false;
            if (pathname === "/chat") {
              const from = searchParams.get("from") || searchParams.get("preset") || "";
              active =
                (tab.key === "delegations" && !from) ||
                (tab.key === "box" && from.includes("box")) ||
                (tab.key === "discovery" && (from.includes("profile") || from === "state")) ||
                (tab.key === "plan" && from.includes("plan")) ||
                (tab.key === "intake" && from.includes("enrichment")) ||
                (tab.key === "heartbeat" && from.includes("heartbeat"));
            } else if (tab.key === "plan") {
              active = pathname === base || pathname === `${base}/`;
            } else if (tab.key === "delegations") {
              active = false;
            } else {
              active = pathname.startsWith(`${base}${tab.suffix}`);
            }
            const showDot = tab.key === "box" && boxStale;
            return (
              <Link
                key={tab.key}
                href={href}
                className={`lead-subnav-link${active ? " lead-subnav-link-active" : ""}`}
                title={showDot ? "New activity — Box may be stale" : undefined}
              >
                {tab.label}
                {showDot ? (
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#C4923D",
                      marginLeft: 6,
                      verticalAlign: "middle",
                    }}
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
      )}
    </header>
  );
}
