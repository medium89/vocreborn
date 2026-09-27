"use client";

import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { createRecoveryCode } from "@/lib/auth-api";

export function RecoveryCodePanel({ currentPassword }: { currentPassword: string }) {
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function generate() {
    setBusy(true);
    setMessage("");
    setCode("");
    try {
      const result = await createRecoveryCode(currentPassword);
      setCode(result.code);
      setExpiresAt(result.expiresAt);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Не удалось создать код");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Код скопирован");
    } catch {
      setMessage("Не удалось скопировать. Выдели код и сохрани вручную.");
    }
  }

  return <section className="profile-recovery-panel" aria-labelledby="recovery-code-heading">
    <h3 id="recovery-code-heading">Резервный код</h3>
    <p>Если забудешь пароль, этот код поможет восстановить доступ. Введи текущий пароль выше, создай код и сохрани его в надёжном месте. Новый код заменяет предыдущий.</p>
    <button type="button" className="action-button secondary" disabled={busy || currentPassword.length < 10} onClick={generate}><KeyRound size={15} />{busy ? "Создаём…" : "Создать резервный код"}</button>
    {code && <>
      <code>{code}</code>
      <p>Показываем код только сейчас. Он действует до {new Date(expiresAt).toLocaleDateString("ru-RU")} или до смены пароля.</p>
      <button type="button" className="action-button secondary" onClick={copy}><Copy size={15} />Скопировать код</button>
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
