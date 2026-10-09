import { API_URL } from "./chat-api";

export type CasinoColor = "red" | "black" | "green";
export type CasinoSpin = {
  id: string; requestId: string; choice: CasinoColor; number: number; color: CasinoColor;
  bet: number; payout: number; jackpotWon: number; jackpotChancePerMillion: number;
  balanceAfter: number; jackpotAfter: number; createdAt: string;
};
export type CasinoState = {
  balance: number; jackpot: number;
  settings: {
    enabled: boolean; minBet: number; maxBet: number; redBlackPayoutBps: number;
    greenPayoutBps: number; jackpotMinBet: number; jackpotCreditsPerTicket: number;
    jackpotBasePerTicketPerMillion: number; jackpotGrowthPer100000PerTicketPerMillion: number;
    jackpotMaxPerMillion: number;
  };
  recent: CasinoSpin[];
};

async function casinoRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(API_URL + "/api/casino" + path, {
    method: body === undefined ? "GET" : "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(". ") : payload?.message ?? "Не удалось выполнить ставку");
  return payload as T;
}
export const fetchCasino = () => casinoRequest<CasinoState>("");
export const spinRoulette = (requestId: string, choice: CasinoColor, bet: number) =>
  casinoRequest<CasinoSpin>("/spin", { requestId, choice, bet });
