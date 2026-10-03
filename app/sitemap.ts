import type { MetadataRoute } from "next";
import { articles } from "@/lib/seo-articles";
import { landings } from "@/lib/seo-landings";
import { absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/about", "/help", "/rules", "/blog", ...landings.map(({ slug }) => "/" + slug), ...articles.map(({ slug }) => "/blog/" + slug)];
  return paths.map((path) => ({ url: absoluteUrl(path), changeFrequency: path === "/" ? "daily" : "monthly" }));
}
