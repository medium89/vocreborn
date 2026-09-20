"use client";

import { FormEvent, useState } from "react";
import { ArrowRight } from "lucide-react";
import { login, register } from "@/lib/auth-api";
import type { AuthUser } from "@/lib/chat-contract";

type Mode = "login" | "register";

export function AuthModal({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<Mode>("register");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const user = mode === "register"
        ? await register({ username, displayName, password })
        : await login({ username, password });
      onAuthenticated(user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти");
    } finally { setBusy(false); }
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode); setError(""); setPassword("");
  }

  const title = mode === "register" ? "Создать профиль" : "С возвращением";

  return <div className="modal-backdrop auth-backdrop"><div className="modal auth-modal">
    <span className="brand-mark auth-brand logo-mark"><img src="/brand/aura-logo.png" alt="" /></span><span className="eyebrow">AURA</span><h2>{title}</h2>
    <p>{mode === "register" ? "Зарегистрируйтесь, чтобы войти в комнаты." : "Войдите в свой профиль."}</p>
    <div className="auth-tabs">
      <button className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>Регистрация</button>
      <button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>Вход</button>
    </div>
    <form className="auth-form" onSubmit={submit}>
      <label>Логин<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={32} pattern="[a-zA-Z0-9_]+" required /></label>
      {mode === "register" && <label>Отображаемое имя<input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={64} required /></label>}
      <label>Пароль<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} maxLength={128} required /></label>
      {error && <div className="auth-error">{error}</div>}
      <button className="action-button auth-submit" disabled={busy}><span>{busy ? "Подождите…" : mode === "register" ? "Создать профиль" : "Войти"}</span><ArrowRight size={16} /></button>
    </form>
  </div></div>;
}
