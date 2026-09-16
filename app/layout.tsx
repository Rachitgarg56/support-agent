import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Papertrail — Document Q&A",
  description: "A workspace-isolated RAG demo built with Next.js, Gemini, and Supabase.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
