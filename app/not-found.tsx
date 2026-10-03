import Link from "next/link";
import { AboutThemeFrame } from "@/components/site/about-theme-frame";
import { SiteHeader } from "@/components/site/site-header";

export default function NotFound() {
  return <AboutThemeFrame className="tusova-info-page seo-page">
    <div className="tusova-about-wrap"><SiteHeader /><section className="seo-hero">
      <span className="seo-kicker">404</span><h1>Такой страницы нет</h1>
      <p>Похоже, ссылка устарела. Можно вернуться в общий чат или посмотреть наши разделы.</p>
      <Link className="tusova-about-cta" href="/">Перейти в TUSOVA →</Link>
    </section></div>
  </AboutThemeFrame>;
}
