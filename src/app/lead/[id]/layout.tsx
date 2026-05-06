import { AppHeader } from "@/components/AppHeader";
export default function LeadSegmentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="cme-shell">
      <AppHeader />
      {children}
    </div>
  );
}
