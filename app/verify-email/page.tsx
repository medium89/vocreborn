"use client";

import { useEffect, useState } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { verifyEmail } from "@/lib/auth-api";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setError("В ссылке нет кода подтверждения");
      setStatus("error");
      return;
    }
    void verifyEmail(token).then(() => {
      window.history.replaceState(null, "", "/verify-email");
      setStatus("done");
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Не удалось подтвердить почту");
      setStatus("error");
    });
  }, []);

  return <main className="tusova-recovery">
    <div className="tusova-recovery-inner">
      <header className="tusova-recovery-header">
        <a href="/" aria-label="TUSOVA — на главную"><img src="/brand/tusova-header-logo.png" alt="TUSOVA" /></a>
      </header>
      <section className="tusova-recovery-card" aria-labelledby="verify-title">
        <span className="tusova-recovery-kicker"><MailCheck size={17} /> Электронная почта</span>
        <h1 id="verify-title">{status === "loading" ? "Подтверждаем адрес…" : status === "done" ? "Почта подтверждена" : "Не получилось подтвердить"}</h1>
        <p>{status === "done" ? "Теперь этот адрес можно использовать для восстановления пароля." : status === "error" ? error : "Это займёт всего пару секунд."}</p>
        {status !== "loading" && <a className="tusova-recovery-submit" href="/">Вернуться в TUSOVA <ArrowRight size={20} /></a>}
      </section>
    </div>
  </main>;
}
