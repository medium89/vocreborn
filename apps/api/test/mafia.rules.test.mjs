import assert from "node:assert/strict";
import { test } from "node:test";
import { MafiaNightActionType as Action, MafiaRole as Role } from "../node_modules/@prisma/client/index.js";
import { mafiaNightVictim, mafiaRoleDeck, mafiaVoteTarget, mafiaWinner } from "../dist/chat/mafia.rules.js";

const player = (userId, role, isAlive = true) => ({ userId, role, isAlive });

test("баланс ролей для 4, 5, 6–9 и 10–12 игроков", () => {
  for (const [count, mafia, doctor] of [[4, 1, 0], [5, 1, 1], [6, 2, 1], [9, 2, 1], [10, 3, 1], [12, 3, 1]]) {
    const roles = mafiaRoleDeck(count);
    assert.equal(roles.length, count);
    assert.equal(roles.filter(role => role === Role.MAFIA).length, mafia);
    assert.equal(roles.filter(role => role === Role.DOCTOR).length, doctor);
    assert.equal(roles.filter(role => role === Role.COMMISSAR).length, 1);
  }
});

test("ночное убийство требует единогласия всех живых мафиози", () => {
  const players = [player("m1", Role.MAFIA), player("m2", Role.MAFIA), player("a", Role.CIVILIAN), player("b", Role.DOCTOR)];
  const kill = (actorUserId, targetUserId) => ({ actorUserId, targetUserId, type: Action.MAFIA_KILL });
  assert.equal(mafiaNightVictim(players, [kill("m1", "a")]), null);
  assert.equal(mafiaNightVictim(players, [kill("m1", "a"), kill("m2", "b")]), null);
  assert.equal(mafiaNightVictim(players, [kill("m1", "a"), kill("m2", "a")]), "a");
  assert.equal(mafiaNightVictim(players, [kill("m1", "a"), kill("m2", "a"), { actorUserId: "b", targetUserId: "a", type: Action.DOCTOR_PROTECT }]), null);
});

test("ничья и воздержание не изгоняют игрока", () => {
  assert.equal(mafiaVoteTarget([{ targetUserId: "a" }, { targetUserId: "b" }, { targetUserId: null }]), null);
  assert.equal(mafiaVoteTarget([{ targetUserId: "a" }, { targetUserId: "a" }, { targetUserId: "b" }]), "a");
  assert.equal(mafiaVoteTarget([{ targetUserId: null }]), null);
});

test("победа определяется числом живых", () => {
  assert.equal(mafiaWinner([player("m", Role.MAFIA, false), player("a", Role.CIVILIAN)]), "CIVILIANS");
  assert.equal(mafiaWinner([player("m", Role.MAFIA), player("a", Role.CIVILIAN)]), "MAFIA");
  assert.equal(mafiaWinner([player("m", Role.MAFIA), player("a", Role.CIVILIAN), player("b", Role.CIVILIAN)]), null);
});
