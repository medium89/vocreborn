import type { Metadata } from "next";
import Link from "next/link";
import { AboutThemeFrame } from "@/components/site/about-theme-frame";
import { SiteHeader } from "@/components/site/site-header";
import { articles } from "@/lib/seo-articles";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("/blog", "Журнал об общении | TUSOVA", "Советы и размышления об онлайн-общении: как найти собеседника, начать разговор и почувствовать себя в компании.");

export default function BlogPage() {
  return <AboutThemeFrame className="tusova-info-page seo-page">
    <div className="tusova-about-wrap"><SiteHeader active="blog" />
      <nav className="seo-breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span aria-hidden="true">/</span><span>Журнал</span></nav>
      <header className="seo-hero"><span className="seo-kicker">ЖУРНАЛ TUSOVA</span><h1>О разговоре и людях</h1><p>Как найти собеседника, поддержать беседу и почувствовать себя в компании. Несколько идей, которые можно попробовать прямо сейчас.</p></header>
      <div className="seo-blog-grid">{articles.map((article) => <article className="seo-card" key={article.slug}>
        <time dateTime={article.date}>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(article.date))}</time>
        <h2><Link href={"/blog/" + article.slug}>{article.h1}</Link></h2><p>{article.lead}</p><Link className="seo-text-link" href={"/blog/" + article.slug}>Читать статью →</Link>
      </article>)}</div>
      <nav className="seo-related" aria-label="Другие разделы"><h2>Хочется поговорить?</h2><div><Link href="/chat-dlya-obshcheniya">Открыть чат для общения →</Link><Link href="/nayti-sobesednika">Найти собеседника →</Link></div></nav>
    </div>
  </AboutThemeFrame>;
}
