"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { resendEmailVerification, setAccountEmail } from "@/lib/auth-api";
import type { AuthUser } from "@/lib/chat-contract";

export function EmailSettingsPanel({ user, currentPassword, onRefresh }: {
  user: AuthUser;
  currentPassword: string;
  onRefresh: () => void;
}) {
  const [email, setEmail] = useState(user.email ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function saveEmail() {
    setBusy(true);
    setMessage("");
    try {
      const result = await setAccountEmail(email.trim(), currentPassword);
      setMessage(result.alreadyVerified ? "Этот адрес уже подтверждён." : "Отправили письмо со ссылкой для подтверждения.");
      onRefresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Не удалось сохранить почту");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setMessage("");
    try {
      await resendEmailVerification();
      setMessage("Письмо отправлено повторно. Проверь также папку «Спам».");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Не удалось отправить письмо");
    } finally {
      setBusy(false);
    }
  }

  return <section className="profile-recovery-panel" aria-labelledby="account-email-heading">
    <h3 id="account-email-heading">Электронная почта</h3>
    <p>{user.email ? user.emailVerified ? "Адрес подтверждён. Через него можно восстановить пароль." : "Адрес ещё не подтверждён. Проверь почту или отправь письмо повторно." : "Привяжи почту, чтобы восстанавливать пароль по ссылке."}</p>
    <label className="profile-email-label">Адрес почты
      <span className="profile-field"><Mail size={16} /><input type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></span>
    </label>
    <div className="profile-email-actions">
      <button type="button" className="action-button secondary" disabled={busy || currentPassword.length < 10 || !email.trim()} onClick={saveEmail}><Mail size={15} />{busy ? "Подождите…" : "Сохранить почту"}</button>
      {user.email && !user.emailVerified && <button type="button" className="action-button secondary" disabled={busy} onClick={resend}>Отправить письмо ещё раз</button>}
    </div>
    {message && <p role="status">{message}</p>}
  </section>;
}
