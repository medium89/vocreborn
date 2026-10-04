import type { Metadata } from "next";
import { absoluteUrl, pageMetadata, siteUrl } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  ...pageMetadata("/", "TUSOVA — онлайн чат для общения и новых собеседников", "Живой онлайн-чат TUSOVA: заходи в общий разговор, находи новых собеседников и общайся вечером, ночью или когда просто хочется поговорить."),
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    yandex: process.env.YANDEX_SITE_VERIFICATION || undefined,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const website = {
    "@context": "https://schema.org", "@type": "WebSite",
    name: "TUSOVA", url: absoluteUrl("/"), inLanguage: "ru",
    description: "Общий онлайн-чат для живого общения.",
  };
  return <html lang="ru"><body>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }} />
    {children}
  </body></html>;
}
