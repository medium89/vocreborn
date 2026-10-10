import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { io } from "socket.io-client";

for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^[\"']|[\"']$/g, "");
}
const baseUrl = new URL(process.env.DATABASE_URL);
assert(["localhost", "127.0.0.1", "[::1]", process.env.REALTIME_TEST_LOCAL_DB_HOST].includes(baseUrl.hostname), "Mafia test requires local PostgreSQL");
const databaseName = "tusova_mafia_test_" + Date.now();
const isolated = new URL(baseUrl);
isolated.pathname = "/" + databaseName;
const admin = new PrismaClient();
const prisma = new PrismaClient({ datasources: { db: { url: isolated.toString() } } });
const base = "http://127.0.0.1:3138";
const sockets = [];
let api;
let created = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function account(index, role = "USER") {
  const username = "mafia_test_" + index;
  const user = await prisma.user.create({ data: { username, displayName: "Игрок " + index, role, passwordHash: await hash("Integration123!") } });
  const response = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "Integration123!" }) });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert(cookie);
  const socket = io(base, { autoConnect: false, transports: ["websocket"], extraHeaders: { Cookie: cookie }, reconnection: false });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
  await socket.timeout(3000).emitWithAck("room:join", { roomId: "mafia-test" });
  return { user, socket };
}
const ack = (socket, event, body = {}) => socket.timeout(3000).emitWithAck(event, { roomId: "mafia-test", ...body });
async function waitPhase(socket, phase) {
  for (let index = 0; index < 80; index++) {
    const state = await ack(socket, "mafia:status");
    if (state?.phase === phase) return state;
    await sleep(100);
  }
  assert.fail("Phase did not become " + phase);
}

before(async () => {
  await admin.$executeRawUnsafe('CREATE DATABASE "' + databaseName + '"');
  created = true;
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: isolated.toString() }, stdio: "ignore" });
  await prisma.room.createMany({ data: [{ id: "main", name: "Main" }, { id: "mafia-test", name: "Мафия тест", isMafiaRoom: true }] });
  api = spawn(process.execPath, ["dist/main.js"], { env: { ...process.env, DATABASE_URL: isolated.toString(), API_PORT: "3138", NODE_ENV: "test", TUSOVA_BOTS_ENABLED: "false", TUSOVA_QUIZ_ENABLED: "false", TUSOVA_RADIO_ENABLED: "false" }, stdio: ["ignore", "ignore", "ignore"] });
  for (let index = 0; index < 100; index++) {
    try { if ((await fetch(base + "/api/health")).ok) return; } catch {}
    await sleep(100);
  }
  assert.fail("API did not start");
});

after(async () => {
  sockets.forEach(socket => socket.disconnect());
  if (api) {
    api.kill("SIGTERM");
    await new Promise(resolve => {
      if (api.exitCode !== null) return resolve();
      api.once("exit", resolve);
      setTimeout(() => { api.kill("SIGKILL"); resolve(); }, 2000).unref();
    });
  }
  await prisma.$disconnect();
  if (created) await admin.$executeRawUnsafe('DROP DATABASE "' + databaseName + '" WITH (FORCE)');
  await admin.$disconnect();
});

