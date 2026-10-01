import { ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";

type TurnstileResult = { success?: boolean };

@Injectable()
export class TurnstileService {
  async verify(token: string, remoteIp?: string) {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) throw new ServiceUnavailableException("Гостевой вход временно недоступен");

    let response: Response;
    try {
      response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
      });
    } catch {
      throw new ServiceUnavailableException("Не удалось проверить капчу. Повторите попытку.");
    }

    const result = await response.json().catch(() => null) as TurnstileResult | null;
    if (!response.ok || !result?.success) throw new ForbiddenException("Капча не пройдена. Обновите её и повторите попытку.");
  }
}
