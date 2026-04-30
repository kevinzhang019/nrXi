import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NRSI — No-Run Scoring Inning",
  description: "Live MLB inning probabilities and break-even American odds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)]">{children}</body>
    </html>
  );
}
