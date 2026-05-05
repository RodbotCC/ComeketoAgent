import Link from "next/link";
import { icons } from "./icons";

type TabKey = "console" | "leads" | "analytics" | "heartbeat" | "workflows" | "delegations";

type Tab = {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
  href: string;
  dot?: "sage" | "amber" | "lavender";
};

const TABS: Tab[] = [
  { key: "console",     label: "console",     icon: icons.analytics,   href: "/console" },
  { key: "leads",       label: "leads",       icon: icons.boxes,       href: "/leads" },
  { key: "analytics",   label: "analytics",   icon: icons.analytics,   href: "/analytics" },
  { key: "heartbeat",   label: "heartbeat",   icon: icons.activity,    href: "/heartbeat" },
  { key: "workflows",   label: "workflows",   icon: icons.automation,  href: "/workflows" },
  { key: "delegations", label: "delegations", icon: icons.delegations, href: "/chat" },
];

const DOT_COLOR: Record<NonNullable<Tab["dot"]>, string> = {
  sage:     "#6B8E5A",
  amber:    "#C4923D",
  lavender: "#9B8FB8",
};

type Props = {
  active?: TabKey;
};

/**
 * Shared right-aligned tab nav for authenticated app pages.
 * Pass `active` to underline the current tab.
 */
export function TabNav({ active }: Props) {
  return (
    <div
      style={{
        padding: "8px 28px 0",
        display: "flex",
        justifyContent: "flex-end",
        flexShrink: 0,
        borderBottom: "1px solid rgba(26, 24, 21, 0.10)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          const baseStyle: React.CSSProperties = {
            paddingBottom: 8,
            color: isActive ? "#1a1a1a" : undefined,
            borderBottom: isActive ? "1.5px solid #1a1a1a" : "1.5px solid transparent",
          };
          const inner = (
            <>
              <span className="cmk-icon-hit">{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.dot ? (
                <span className="cmk-nav-dot" style={{ background: DOT_COLOR[tab.dot] }} />
              ) : null}
            </>
          );
          return (
            <Link key={tab.key} href={tab.href} className="cmk-nav" style={{ ...baseStyle, textDecoration: "none" }}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
