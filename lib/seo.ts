import type { Metadata } from "next";

export const siteUrl = "https://tusova.su";
export const siteName = "TUSOVA";
export const seoImage = "/brand/tusova-chat-logo.png";

export function absoluteUrl(path: string) {
  return new URL(path, siteUrl).toString();
}

export function pageMetadata(path: string, title: string, description: string, type: "website" | "article" = "website"): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title, description, url, type, siteName, locale: "ru_RU",
      images: [{ url: absoluteUrl(seoImage), alt: "TUSOVA" }],
    },
    twitter: { card: "summary", title, description, images: [absoluteUrl(seoImage)] },
  };
}
