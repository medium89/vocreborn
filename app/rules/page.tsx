import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import {
  ArrowRight, Ban, Camera, ChevronRight, Clock3, Flag, Heart,
  Megaphone, MessageCircleMore, MessageSquareX, Moon, ShieldCheck,
  Smile, Star, UserRoundX, UsersRound,
} from "lucide-react";
import { AboutThemeFrame } from "@/components/site/about-theme-frame";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = pageMetadata("/rules", "Правила общения в TUSOVA", "Простые правила общего чата TUSOVA: уважение к собеседникам, безопасность и комфортное общение.");

const principles = [
  { icon: Heart, title: "Уважай других", text: "Будь вежливым и доброжелательным. Уважай мнение и личные границы собеседников." },
  { icon: MessageCircleMore, title: "Общайся по теме", text: "Используй подходящие чаты и темы. Поддерживай интересные и содержательные разговоры." },
  { icon: UsersRound, title: "Будь собой", text: "Мы ценим искренность и открытость. Делись мыслями, опытом и эмоциями." },
  { icon: ShieldCheck, title: "Заботься о безопасности", text: "Не раскрывай личные данные — свои и чужие. Будь внимателен при общении с новыми людьми." },
  { icon: Star, title: "Создавай уют", text: "Делись позитивом, хорошим настроением, интересными идеями и мемами. TUSOVA — это про атмосферу." },
  { icon: Moon, title: "Уважай время других", text: "Избегай спама, флуда и повторяющихся сообщений. Давай всем возможность участвовать в разговоре." },
  { icon: Flag, title: "Сообщай о проблемах", text: "Если видишь нарушение правил — используй кнопку жалобы. Модераторы разберутся." },
  { icon: Smile, title: "Помни, что ты не один", text: "TUSOVA — сообщество реальных людей. Относись к другим так, как хочешь, чтобы относились к тебе." },
];

const forbidden = [
  { icon: MessageSquareX, title: "Оскорбления и токсичное поведение" },
  { badge: "18+", title: "Контент 18+ в неподходящих чатах" },
  { icon: Megaphone, title: "Спам и реклама без согласования" },
  { icon: UserRoundX, title: "Травля и дискриминация" },
  { icon: Camera, title: "Публикация личных данных без согласия" },
  { icon: Ban, title: "Незаконные действия и контент" },
];

const measures = [
  { icon: MessageCircleMore, title: "Предупреждение", text: "При лёгком нарушении" },
  { icon: Clock3, title: "Ограничение общения", text: "Временное ограничение чата" },
  { icon: Ban, title: "Временная блокировка", text: "При серьёзном нарушении" },
  { icon: UserRoundX, title: "Постоянная блокировка", text: "При повторных или грубых нарушениях" },
];

export default function RulesPage() {
  return <AboutThemeFrame className="tusova-rules">
    <div className="tusova-rules-hero">
      <div className="tusova-about-wrap">
        <SiteHeader active="rules" />
        <section className="tusova-rules-intro" aria-labelledby="rules-title">
          <h1 id="rules-title">Правила<br /><span>TUSOVA</span></h1>
          <h2>Простые правила для приятного<br /> и безопасного общения</h2>
          <p>Мы ценим уютную атмосферу, уважение и свободу общения. Эти правила помогают нам всем чувствовать себя комфортно и сохранять доброжелательную тусу.</p>
        </section>
      </div>
    </div>

    <div className="tusova-about-wrap tusova-rules-content">
      <section className="tusova-rules-principles" aria-labelledby="rules-main-title">
        <h2 id="rules-main-title">Основные <span>правила</span></h2>
        <p className="tusova-rules-lead">Следуй этим простым принципам, чтобы делать TUSOVA лучше каждый день</p>
        <div className="tusova-rules-grid">
          {principles.map(({ icon: Icon, title, text }, index) => <article key={title}>
            <div className="tusova-rules-card-top"><span className="tusova-rules-number">{index + 1}</span><Icon size={37} strokeWidth={1.55} aria-hidden="true" /></div>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>)}
        </div>
      </section>

      <section className="tusova-rules-forbidden" aria-labelledby="rules-forbidden-title">
        <h2 id="rules-forbidden-title">Запрещено</h2>
        <p>Эти действия нарушают правила и могут привести к блокировке аккаунта.</p>
        <div className="tusova-rules-forbidden-grid">
          {forbidden.map(({ icon: Icon, badge, title }) => <article key={title}>
            {Icon ? <Icon size={34} strokeWidth={1.65} aria-hidden="true" /> : <span className="tusova-rules-age" aria-hidden="true">{badge}</span>}
            <h3>{title}</h3>
          </article>)}
        </div>
      </section>

      <section className="tusova-rules-measures" aria-labelledby="rules-measures-title">
        <h2 id="rules-measures-title">Что будет при нарушении</h2>
        <p>Мы стараемся не наказывать, а поддерживать здоровую атмосферу. В зависимости от нарушения могут применяться меры:</p>
        <div className="tusova-rules-measures-grid">
          {measures.map(({ icon: Icon, title, text }, index) => <article key={title}>
            <Icon size={39} strokeWidth={1.6} aria-hidden="true" />
            <h3>{index + 1}. {title}</h3>
            <p>{text}</p>
            {index < measures.length - 1 && <ChevronRight className="tusova-rules-measure-arrow" size={24} strokeWidth={1.5} aria-hidden="true" />}
          </article>)}
        </div>
      </section>
    </div>

    <section className="tusova-rules-footer" aria-labelledby="rules-footer-title">
      <div className="tusova-about-wrap tusova-rules-footer-inner">
        <div aria-hidden="true" />
        <div>
          <h2 id="rules-footer-title">Давайте делать TUSOVA<br /> уютнее <span>вместе</span></h2>
          <p>Если у тебя есть вопросы по правилам или ты хочешь сообщить о нарушении — загляни в раздел помощи.</p>
          <a className="tusova-about-cta" href="/help">Открыть помощь <ArrowRight size={19} /></a>
        </div>
      </div>
    </section>
  </AboutThemeFrame>;
}
