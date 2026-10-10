import { API_URL } from "./chat-api";
export type ChatSettings = {
  registrationOpen: boolean; allowUserRooms: boolean; maintenance: boolean; allowLinks: boolean;
  maxMessageLength: number; slowModeSeconds: number; imageMaxMb: number; audioMaxMb: number;
  casinoEnabled: boolean; casinoMinBet: number; casinoMaxBet: number; casinoRedBlackPayoutBps: number;
  casinoGreenPayoutBps: number; casinoJackpotMinBet: number; casinoJackpotCreditsPerTicket: number;
  casinoJackpotBasePerTicketPerMillion: number; casinoJackpotGrowthPer100000PerTicketPerMillion: number;
  casinoJackpotMaxPerMillion: number;
  initialCredits: number; firstMessageReward: number; firstReplyReward: number; profileCommentReward: number; photoLikeReward: number; profilePostLikeReward: number; videoQueuePrice: number; mafiaNightSeconds: number; mafiaDaySeconds: number; mafiaVotingSeconds: number;
};
export type SettingsRecord = { settings: ChatSettings; version: number };
export type SystemState = { uptimeSeconds: number; databaseMs: number; memoryMb: number; diskFreeMb: number | null; environment: string; modules: { radio: boolean; quiz: boolean; testBots: boolean } };
export type EconomyRecord = { id: string; type: string; creditsDelta: number; ratingDelta: number; balanceAfter: number; createdAt: string; user: { id: string; displayName: string; username: string } };
export async function adminRequest<T>(path: string, body?: unknown, method = "PATCH"): Promise<T> {
  const response = await fetch(API_URL + "/api/admin/" + path, { credentials: "include", method: body === undefined ? "GET" : method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(". ") : payload?.message ?? "Не удалось выполнить действие");
  return payload as T;
}
