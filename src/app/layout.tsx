import "./globals.css";
import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";
import { ToastProvider } from "@/components/Toast";

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
      <body>
        {/* Universal top-bar loader for every route navigation. Shows
            instantly on link click, fades on arrival. Color matches the
            brand sage so it reads as part of the chrome, not a banner. */}
        <NextTopLoader
          color="#8FA078"
          height={2.5}
          showSpinner={false}
          shadow="0 0 8px #8FA078, 0 0 4px #8FA078"
          speed={300}
          easing="ease"
        />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
