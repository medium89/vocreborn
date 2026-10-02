"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/chat-api";

type Settings = { supported: boolean; subscribed: boolean; direct: boolean; mention: boolean; adminPresence: boolean };
function request(path: string, init?: RequestInit) { return fetch(API_URL + path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } }); }
function base64UrlToBytes(value: string) { const text = value.replace(/-/g, "+").replace(/_/g, "/"); const raw = atob(text + "=".repeat((4 - text.length % 4) % 4)); return Uint8Array.from(raw, (char) => char.charCodeAt(0)); }

export function PushAlertSettings({ admin }: { admin: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { void request("/api/notifications/push").then((response) => response.ok ? response.json() : null).then(setSettings).catch(() => setSettings(null)); }, []);
  async function enable() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !settings?.supported) return setMessage("Push-уведомления недоступны в этом браузере.");
    const permission = await Notification.requestPermission(); if (permission !== "granted") return setMessage("Разрешение на уведомления не выдано.");
    const config = await request("/api/notifications/push/config").then((response) => response.json());
    const registration = await navigator.serviceWorker.register("/push-sw.js");
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(config.publicKey) });
    await save(subscription, { direct: true, mention: true, adminPresence: admin }); setMessage("Уведомления включены.");
  }
  async function save(subscription: PushSubscription, next: Pick<Settings, "direct" | "mention" | "adminPresence">) {
    const json = subscription.toJSON(); const response = await request("/api/notifications/push", { method: "POST", body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, ...next }) });
    if (!response.ok) throw new Error(); setSettings(await response.json());
  }
  async function change(key: "direct" | "mention" | "adminPresence", value: boolean) {
    const registration = await navigator.serviceWorker.ready; const subscription = await registration.pushManager.getSubscription(); if (!subscription || !settings) return;
    try { await save(subscription, { direct: settings.direct, mention: settings.mention, adminPresence: settings.adminPresence, [key]: value }); } catch { setMessage("Не удалось сохранить настройку."); }
  }
  if (!settings) return null;
  const options: Array<["direct" | "mention" | "adminPresence", string, string]> = [["direct", "Личные сообщения", "Сообщать о новых личных сообщениях"], ["mention", "Упоминания", "Сообщать, когда вас упомянули в чате"], ...(admin ? ([ ["adminPresence", "Входы пользователей", "Сообщать, когда пользователь входит в чат"] ] as Array<["adminPresence", string, string]>) : [])];
  return <fieldset className="profile-tab-alerts"><legend>Уведомления на устройстве</legend><p>Приходят, когда сайт свёрнут или закрыт. Сначала подключите это устройство.</p>{!settings.subscribed && <button type="button" className="action-button" onClick={() => void enable()}>Включить push-уведомления</button>}{options.map(([key, title, detail]) => <label className="profile-tab-alert-option" key={key}><input type="checkbox" disabled={!settings.subscribed} checked={settings[key]} onChange={(event) => void change(key, event.target.checked)} /><span><strong>{title}</strong><small>{settings.subscribed ? detail : "Станет доступно после подключения устройства"}</small></span></label>)}{message && <p>{message}</p>}</fieldset>;
}