import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../styles/globals.css";
import { AuthProvider } from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "GYMFIT Operations",
  description: "Operational platform for gym attendance, members, reports, and kiosk workflows.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ background: "#f8fafc", color: "#1e293b" }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
