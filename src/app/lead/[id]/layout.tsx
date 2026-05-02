import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";

export default function LeadSegmentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="leads" />
      {children}
    </div>
  );
}
