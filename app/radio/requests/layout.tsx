import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";
export const metadata: Metadata = { robots: { index: false, follow: true }, alternates: { canonical: absoluteUrl("/radio/requests") } };
export default function PrivateLayout({ children }: { children: React.ReactNode }) { return children; }
