import assert from "node:assert/strict";
import test from "node:test";
import { MAFIA_AI_ENDPOINT, MAFIA_AI_MODEL, buildMafiaAiView, requestMafiaAiDecision } from "../dist/chat/mafia.ai.js";

test("bot view excludes other roles and messages addressed to other channels", () => {
  const input = {
    botId: "civilian", phase: "NIGHT", round: 1,
    players: [
      { userId: "civilian", name: "Я", isAlive: true, role: "CIVILIAN" },
      { userId: "mafia", name: "Мафия", isAlive: true, role: "MAFIA" },
      { userId: "doctor", name: "Доктор", isAlive: true, role: "DOCTOR" },
      { userId: "dead", name: "Выбыл", isAlive: false, role: "COMMISSAR" },
    ],
    allowedTargets: [], publicChat: [{ authorName: "Ведущий", body: "Для всех" }],
    directedMessages: [
      { authorName: "Ведущий", audience: "ALL", recipientUserId: null, body: "Для всех" },
      { authorName: "Ведущий", audience: "PLAYER", recipientUserId: "civilian", body: "Для меня" },
      { authorName: "Ведущий", audience: "PLAYER", recipientUserId: "doctor", body: "Секрет доктора" },
      { authorName: "Мафия", audience: "MAFIA", recipientUserId: null, body: "Секрет мафии" },
    ],
    mafiaChat: [{ authorName: "Мафия", body: "План убийства" }],
    checks: [{ targetUserId: "mafia" }], mafiaAllyChoices: ["doctor"],
  };
  const civilian = buildMafiaAiView(input);
  assert.deepEqual(civilian.publicChat.map(message => message.body), ["Для всех"]);
  assert.deepEqual(civilian.addressedChat.map(message => message.body), ["Для меня"]);
  assert.deepEqual(civilian.mafiaChat, []);
  assert.deepEqual(civilian.myChecks, []);
  assert.deepEqual(civilian.mafiaAllyChoices, []);
  assert.equal(civilian.players.find(player => player.userId === "mafia").role, undefined);
  assert.equal(civilian.players.find(player => player.userId === "dead").role, "COMMISSAR");
  const mafia = buildMafiaAiView({ ...input, botId: "mafia" });
  assert(mafia.addressedChat.some(message => message.body === "Секрет мафии"));
  assert(!mafia.addressedChat.some(message => message.body === "Секрет доктора"));
  assert.equal(mafia.players.find(player => player.userId === "doctor").role, undefined);
});

test("AITunnel request contains only the supplied bot view and validates the response", async () => {
  const view = {
    self: { userId: "bot-1", name: "Алиса", role: "COMMISSAR" },
    phase: "DAY", round: 2, audience: "ALL",
    players: [{ userId: "bot-1", name: "Алиса", isAlive: true, role: "COMMISSAR" },
      { userId: "other", name: "Борис", isAlive: true }],
    allowedTargets: [],
    publicChat: [{ authorName: "Ведущий", body: "Наступил день" }],
    addressedChat: [{ authorName: "Дима", audience: "COMMISSAR", body: "Только комиссару" }],
    mafiaChat: [], myChecks: [{ name: "Борис", result: "NOT_MAFIA" }], mafiaAllyChoices: [],
  };
  let captured;
  const transport = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ message: "Я думаю о Борисе.", targetUserId: "" }) } }] }), { status: 200 });
  };
  const decision = await requestMafiaAiDecision(view, "test-key", transport);
  assert.deepEqual(decision, { message: "Я думаю о Борисе.", targetUserId: "" });
  assert.equal(captured.url, MAFIA_AI_ENDPOINT);
  assert.equal(captured.options.headers.Authorization, "Bearer test-key");
  const payload = JSON.parse(captured.options.body);
  assert.equal(payload.model, MAFIA_AI_MODEL);
  assert.deepEqual(JSON.parse(payload.messages[1].content), view);
  assert(!captured.options.body.includes("Секрет мафии"));
});

test("AITunnel failures do not produce a forged bot turn", async () => {
  const emptyView = { self: { userId: "x", name: "Тест", role: "CIVILIAN" }, phase: "DAY", round: 1, audience: "ALL",
    players: [], allowedTargets: [], publicChat: [], addressedChat: [], mafiaChat: [], myChecks: [], mafiaAllyChoices: [] };
  await assert.rejects(() => requestMafiaAiDecision(emptyView, "", async () => { throw new Error("should not call"); }), /AITUNNEL_API_KEY/);
  await assert.rejects(() => requestMafiaAiDecision(emptyView, "test", async () => new Response("{}", { status: 503 })), /AITunnel HTTP 503/);
  await assert.rejects(() => requestMafiaAiDecision(emptyView, "test", async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })), /пустой ответ/);
});
