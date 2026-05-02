import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { ChatLayout } from "./ChatPanel";

export default function ChatPage() {
  return (
    <div className="cme-shell chat-shell">
      <AppHeader />
      <TabNav active="delegations" />

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
