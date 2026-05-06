import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ChatLayout } from "./ChatPanel";

// Chat reads `useSearchParams` deep inside ChatPanel. Forcing dynamic so
// Next.js doesn't try to prerender — the page is operator-bound anyway.
export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="cme-shell chat-shell">
      <AppHeader />
      <Suspense fallback={<div className="cmk-chat-suspense">Loading delegations…</div>}>
        <ChatLayout />
      </Suspense>

      <footer
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 28px",
          fontSize: 10.5,
          color: "#9a9a93",
          flexShrink: 0,
          borderTop: "0.5px solid rgba(0,0,0,0.05)",
        }}
      >
        <span>grid · morning</span>
        <span>
          proposals · personal ·{" "}
          <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", color: "#5a5a55" }}>Comeketo Agent</span>
        </span>
      </footer>
    </div>
  );
}
