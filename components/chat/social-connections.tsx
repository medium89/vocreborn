"use client";
import { useEffect, useState } from "react";
import { beginOAuth, getLinkedOAuthProviders, getOAuthProviders, type OAuthProvider, type PublicOAuthProvider } from "@/lib/auth-api";

const labels: Record<OAuthProvider, string> = { google: "Google", yandex: "Яндекс", vk: "VK", mail: "Mail.ru", telegram: "Telegram" };
const order: OAuthProvider[] = ["google", "yandex", "vk", "mail", "telegram"];

export function SocialConnections() {
  const [available, setAvailable] = useState<PublicOAuthProvider[]>([]);
  const [linked, setLinked] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void Promise.all([getOAuthProviders(), getLinkedOAuthProviders()]).then(([providers, connected]) => {
      setAvailable(providers);
      setLinked(connected);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Не удалось загрузить соцсети"));
  }, []);
  return <section className="profile-social-connections">
    <h3>Вход через соцсети</h3>
    <p>Привяжите нужный аккаунт. После этого через него можно будет входить в ваш текущий профиль без нового пользователя.</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <div>{order.map((provider) => {
      const connected = linked.includes(provider);
      const enabled = available.some((item) => item.provider === provider && item.enabled);
      return <button type="button" key={provider} disabled={connected || !enabled} onClick={() => beginOAuth(provider, true)}>
        <strong>{labels[provider]}</strong><span>{connected ? "Привязан" : enabled ? "Привязать" : "Не настроен"}</span>
      </button>;
    })}</div>
  </section>;
}
