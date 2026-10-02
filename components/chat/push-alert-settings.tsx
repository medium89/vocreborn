"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/chat-api";

type Settings = { supported: boolean; subscribed: boolean; direct: boolean; mention: boolean; adminPresence: boolean; adminMessages: boolean };
type PushConfig = { enabled: boolean; publicKey: string | null };
function request(path: string, init?: RequestInit) { return fetch(API_URL + path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } }); }
function base64UrlToBytes(value: string) { const text = value.replace(/-/g, "+").replace(/_/g, "/"); const raw = atob(text + "=".repeat((4 - text.length % 4) % 4)); return Uint8Array.from(raw, (char) => char.charCodeAt(0)); }

export function PushAlertSettings({ admin }: { admin: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    void request("/api/notifications/push").then(async (response) => {
      if (!response.ok) throw new Error();
      setSettings(await response.json());
    }).catch(() => setMessage("Не удалось проверить настройки уведомлений. Обновите страницу и войдите снова.")).finally(() => setLoading(false));
  }, []);

  async function enable() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !settings?.supported) {
      setMessage("Push-уведомления недоступны в этом браузере.");
      return;
    }
    setEnabling(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Разрешение на уведомления не выдано. Разрешите уведомления для tusova.su в настройках браузера.");
        return;
      }
      const configResponse = await request("/api/notifications/push/config");
      if (!configResponse.ok) throw new Error();
      const config = await configResponse.json() as PushConfig;
      if (!config.enabled || !config.publicKey) throw new Error();
      const registration = await navigator.serviceWorker.register("/push-sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(config.publicKey) });
      await save(subscription, { direct: true, mention: true, adminPresence: admin, adminMessages: admin });
      setMessage("Устройство подключено. Уведомления включены.");
    } catch {
      setMessage("Не удалось подключить уведомления. Проверьте разрешение браузера и попробуйте ещё раз.");
    } finally {
      setEnabling(false);
    }
  }

  async function save(subscription: PushSubscription, next: Pick<Settings, "direct" | "mention" | "adminPresence" | "adminMessages">) {
    const json = subscription.toJSON();
    const response = await request("/api/notifications/push", { method: "POST", body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, ...next }) });
    if (!response.ok) throw new Error();
    setSettings(await response.json());
  }

  async function change(key: "direct" | "mention" | "adminPresence" | "adminMessages", value: boolean) {
    if (!settings) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error();
      await save(subscription, { direct: settings.direct, mention: settings.mention, adminPresence: settings.adminPresence, adminMessages: settings.adminMessages, [key]: value });
    } catch {
      setMessage("Не удалось сохранить настройку.");
    }
  }

  const options: Array<["direct" | "mention" | "adminPresence" | "adminMessages", string, string]> = [["direct", "Личные сообщения", "Сообщать о новых личных сообщениях"], ["mention", "Упоминания", "Сообщать, когда вас упомянули в чате"], ...(admin ? ([["adminPresence", "Входы пользователей", "Сообщать, когда пользователь входит в чат"], ["adminMessages", "Сообщения в общих комнатах", "Сообщать о новых сообщениях во всех комнатах"]] as Array<["adminPresence" | "adminMessages", string, string]>) : [])];
  return <fieldset className="profile-tab-alerts"><legend>Уведомления на устройстве</legend><p>Приходят, когда сайт свёрнут или закрыт. Сначала подключите это устройство.</p>{loading ? <p>Проверяем подключение устройства…</p> : settings ? <>{!settings.subscribed && <button type="button" className="action-button" disabled={enabling} onClick={() => void enable()}>{enabling ? "Подключаем…" : "Включить push-уведомления"}</button>}{options.map(([key, title, detail]) => <label className="profile-tab-alert-option" key={key}><input type="checkbox" disabled={!settings.subscribed} checked={settings[key]} onChange={(event) => void change(key, event.target.checked)} /><span><strong>{title}</strong><small>{settings.subscribed ? detail : "Станет доступно после подключения устройства"}</small></span></label>)}</> : null}{message && <p>{message}</p>}</fieldset>;
}
