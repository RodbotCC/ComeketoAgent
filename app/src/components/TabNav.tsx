import Link from "next/link";
import { icons } from "./icons";

type TabKey = "people" | "activity" | "intake" | "analytics" | "boxes" | "automation" | "delegations";

type Tab = {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
  href: string;
  /** sage/amber dot for active alerts (visual only for now). */
  dot?: "sage" | "amber" | "lavender";
  /** "▾" suffix on the people tab. */
  suffix?: string;
};

const TABS: Tab[] = [
  { key: "people",      label: "people",      icon: icons.people,      href: "#",         suffix: "▾" },
  { key: "activity",    label: "activity",    icon: icons.activity,    href: "#",         dot: "sage" },
  { key: "intake",      label: "intake",      icon: icons.intake,      href: "/intake",   dot: "amber" },
  { key: "analytics",   label: "analytics",   icon: icons.analytics,   href: "#" },
  { key: "boxes",       label: "boxes",       icon: icons.boxes,       href: "#" },
  { key: "automation",  label: "automation",  icon: icons.automation,  href: "#",         dot: "sage" },
  { key: "delegations", label: "delegations", icon: icons.delegations, href: "/chat" }, /* /chat IS the delegations chat */
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
        borderBottom: "0.5px solid rgba(0,0,0,0.05)",
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
              {tab.icon}
              <span>{tab.label}</span>
              {tab.suffix ? <span style={{ opacity: 0.5 }}>{tab.suffix}</span> : null}
              {tab.dot ? (
                <span className="cmk-nav-dot" style={{ background: DOT_COLOR[tab.dot] }} />
              ) : null}
            </>
          );
          if (tab.href === "#") {
            return (
              <span key={tab.key} className="cmk-nav" style={baseStyle}>
                {inner}
              </span>
            );
          }
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
