import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";
export const metadata: Metadata = { robots: { index: false, follow: true }, alternates: { canonical: absoluteUrl("/radio/studio") } };
export default function PrivateLayout({ children }: { children: React.ReactNode }) { return children; }
