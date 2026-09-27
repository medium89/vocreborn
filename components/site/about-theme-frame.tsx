"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type AboutTheme = "dark" | "light";

const AboutThemeContext = createContext<{ theme: AboutTheme; toggleTheme: () => void } | null>(null);

export function useAboutTheme() {
  return useContext(AboutThemeContext);
}

export function AboutThemeFrame({ children, className = "tusova-about" }: { children: ReactNode; className?: string }) {
  const [theme, setTheme] = useState<AboutTheme>("dark");
  const value = useMemo(() => ({
    theme,
    toggleTheme: () => setTheme((current) => current === "dark" ? "light" : "dark"),
  }), [theme]);

  return <AboutThemeContext.Provider value={value}>
    <main className={className} data-about-theme={theme}>{children}</main>
  </AboutThemeContext.Provider>;
}
