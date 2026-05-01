import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Comeketo Agent — Sign in",
  description: "An agent for catering operators. Cron, watch, webhook, rule, ribbon — wired into a quiet day.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
