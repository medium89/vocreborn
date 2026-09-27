"use client";

import { Moon, Sun } from "lucide-react";
import { useAboutTheme } from "@/components/site/about-theme-frame";
import { useSiteTheme } from "@/lib/use-site-theme";

type Page = "home" | "about" | "rules" | "help";

const links: Array<{ page: Page; label: string; href: string }> = [
  { page: "home", label: "Главная", href: "/" },
  { page: "about", label: "О нас", href: "/about" },
  { page: "rules", label: "Правила", href: "/rules" },
  { page: "help", label: "Помощь", href: "/help" },
];

export function SiteHeader({ active }: { active: Page }) {
  const globalTheme = useSiteTheme();
  const aboutTheme = useAboutTheme();
  const { theme, toggleTheme } = aboutTheme ?? globalTheme;

  return <header className="site-header">
    <a className="site-header-brand" href="/" aria-label="TUSOVA — главная">
      <img src="/brand/tusova-header-logo.png" alt="TUSOVA" />
    </a>
    <nav className="site-header-nav" aria-label="Основная навигация">
      {links.map(({ page, label, href }) => <a key={page} href={href} aria-current={active === page ? "page" : undefined}>{label}</a>)}
    </nav>
    <div className="site-header-actions">
      <button type="button" className="site-theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? "Включить светлую тему" : "Включить ночной режим"} title={theme === "dark" ? "Светлая тема" : "Ночной режим"} aria-pressed={theme === "dark"}>{theme === "dark" ? <Moon size={19} /> : <Sun size={19} />}</button>
      <a className="site-header-login" href="/?auth=login#tusova-entry">Войти</a>
      <a className="site-header-register" href="/?auth=register#tusova-entry">Регистрация</a>
    </div>
  </header>;
}
