"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, HeartHandshake, LockKeyhole, Mail, MessageCircle, Sparkles, UserRound, UsersRound } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { useSiteTheme } from "@/lib/use-site-theme";
import { login, register } from "@/lib/auth-api";
import type { AuthUser } from "@/lib/chat-contract";

type Mode = "login" | "register";

function nicknameFromEmail(address: string) {
  return address.split("@")[0].normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 64) || "Участник";
}
const REMEMBERED_LOGIN_KEY = "tusova-remembered-login";

export function AuthModal({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const { theme } = useSiteTheme();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const savedLogin = window.localStorage.getItem(REMEMBERED_LOGIN_KEY);
    if (savedLogin?.includes("@")) setEmail(savedLogin);
    if (new URLSearchParams(window.location.search).get("auth") === "register") setMode("register");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (mode === "register" && registerStep === 1) {
      if (password !== passwordConfirmation) {
        setError("Пароли не совпадают");
        return;
      }
      if (!displayName) setDisplayName(nicknameFromEmail(email));
      setRegisterStep(2);
      return;
    }
    setBusy(true);
    try {
      const user = mode === "register"
        ? await register({ email, displayName, password })
        : await login({ email, password });
      if (rememberLogin) window.localStorage.setItem(REMEMBERED_LOGIN_KEY, email.trim().toLowerCase());
      else window.localStorage.removeItem(REMEMBERED_LOGIN_KEY);
      onAuthenticated(user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setRegisterStep(1);
    setError("");
    setPassword("");
    setPasswordConfirmation("");
  }

  return <main className={"tusova-landing " + (theme === "dark" ? "is-night" : "is-day")} id="top">
    <div className="tusova-landing-inner">
      <SiteHeader active="home" />

      <div className="tusova-hero">
        <section className="tusova-copy" aria-label="О TUSOVA">
          <img className="tusova-hero-logo" src="/brand/tusova-hero-logo.png" alt="TUSOVA" />
          <p className="tusova-script" id="tusova-night">Ночные разговоры <span>с особенными людьми</span></p>
          <p className="tusova-intro" id="tusova-about">TUSOVA — это чат для тех, кто оживает, когда другие спят. Здесь всегда есть с кем поговорить: о важном, о смешном, о жизни и о чём угодно.</p>
          <ul className="tusova-benefits" id="tusova-community">
            <li><span className="tusova-benefit-icon"><MessageCircle size={22} /></span><span>Живое общение 24/7</span></li>
            <li><span className="tusova-benefit-icon"><HeartHandshake size={22} /></span><span>Уютное комьюнити без осуждения</span></li>
            <li><span className="tusova-benefit-icon"><UsersRound size={22} /></span><span>Интересные люди и тёплая атмосфера</span></li>
            <li><span className="tusova-benefit-icon"><Sparkles size={22} /></span><span>Ночные разговоры, которые вдохновляют</span></li>
          </ul>
        </section>

        <section className="tusova-entry" id="tusova-entry" aria-labelledby="tusova-entry-title">
          <div className="tusova-entry-heading">
            <h1 id="tusova-entry-title">Снова ночь. Снова TUSOVA <span aria-hidden="true">☾</span></h1>
          </div>
          <div className="tusova-auth-tabs" role="tablist" aria-label="Способ входа">
            <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>Вход</button>
            <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>Регистрация</button>
          </div>
          {mode === "register" && <p className="tusova-email-hint">Шаг {registerStep} из 2 — {registerStep === 1 ? "почта и пароль" : "никнейм в чате"}</p>}
          <form className="tusova-auth-form" onSubmit={submit}>
            {(mode === "login" || registerStep === 1) && <>
              <label className="tusova-field"><span className="visually-hidden">Электронная почта</span><span className="tusova-input"><Mail size={18} aria-hidden="true" /><input type="email" autoComplete="email" value={email} onChange={(event) => {
                const nextEmail = event.target.value;
                if (!displayName || displayName === nicknameFromEmail(email)) setDisplayName(nicknameFromEmail(nextEmail));
                setEmail(nextEmail);
              }} maxLength={254} placeholder="Электронная почта" required /></span></label>
              <label className="tusova-field"><span className="visually-hidden">Пароль</span><span className="tusova-input"><LockKeyhole size={18} aria-hidden="true" /><input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} maxLength={128} placeholder="Пароль" required /><button type="button" className="tusova-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
              {mode === "register" && <label className="tusova-field"><span className="visually-hidden">Повторите пароль</span><span className="tusova-input"><LockKeyhole size={18} aria-hidden="true" /><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} minLength={10} maxLength={128} placeholder="Повторите пароль" required /></span></label>}
            </>}
            {mode === "register" && registerStep === 2 && <label className="tusova-field"><span className="visually-hidden">Никнейм в чате</span><span className="tusova-input"><UserRound size={18} aria-hidden="true" /><input autoComplete="nickname" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={64} placeholder="Никнейм в чате" required autoFocus /></span></label>}
            <div className="tusova-form-options">
              <label className="tusova-remember"><input type="checkbox" checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} /><span>Запомнить email</span></label>
              {mode === "login" && <a className="tusova-forgot" href="/recover">Забыли пароль?</a>}
              {mode === "register" && registerStep === 2 && <button type="button" className="tusova-forgot" onClick={() => { setRegisterStep(1); setError(""); }}>Назад</button>}
            </div>
            {error && <p className="tusova-auth-error" role="alert">{error}</p>}
            <button type="submit" className="tusova-submit" disabled={busy}><span>{busy ? "Подождите…" : mode === "login" ? "Войти в TUSOVA" : registerStep === 1 ? "Далее" : "Создать профиль"}</span><ArrowRight size={21} aria-hidden="true" /></button>
          </form>
          {mode === "register" && <p className="tusova-email-hint">После регистрации проверь почту и подтверди адрес по ссылке из письма.</p>}
          <div className="tusova-divider"><span>или</span></div>
          <button type="button" className="tusova-guest" disabled title="Гостевой вход пока не поддерживается"><span aria-hidden="true">♧</span>Войти как гость</button>
          <div className="tusova-entry-note">
            <img src="/brand/tusova-note-owl.png" alt="" width={50} height={50} />
            <p>Иногда лучшие разговоры начинаются просто с «привет» <span>♡</span></p>
          </div>
        </section>
      </div>
    </div>
  </main>;
}
