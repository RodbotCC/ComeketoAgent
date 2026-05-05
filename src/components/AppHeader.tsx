import Link from "next/link";
import { icons } from "./icons";

type Props = {
  /** Where the wordmark links. Defaults to `/console` — operator command center. */
  wordmarkHref?: string;
};

/**
 * Shared header for authenticated app pages: four-dot identity + wordmark + utility ribbon.
 */
export function AppHeader({ wordmarkHref = "/console" }: Props) {
  return (
    <header
      style={{
        padding: "16px 28px 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        borderBottom: "0.5px solid rgba(0,0,0,0.05)",
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11.5, color: "#6b6b66" }}>
        <span>
          <Link href="/proposals" className="cmk-utility-link">proposals</Link>{" "}
          <span style={{ opacity: 0.4 }}>·</span>{" "}
          <Link href="/personal" className="cmk-utility-link">personal</Link>{" "}
          <span style={{ opacity: 0.4 }}>·</span>{" "}
          <Link href="/briefing" className="cmk-utility-link">briefing</Link>
        </span>
        <Link href="/settings" className="cmk-icon-hit" style={{ color: "inherit" }} aria-label="settings">
          {icons.gear}
        </Link>
      </div>
    </header>
  );
}
