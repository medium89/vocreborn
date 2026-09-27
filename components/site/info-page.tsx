import { ArrowRight } from "lucide-react";
import { SiteHeader } from "./site-header";

type InfoPageProps = {
  active: "rules" | "help";
  eyebrow: string;
  title: string;
  intro: string;
  items: Array<{ title: string; text: string }>;
};

export function InfoPage({ active, eyebrow, title, intro, items }: InfoPageProps) {
  return <main className="tusova-info-page">
    <div className="tusova-about-wrap">
      <SiteHeader active={active} />
      <section className="tusova-info-intro">
        <span className="tusova-about-kicker">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{intro}</p>
        <a className="tusova-about-cta" href="/?auth=login#tusova-entry">Перейти в чат <ArrowRight size={19} /></a>
      </section>
      <section className="tusova-info-grid" aria-label={title}>
        {items.map((item, index) => <article key={item.title}>
          <span className="tusova-info-number">{String(index + 1).padStart(2, "0")}</span>
          <h2>{item.title}</h2>
          <p>{item.text}</p>
        </article>)}
      </section>
    </div>
  </main>;
}
