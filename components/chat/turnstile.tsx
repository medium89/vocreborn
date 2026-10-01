"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; theme: "light" | "dark"; callback: (token: string) => void; "error-callback": () => void; "expired-callback": () => void }) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function Turnstile({ onVerify, onError }: { onVerify: (token: string) => void; onError: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    const render = () => {
      if (!window.turnstile || !containerRef.current || widgetRef.current) return;
      widgetRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: onVerify,
        "error-callback": onError,
        "expired-callback": onError,
      });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]');
    if (existing) {
      existing.addEventListener("load", render);
      render();
      return () => { existing.removeEventListener("load", render); if (widgetRef.current) window.turnstile?.remove(widgetRef.current); };
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", render);
    document.head.appendChild(script);
    return () => { script.removeEventListener("load", render); if (widgetRef.current) window.turnstile?.remove(widgetRef.current); };
  }, [onError, onVerify, siteKey]);

  if (!siteKey) return <p className="tusova-auth-error">Гостевой вход пока настраивается.</p>;
  return <div ref={containerRef} className="tusova-turnstile" />;
}
