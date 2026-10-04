import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AboutThemeFrame } from "@/components/site/about-theme-frame";
import { SiteHeader } from "@/components/site/site-header";
import { absoluteUrl, pageMetadata } from "@/lib/seo";
import { articleBySlug, articles } from "@/lib/seo-articles";

export function generateStaticParams() {
  return articles.map(({ slug }) => ({ slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = articleBySlug[slug];
  if (!article) return {};
  return {
    ...pageMetadata("/blog/" + slug, article.title, article.description, "article"),
    openGraph: {
      ...pageMetadata("/blog/" + slug, article.title, article.description, "article").openGraph,
      type: "article", publishedTime: article.date,
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articleBySlug[slug];
  if (!article) notFound();
  const url = absoluteUrl("/blog/" + slug);
  const structuredArticle = {
    "@context": "https://schema.org", "@type": "BlogPosting",
    headline: article.h1, description: article.description, datePublished: article.date,
    dateModified: article.date, inLanguage: "ru", mainEntityOfPage: url,
    image: absoluteUrl("/brand/tusova-chat-logo.png"),
    publisher: { "@type": "Organization", name: "TUSOVA", url: absoluteUrl("/") },
  };
  const breadcrumbs = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Главная", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Журнал", item: absoluteUrl("/blog") },
      { "@type": "ListItem", position: 3, name: article.h1, item: url },
    ],
  };
  const related = articles.filter((item) => item.slug !== slug).slice(0, 2);
  return <AboutThemeFrame className="tusova-info-page seo-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredArticle) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
    <div className="tusova-about-wrap"><SiteHeader />
      <nav className="seo-breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span aria-hidden="true">/</span><Link href="/blog">Журнал</Link><span aria-hidden="true">/</span><span>{article.h1}</span></nav>
      <article className="seo-article">
        <header className="seo-hero"><span className="seo-kicker">ЖУРНАЛ TUSOVA</span><h1>{article.h1}</h1><time dateTime={article.date}>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(article.date))}</time><p>{article.lead}</p></header>
        <div className="seo-prose">{article.sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
          <div className="seo-article-cta"><p>Хочется не только читать советы, но и поговорить? Загляни в TUSOVA и присоединяйся к разговору.</p><Link className="tusova-about-cta" href="/#tusova-entry">Войти в чат →</Link></div>
        </div>
      </article>
      <nav className="seo-related" aria-label="Продолжить чтение"><h2>По теме</h2><div><Link href={"/" + article.relatedLanding}>{article.relatedLabel} →</Link>{related.map((item) => <Link key={item.slug} href={"/blog/" + item.slug}>{item.h1} →</Link>)}</div></nav>
    </div>
  </AboutThemeFrame>;
}
