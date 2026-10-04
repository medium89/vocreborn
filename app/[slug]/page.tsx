import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AboutThemeFrame } from "@/components/site/about-theme-frame";
import { SiteHeader } from "@/components/site/site-header";
import { absoluteUrl, pageMetadata } from "@/lib/seo";
import { landingBySlug, landings } from "@/lib/seo-landings";

export function generateStaticParams() {
  return landings.map(({ slug }) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = landingBySlug[slug];
  if (!page) return {};
  return pageMetadata("/" + slug, page.title, page.description);
}

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = landingBySlug[slug];
  if (!page) notFound();
  const breadcrumbs = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Главная", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: page.h1, item: absoluteUrl("/" + slug) },
    ],
  };
  return <AboutThemeFrame className="tusova-info-page seo-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
    <div className="tusova-about-wrap">
      <SiteHeader />
      <nav className="seo-breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span aria-hidden="true">/</span><span>{page.h1}</span></nav>
      <header className="seo-hero"><span className="seo-kicker">{page.eyebrow}</span><h1>{page.h1}</h1><p>{page.intro}</p><Link className="tusova-about-cta" href="/#tusova-entry">{page.cta} →</Link></header>
      <div className="seo-content">
        {page.sections.map((section) => <section className="seo-card" key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
      </div>
      {page.faq && <section className="seo-faq" aria-labelledby="seo-faq-title"><h2 id="seo-faq-title">Частый вопрос</h2>{page.faq.map((item) => <div key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></div>)}</section>}
      <nav className="seo-related" aria-label="Другие разделы"><h2>Куда дальше</h2><div>{page.related.map((related) => <Link key={related} href={"/" + related}>{landingBySlug[related].h1} →</Link>)}<Link href="/blog">Журнал TUSOVA →</Link></div></nav>
    </div>
  </AboutThemeFrame>;
}
