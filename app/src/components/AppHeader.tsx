import Link from "next/link";
import { icons } from "./icons";

type Props = {
  /** Where the wordmark links. Defaults to "/chat" — the app's home for authenticated users. */
  wordmarkHref?: string;
};

/**
 * Shared header for authenticated app pages: four-dot identity + wordmark + utility ribbon.
 * Used on /chat, /intake, and any future authenticated page.
 */
export function AppHeader({ wordmarkHref = "/chat" }: Props) {
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
          <span style={{ color: "#1a1a1a" }}>proposals</span>{" "}
          <span style={{ opacity: 0.4 }}>·</span> personal{" "}
          <span style={{ opacity: 0.4 }}>·</span> briefing
        </span>
        <Link href="/settings" style={{ color: "inherit", display: "inline-flex" }} aria-label="settings">
          {icons.gear}
        </Link>
      </div>
    </header>
  );
}
