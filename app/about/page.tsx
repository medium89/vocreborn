import type { Metadata } from "next";
import { ArrowRight, Heart, MessageCircleMore, Moon, ShieldCheck, Sparkles, Star, UsersRound } from "lucide-react";
import { AboutThemeFrame } from "@/components/site/about-theme-frame";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: "О нас — TUSOVA",
  description: "TUSOVA — место для ночных разговоров, дружбы и общения без лишних формальностей.",
};

const features = [
  { icon: MessageCircleMore, title: "Живое общение", text: "Интересные люди и настоящие разговоры" },
  { icon: UsersRound, title: "Дружелюбное сообщество", text: "Уважение и комфорт для каждого" },
  { icon: Moon, title: "Всегда онлайн", text: "Тут всегда есть с кем поговорить" },
  { icon: ShieldCheck, title: "Безопасная среда", text: "Модерация и защита от негатива" },
  { icon: Star, title: "Много интересного", text: "Темы, комнаты и события" },
];

const values = [
  { icon: Heart, title: "Уважение", text: "Ценим мнение каждого и создаём комфортную атмосферу." },
  { icon: UsersRound, title: "Открытость", text: "Новые знакомства, интересные идеи и разные взгляды." },
  { icon: ShieldCheck, title: "Безопасность", text: "Правила и модерация помогают общаться спокойно." },
  { icon: Moon, title: "Свобода", text: "Никаких рамок: общайся на темы, которые тебе близки." },
];

export default function AboutPage() {
  return <AboutThemeFrame>
    <div className="tusova-about-hero">
      <div className="tusova-about-wrap">
        <SiteHeader active="about" />
        <section className="tusova-about-intro" aria-labelledby="about-title">
          <h1 id="about-title">О <span>нас</span></h1>
          <h2>Tusova — это место для тех,<br /> кто не спит, когда все спят</h2>
          <p>Мы создали уютный онлайн-чат, где всегда есть с кем поговорить. Здесь встречаются люди, которые любят ночные разговоры, интересные темы и живое общение без лишних формальностей.</p>
          <a className="tusova-about-cta" href="/?auth=register#tusova-entry">Присоединиться к тусе <ArrowRight size={19} /></a>
        </section>
      </div>
    </div>

    <div className="tusova-about-wrap tusova-about-below">
      <section className="tusova-about-features" aria-label="Что есть в TUSOVA">
        {features.map(({ icon: Icon, title, text }) => <article key={title}>
          <Icon size={34} strokeWidth={1.55} aria-hidden="true" />
          <h3>{title}</h3>
          <p>{text}</p>
        </article>)}
      </section>

      <section className="tusova-about-story" aria-labelledby="about-idea-title">
        <div className="tusova-about-story-image" role="img" aria-label="Уютная ночная комната с совой" />
        <div className="tusova-about-story-copy">
          <span className="tusova-about-kicker">НАША ИДЕЯ</span>
          <h2 id="about-idea-title">Почему <span>TUSOVA?</span></h2>
          <p>Название объединяет два мира — тусу и сову. Это про людей, которые любят общаться, находить единомышленников и делают это в любое время суток, особенно тогда, когда город уже спит.</p>
          <p>Мы верим, что ночные разговоры особенные. В это время люди более открытые, искренние и настоящие. TUSOVA — место, где можно быть собой.</p>
        </div>
      </section>

      <section className="tusova-about-highlights" aria-label="Наш формат общения">
        <article><UsersRound size={31} strokeWidth={1.6} /><strong>Свои люди</strong><span>знакомства и сообщество</span></article>
        <article><MessageCircleMore size={31} strokeWidth={1.6} /><strong>Живой чат</strong><span>разговоры на разные темы</span></article>
        <article><Moon size={31} strokeWidth={1.6} /><strong>24/7</strong><span>общение в любое время</span></article>
        <article><ShieldCheck size={31} strokeWidth={1.6} /><strong>С заботой</strong><span>правила и модерация</span></article>
      </section>

      <section className="tusova-about-values" aria-labelledby="about-values-title">
        <div className="tusova-about-values-copy">
          <span className="tusova-about-kicker">НАШИ ЦЕННОСТИ</span>
          <h2 id="about-values-title">Что для нас <span>важно</span></h2>
          <div className="tusova-about-value-grid">
            {values.map(({ icon: Icon, title, text }) => <article key={title}>
              <Icon size={29} strokeWidth={1.6} aria-hidden="true" />
              <div><h3>{title}</h3><p>{text}</p></div>
            </article>)}
          </div>
        </div>
        <div className="tusova-about-values-image" role="img" aria-label="Ночной город за окном уютной комнаты"><span><Sparkles size={17} /> Ночные разговоры — особенные</span></div>
      </section>
    </div>
  </AboutThemeFrame>;
}
