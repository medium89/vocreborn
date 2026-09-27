import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

  private getTransporter() {
    const localDev = process.env.NODE_ENV !== "production";
    const host = process.env.SMTP_HOST ?? (localDev ? "localhost" : undefined);
    const from = process.env.SMTP_FROM ?? (localDev ? "TUSOVA <no-reply@tusova.local>" : undefined);
    if (!host || !from) throw new ServiceUnavailableException("Отправка почты пока не настроена");
    if (!this.transporter) {
      const port = Number(process.env.SMTP_PORT ?? (localDev ? 1025 : 587));
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new ServiceUnavailableException("Некорректный порт почты");
      }
      const user = process.env.SMTP_USER;
      const password = process.env.SMTP_PASSWORD;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        requireTLS: !localDev || (process.env.SMTP_ALLOW_INSECURE !== "true" && !(host === "localhost" && port === 1025)) ? port !== 465 : false,
        ignoreTLS: localDev && (process.env.SMTP_ALLOW_INSECURE === "true" || (host === "localhost" && port === 1025)),
        auth: user && password ? { user, pass: password } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
    }
    return { transporter: this.transporter, from };
  }

  ensureConfigured() {
    this.getTransporter();
  }

  async sendLink(to: string, purpose: "verify" | "reset", token: string) {
    const { transporter, from } = this.getTransporter();
    const origin = (process.env.WEB_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
    const path = purpose === "verify" ? "/verify-email" : "/recover";
    const url = origin + path + "?token=" + encodeURIComponent(token);
    const subject = purpose === "verify" ? "Подтверди почту в TUSOVA" : "Восстановление пароля TUSOVA";
    const intro = purpose === "verify"
      ? "Подтверди адрес почты, чтобы восстановить доступ к своему аккаунту при необходимости."
      : "Чтобы задать новый пароль, перейди по ссылке ниже. Ссылка действует 30 минут.";
    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        text: intro + "\n\n" + url + "\n\nЕсли это был не ты, просто проигнорируй письмо.",
      });
    } catch {
      throw new ServiceUnavailableException("Не удалось отправить письмо. Попробуй позже.");
    }
  }
}
