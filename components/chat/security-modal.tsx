"use client";

import { useState } from "react";
import { KeyRound, X } from "lucide-react";

type Props = {
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onClose: () => void;
};

export function SecurityModal({ onChangePassword, onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function change(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword("");
      setMessage("Пароль изменён. Остальные сессии завершены.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить пароль");
    } finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onClick={onClose}><div className="modal security-modal" onClick={(event) => event.stopPropagation()}>
    <button className="modal-close" aria-label="Закрыть" title="Закрыть" onClick={onClose}><X size={19} /></button><h2>Безопасность</h2>
    <form className="security-form" onSubmit={change}>
      <h3>Сменить пароль</h3>
      <label>Текущий пароль<input type="password" autoComplete="current-password" minLength={10} maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
      <label>Новый пароль<input type="password" autoComplete="new-password" minLength={10} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
      <button className="action-button" disabled={busy}><KeyRound size={15} /><span>Сменить пароль</span></button>
    </form>
    {message && <div className="security-message">{message}</div>}
  </div></div>;
}
