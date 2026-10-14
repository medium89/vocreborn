"use client";
import { useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { adminRequest } from "@/lib/admin-api";
import type { OAuthProvider } from "@/lib/auth-api";

type ProviderRecord = { provider: OAuthProvider; enabled: boolean; clientId: string; hasSecret: boolean; callbackUrl: string };
type ProviderDraft = ProviderRecord & { clientSecret: string };
const labels: Record<OAuthProvider, string> = {
  google: "Google", yandex: "Яндекс", vk: "VK ID", mail: "Mail.ru", telegram: "Telegram",
};
const notes: Record<OAuthProvider, string> = {
  google: "OAuth Web Client: запросите openid, email, profile.",
  yandex: "Приложение для авторизации; права login:info и login:email.",
  vk: "Приложение VK ID для сайта; укажите адрес возврата.",
  mail: "Приложение Mail ID с доступом userinfo.",
  telegram: "BotFather: Client ID и Secret, разрешённые URL и callback; алгоритм подписи RS256 или ES256.",
};
export function AdminAuthProvidersPanel() {
  const [items, setItems] = useState<ProviderDraft[]>([]);
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    setError("");
    try {
      const next = await adminRequest<ProviderRecord[]>("auth-providers");
      setItems(next.map((item) => ({ ...item, clientSecret: "" })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить приложения");
    }
  }
  useEffect(() => { void load(); }, []);
  function edit(provider: OAuthProvider, changes: Partial<ProviderDraft>) {
    setItems((old) => old.map((item) => item.provider === provider ? { ...item, ...changes } : item));
  }
  async function save(item: ProviderDraft) {
    setBusy(item.provider); setError(""); setNotice("");
    try {
      const next = await adminRequest<ProviderRecord[]>("auth-providers/" + item.provider, {
        enabled: item.enabled,
        clientId: item.clientId.trim(),
        ...(item.clientSecret.trim() ? { clientSecret: item.clientSecret.trim() } : {}),
      });
      setItems((current) => next.map((record) => record.provider === item.provider
        ? { ...record, clientSecret: "" }
        : current.find((draft) => draft.provider === record.provider) ?? { ...record, clientSecret: "" }));
      setNotice(labels[item.provider] + ": настройки сохранены.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить приложение");
    } finally { setBusy(null); }
  }
  return <section className="admin-panel">
    <header><h3>Вход через соцсети</h3><button type="button" onClick={() => void load()} disabled={busy !== null}><RefreshCw className="admin-refresh-icon" size={15} />Обновить</button></header>
    <p>Зарегистрируйте приложения у провайдеров и внесите данные ниже. Секрет после сохранения не показывается. Адрес возврата нужно добавить в настройках каждого приложения.</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {notice && <p className="user-editor-notice" role="status">{notice}</p>}
    <div className="auth-providers-grid">
      {items.map((item) => <article className="auth-provider-card" key={item.provider}>
        <div className="auth-provider-heading"><strong>{labels[item.provider]}</strong><label><input type="checkbox" checked={item.enabled} onChange={(event) => edit(item.provider, { enabled: event.target.checked })} />Включено</label></div>
        <small>{notes[item.provider]}</small>
        <label>ID приложения<input value={item.clientId} maxLength={255} onChange={(event) => edit(item.provider, { clientId: event.target.value })} placeholder="Client ID" /></label>
        <label>Секрет приложения<input type="password" autoComplete="new-password" value={item.clientSecret} maxLength={2048} onChange={(event) => edit(item.provider, { clientSecret: event.target.value })} placeholder={item.hasSecret ? "Сохранён; оставьте пустым, чтобы не менять" : "Client Secret"} /></label>
        <label>Адрес возврата<input readOnly value={item.callbackUrl} onFocus={(event) => event.target.select()} /></label>
        <button type="button" className="action-button" disabled={busy !== null || !item.clientId.trim() || (!item.hasSecret && !item.clientSecret.trim())} onClick={() => void save(item)}><Save size={15} />{busy === item.provider ? "Сохранение…" : "Сохранить"}</button>
      </article>)}
    </div>
  </section>;
}
