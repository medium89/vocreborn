"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Mail } from "lucide-react";
import { requestEmailPasswordReset, resetPassword, resetPasswordByEmail } from "@/lib/auth-api";

export default function RecoverPage() {
  const [mode, setMode] = useState<"email" | "code">("email");
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((token || mode === "code") && password !== confirmation) {
      setError("Пароли не совпадают");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (token) {
        await resetPasswordByEmail(token, password);
        window.history.replaceState(null, "", "/recover");
        setToken("");
        setDone(true);
      } else if (mode === "code") {
        await resetPassword(code.trim(), password);
        setDone(true);
        setCode("");
      } else {
        await requestEmailPasswordReset(email.trim());
        setSent(true);
      }
      setPassword("");
      setConfirmation("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось восстановить пароль");
    } finally {
      setBusy(false);
    }
  }

  return <main className="tusova-recovery">
    <div className="tusova-recovery-inner">
      <header className="tusova-recovery-header">
        <a href="/" aria-label="TUSOVA — на главную"><img src="/brand/tusova-header-logo.png" alt="TUSOVA" /></a>
        <a className="tusova-recovery-back" href="/"><ArrowLeft size={17} /> Вернуться к чату</a>
      </header>
      <section className="tusova-recovery-card" aria-labelledby="recovery-title">
        <span className="tusova-recovery-kicker"><KeyRound size={17} /> Безопасность аккаунта</span>
        {done ? <>
          <h1 id="recovery-title">Пароль обновлён</h1>
          <p>Все прежние сеансы завершены. Войди в TUSOVA с новым паролем.</p>
          <a className="tusova-recovery-submit" href="/">Перейти ко входу <ArrowRight size={20} /></a>
        </> : sent ? <>
          <h1 id="recovery-title">Проверь почту</h1>
          <p>Если к этому адресу привязан подтверждённый аккаунт, мы отправили ссылку для восстановления. Она действует 30 минут. Проверь также папку «Спам».</p>
          <button type="button" className="tusova-recovery-link" onClick={() => setSent(false)}>Отправить ещё раз</button>
        </> : <>
          <h1 id="recovery-title">Вернём тебя в разговор</h1>
          <p>{token ? "Придумай новый пароль для своего аккаунта." : mode === "email" ? "Введи адрес почты, указанный в аккаунте. Мы отправим ссылку для смены пароля." : "Введи сохранённый резервный код и придумай новый пароль."}</p>
          {!token && <div className="tusova-recovery-methods" role="tablist" aria-label="Способ восстановления">
            <button type="button" role="tab" aria-selected={mode === "email"} className={mode === "email" ? "active" : ""} onClick={() => { setMode("email"); setError(""); }}>По почте</button>
            <button type="button" role="tab" aria-selected={mode === "code"} className={mode === "code" ? "active" : ""} onClick={() => { setMode("code"); setError(""); }}>Резервный код</button>
          </div>}
          <form className="tusova-recovery-form" onSubmit={submit}>
            {!token && mode === "email" ? <label>Электронная почта
              <span className="tusova-input"><Mail size={18} aria-hidden="true" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" placeholder="Твоя почта" required /></span>
            </label> : <>
              {!token && <label>Резервный код
                <span className="tusova-input"><KeyRound size={18} aria-hidden="true" /><input value={code} onChange={(event) => setCode(event.target.value)} minLength={20} maxLength={80} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="TUSOVA-…" required /></span>
              </label>}
              <label>Новый пароль
                <span className="tusova-input"><LockKeyhole size={18} aria-hidden="true" /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} maxLength={128} autoComplete="new-password" placeholder="Не менее 10 символов" required /><button type="button" className="tusova-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>
              </label>
              <label>Повтори пароль
                <span className="tusova-input"><LockKeyhole size={18} aria-hidden="true" /><input type={showPassword ? "text" : "password"} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={10} maxLength={128} autoComplete="new-password" placeholder="Ещё раз новый пароль" required /></span>
              </label>
            </>}
            {error && <p className="tusova-auth-error" role="alert">{error}</p>}
            <button type="submit" className="tusova-submit" disabled={busy}>{busy ? "Подождите…" : !token && mode === "email" ? "Отправить ссылку" : "Сменить пароль"} <ArrowRight size={20} /></button>
          </form>
          {!token && mode === "code" && <p className="tusova-recovery-help">Код можно создать в настройках безопасности, пока есть доступ к аккаунту.</p>}
        </>}
      </section>
      <p className="tusova-recovery-caption">Снова ночь — и снова есть к кому вернуться ♡</p>
    </div>
  </main>;
}
