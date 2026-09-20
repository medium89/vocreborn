import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura — будь рядом",
  description: "Aura — современный чат для живого общения",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
