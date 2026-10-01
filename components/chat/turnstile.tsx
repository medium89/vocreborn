"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; theme: "light" | "dark"; callback: (token: string) => void; "error-callback": () => void; "expired-callback": () => void }) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function Turnstile({ onVerify, onError }: { onVerify: (token: string) => void; onError: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onVerify, onError });
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  callbacksRef.current = { onVerify, onError };

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let interval = 0;
    let timeout = 0;
    let script: HTMLScriptElement | null = null;

    const fail = () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      setLoadError(true);
      callbacksRef.current.onError();
    };
    const render = () => {
      if (!window.turnstile || !containerRef.current || widgetRef.current) return false;
      widgetRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token) => callbacksRef.current.onVerify(token),
        "error-callback": () => callbacksRef.current.onError(),
        "expired-callback": () => callbacksRef.current.onError(),
      });
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      return true;
    };
    const waitForApi = () => {
      if (render()) return;
      interval = window.setInterval(render, 100);
      timeout = window.setTimeout(fail, 10_000);
    };

    const existing = document.querySelector<HTMLScriptElement>('script[src="' + SCRIPT_URL + '"]');
    if (existing) {
      existing.addEventListener("load", waitForApi);
      existing.addEventListener("error", fail);
      waitForApi();
    } else {
      script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", waitForApi);
      script.addEventListener("error", fail);
      document.head.appendChild(script);
    }

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      if (script) {
        script.removeEventListener("load", waitForApi);
        script.removeEventListener("error", fail);
      }
      if (widgetRef.current) window.turnstile?.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [attempt, siteKey]);

  if (!siteKey) return <p className="tusova-auth-error">Гостевой вход пока настраивается.</p>;
  if (loadError) return <p className="tusova-auth-error">Не удалось загрузить капчу. Отключите блокировщик рекламы или VPN и <button type="button" className="tusova-forgot" onClick={() => { setLoadError(false); setAttempt((value) => value + 1); }}>повторите попытку</button>.</p>;
  return <div ref={containerRef} className="tusova-turnstile" />;
}