test("WebSocket Mafia: roles stay private, mafia chat stays private, phases survive in DB", async () => {
  const accounts = await Promise.all(Array.from({ length: 7 }, (_, index) => account(index + 1)));
  const players = accounts.slice(0, 6);
  const spectator = accounts[6];
  const host = players[0];
  const lobby = await ack(host.socket, "mafia:create");
  assert.equal(lobby.phase, "LOBBY");
  for (const player of players.slice(1)) assert.equal((await ack(player.socket, "mafia:join")).phase, "LOBBY");
  const publicStart = new Promise(resolve => spectator.socket.once("mafia:started", resolve));
  assert.equal((await ack(host.socket, "mafia:start")).phase, "NIGHT");
  const broadcast = await publicStart;
  assert(broadcast.state.players.every(player => player.role === undefined), "Public broadcast leaked a living role");

  const roles = await Promise.all(players.map(async player => ({ ...player, state: await ack(player.socket, "mafia:status") })));
  assert.equal(roles.filter(player => player.state.myRole === "MAFIA").length, 2);
  assert.equal(roles.filter(player => player.state.myRole === "DOCTOR").length, 1);
  assert.equal(roles.filter(player => player.state.myRole === "COMMISSAR").length, 1);
  assert(roles.every(player => player.state.players.every(other => other.role === undefined)));
  const [mafia1, mafia2] = roles.filter(player => player.state.myRole === "MAFIA");
  const commissar = roles.find(player => player.state.myRole === "COMMISSAR");
  const doctor = roles.find(player => player.state.myRole === "DOCTOR");
  const victim = roles.find(player => player.state.myRole === "CIVILIAN" && player.user.id !== host.user.id);
  assert(victim);
  const secret = new Promise(resolve => mafia2.socket.once("mafia:secret-message", resolve));
  const outsiderSecrets = [];
  spectator.socket.on("mafia:secret-message", payload => outsiderSecrets.push(payload));
  doctor.socket.on("mafia:secret-message", payload => outsiderSecrets.push(payload));
  assert.equal((await ack(mafia1.socket, "mafia:secret-message", { body: "Тайный план" })).ok, true);
  assert.equal((await secret).body, "Тайный план");
  await sleep(100);
  assert.equal(outsiderSecrets.length, 0);
  assert.equal((await ack(doctor.socket, "mafia:status")).secretMessages.length, 0);

  for (const mafia of [mafia1, mafia2])
    assert.equal((await ack(mafia.socket, "mafia:night-action", { type: "MAFIA_KILL", targetUserId: victim.user.id })).ok, true);
  await ack(commissar.socket, "mafia:night-action", { type: "COMMISSAR_CHECK", targetUserId: mafia1.user.id });
  await ack(doctor.socket, "mafia:night-action", { type: "DOCTOR_PROTECT", targetUserId: doctor.user.id });
  const game = await prisma.mafiaGame.findFirstOrThrow({ where: { roomId: "mafia-test" } });
  assert.equal(await prisma.mafiaNightAction.count({ where: { gameId: game.id } }), 4);
  await prisma.mafiaGame.update({ where: { id: game.id }, data: { phaseEndsAt: new Date(Date.now() - 1000) } });
  const day = await waitPhase(host.socket, "DAY");
  assert.equal(day.players.find(player => player.userId === victim.user.id)?.isAlive, false);
  assert.equal(day.players.find(player => player.userId === victim.user.id)?.role, "CIVILIAN");
  assert.equal((await ack(commissar.socket, "mafia:status")).checks[0].result, "MAFIA");
  assert.equal((await ack(spectator.socket, "mafia:status")).checks.length, 0);

  assert.equal((await ack(host.socket, "mafia:start-vote")).phase, "VOTING");
  for (const voter of roles.filter(player => player.user.id !== victim.user.id))
    await ack(voter.socket, "mafia:vote", { targetUserId: mafia1.user.id });
  assert.equal(await prisma.mafiaVote.count({ where: { gameId: game.id } }), 5);
  await prisma.mafiaGame.update({ where: { id: game.id }, data: { phaseEndsAt: new Date(Date.now() - 1000) } });
  const nextNight = await waitPhase(host.socket, "NIGHT");
  assert.equal(nextNight.round, 2);
  assert.equal(nextNight.players.find(player => player.userId === mafia1.user.id)?.role, "MAFIA");
  assert.equal(nextNight.players.find(player => player.userId === mafia1.user.id)?.isAlive, false);
  assert.equal((await ack(host.socket, "mafia:stop")).phase, "FINISHED");
});

test("Solo test mode: bots act, addressed chat stays private, admin sees every channel", async () => {
  const adminAccount = await account(8, "ADMIN");
  const spectator = await account(9);
  const created = await ack(adminAccount.socket, "mafia:create-test", { botCount: 5 });
  assert.equal(created.isTestMode, true);
  assert.equal(created.players.length, 6);
  assert.equal(created.players.filter(player => player.isAiBot).length, 5);
  assert.equal(created.adminView, true);
  const started = await ack(adminAccount.socket, "mafia:start");
  assert.equal(started.phase, "NIGHT");
  assert.equal(started.adminRoles.length, 6);
  const privateMessage = "Секрет для мафии";
  assert.equal((await ack(adminAccount.socket, "mafia:test-message", { audience: "MAFIA", body: privateMessage })).ok, true);
  const publicMessage = "Привет всем";
  assert.equal((await ack(adminAccount.socket, "mafia:test-message", { audience: "ALL", body: publicMessage })).ok, true);
  const spectatorState = await ack(spectator.socket, "mafia:status");
  assert.equal(spectatorState.adminView, false);
  assert(spectatorState.testMessages.some(message => message.body === publicMessage));
  assert(!spectatorState.testMessages.some(message => message.body === privateMessage));
  for (let index = 0; index < 100; index++) {
    if (await prisma.mafiaTestMessage.count({ where: { gameId: created.gameId, authorUserId: { not: adminAccount.user.id } } }) >= 5) break;
    await sleep(100);
  }
  const messages = await prisma.mafiaTestMessage.findMany({ where: { gameId: created.gameId } });
  assert(messages.filter(message => message.turnKey?.endsWith(":initial")).length >= 5, "Bots did not make opening turns");
  assert(messages.some(message => message.audience === "MAFIA"), "Mafia bot did not use the private channel");
  const actions = await prisma.mafiaNightAction.findMany({ where: { gameId: created.gameId } });
  assert(actions.every(action => created.players.some(player => player.userId === action.actorUserId && player.isAiBot)));
  const adminState = await ack(adminAccount.socket, "mafia:status");
  assert(adminState.testMessages.length > spectatorState.testMessages.length);
  assert.equal((await ack(adminAccount.socket, "mafia:advance-test")).phase, "DAY");
  assert.equal((await ack(adminAccount.socket, "mafia:stop")).phase, "FINISHED");
});
