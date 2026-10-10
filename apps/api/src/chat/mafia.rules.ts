import { MafiaNightActionType, MafiaRole } from "@prisma/client";

export type MafiaPlayerRule = { userId: string; role: MafiaRole | null; isAlive: boolean };
export type MafiaActionRule = { actorUserId: string; type: MafiaNightActionType; targetUserId: string };
export type MafiaVoteRule = { targetUserId: string | null };

export function mafiaRoleDeck(count: number): MafiaRole[] {
  if (!Number.isInteger(count) || count < 4 || count > 12) throw new RangeError("Для игры нужно от 4 до 12 участников");
  const mafiaCount = count >= 10 ? 3 : count >= 6 ? 2 : 1;
  return [
    ...Array.from({ length: mafiaCount }, () => MafiaRole.MAFIA),
    ...(count >= 5 ? [MafiaRole.DOCTOR] : []),
    MafiaRole.COMMISSAR,
    ...Array.from({ length: count - mafiaCount - (count >= 5 ? 2 : 1) }, () => MafiaRole.CIVILIAN),
  ];
}

export function mafiaNightVictim(players: MafiaPlayerRule[], actions: MafiaActionRule[]): string | null {
  const mafia = players.filter(player => player.isAlive && player.role === MafiaRole.MAFIA);
  const kills = actions.filter(action => action.type === MafiaNightActionType.MAFIA_KILL && mafia.some(player => player.userId === action.actorUserId));
  if (!mafia.length || kills.length !== mafia.length || !kills.every(action => action.targetUserId === kills[0].targetUserId)) return null;
  const target = players.find(player => player.userId === kills[0].targetUserId && player.isAlive && player.role !== MafiaRole.MAFIA);
  if (!target) return null;
  const protectedTarget = actions.find(action => action.type === MafiaNightActionType.DOCTOR_PROTECT)?.targetUserId;
  return protectedTarget === target.userId ? null : target.userId;
}

export function mafiaVoteTarget(votes: MafiaVoteRule[]): string | null {
  const counts = new Map<string, number>();
  for (const vote of votes) if (vote.targetUserId) counts.set(vote.targetUserId, (counts.get(vote.targetUserId) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked.length && (!ranked[1] || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : null;
}

export function mafiaWinner(players: MafiaPlayerRule[]): "MAFIA" | "CIVILIANS" | null {
  const alive = players.filter(player => player.isAlive);
  const mafia = alive.filter(player => player.role === MafiaRole.MAFIA).length;
  if (!mafia) return "CIVILIANS";
  return mafia >= alive.length - mafia ? "MAFIA" : null;
}
