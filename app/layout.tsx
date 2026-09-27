import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TUSOVA — ночные разговоры",
  description: "TUSOVA — чат для тех, кто оживает, когда другие спят",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
