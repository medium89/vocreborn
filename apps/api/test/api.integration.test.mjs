import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { once } from "node:events";
import { io } from "socket.io-client";
import test, { after, before } from "node:test";
import { PrismaClient } from "@prisma/client";

import sharp from "sharp";
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const port = 3101;
const base = "http://localhost:" + port;
const suffix = Date.now().toString().slice(-8);
const usernames = ["testadmin" + suffix, "testuser" + suffix, "testviewer" + suffix];
const prisma = new PrismaClient();
let api;
let admin;
let user;
let viewer;
let createdRoomId;
let avatarFilePath;

async function request(path, options = {}, cookie) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body, headers: response.headers, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

async function register(username, displayName) {
  const result = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: username + "@example.test", displayName, password: "Integration123!" }),
  });
  assert.equal(result.status, 201);
  return { user: result.body.user, cookie: result.cookie };
}

before(async () => {
  api = spawn(process.execPath, ["dist/main.js"], {
    cwd: process.cwd(),
    env: { ...process.env, API_PORT: String(port), NODE_ENV: "test", TUSOVA_BOTS_ENABLED: "false", SMTP_HOST: process.env.SMTP_HOST ?? "localhost", SMTP_PORT: process.env.SMTP_PORT ?? "1025", SMTP_FROM: process.env.SMTP_FROM ?? "TUSOVA <test@tusova.local>", SMTP_ALLOW_INSECURE: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const health = await fetch(base + "/api/health");
      if (health.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (attempt === 39) throw new Error("Test API did not start");
  }
  admin = await register(usernames[0], "Integration Admin");
  user = await register(usernames[1], "Integration User");
  viewer = await register(usernames[2], "Integration Viewer");
  await prisma.user.update({ where: { id: admin.user.id }, data: { role: "ADMIN" } });
});

after(async () => {
  if (avatarFilePath && fs.existsSync(avatarFilePath)) fs.unlinkSync(avatarFilePath);
  if (createdRoomId) await prisma.room.deleteMany({ where: { id: createdRoomId } });
  const ids = [admin?.user.id, user?.user.id, viewer?.user.id].filter(Boolean);
  const attachmentFiles = await prisma.attachment.findMany({ where: { uploaderId: { in: ids } }, select: { storageKey: true } });
  for (const item of attachmentFiles) {
    const path = new URL("../storage/attachments/" + item.storageKey, import.meta.url).pathname;
    if (fs.existsSync(path)) fs.unlinkSync(path);
  }
  await prisma.profilePost.deleteMany({ where: { OR: [{ authorId: { in: ids } }, { profileUserId: { in: ids } }] } });
  await prisma.attachment.deleteMany({ where: { uploaderId: { in: ids } } });
  await prisma.moderationAudit.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetUserId: { in: ids } }] } });
  await prisma.report.deleteMany({ where: { OR: [{ reporterId: { in: ids } }, { targetUserId: { in: ids } }, { handledById: { in: ids } }] } });
  await prisma.recoveryCode.deleteMany({ where: { userId: { in: ids } } });
  await prisma.message.deleteMany({ where: { authorId: { in: ids } } });
  await prisma.mute.deleteMany({ where: { OR: [{ userId: { in: ids } }, { moderatorId: { in: ids } }] } });
  await prisma.chaos.deleteMany({ where: { OR: [{ userId: { in: ids } }, { moderatorId: { in: ids } }] } });
  await prisma.ban.deleteMany({ where: { OR: [{ userId: { in: ids } }, { moderatorId: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
  api?.kill("SIGTERM");
});

test("liveness, readiness, request IDs and metrics are available", async () => {
  const live = await request("/api/health/live", { headers: { "X-Request-Id": "integration-health" } });
  assert.equal(live.status, 200);
  assert.equal(live.headers.get("x-request-id"), "integration-health");

  const ready = await request("/api/health/ready");
  assert.equal(ready.status, 200);
  assert.deepEqual(ready.body.components, { database: "ok", uploads: "ok", attachments: "ok" });

  const metricsResponse = await fetch(base + "/api/metrics");
  assert.equal(metricsResponse.status, 200);
  const metrics = await metricsResponse.text();
  assert.match(metrics, /voc_http_requests_total/);
  assert.match(metrics, /voc_process_resident_memory_bytes/);
});

test("registration creates an internal username and email login works", async () => {
  assert.equal(user.user.username, usernames[1]);
  const signedIn = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: (usernames[1] + "@example.test").toUpperCase(), password: "Integration123!" }),
  });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.body.user.id, user.user.id);
});

test("session and editable profile bio", async () => {
  const me = await request("/api/me", {}, user.cookie);
  assert.equal(me.status, 200);
  const updated = await request("/api/me", {
    method: "PATCH",
    body: JSON.stringify({ bio: "Integration profile", hideDj: true }),
  }, user.cookie);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.user.bio, "Integration profile");
  assert.equal(updated.body.user.hideDj, true);
  const profile = await request("/api/users/" + user.user.id, {}, admin.cookie);
  assert.equal(profile.status, 200);
  assert.equal(profile.body.displayName, "Integration User");
  assert.equal(profile.body.hideDj, true);
});

test("friends are stored, visible from both profiles and removable", async () => {
  const path = "/api/users/" + viewer.user.id + "/friends";
  const added = await request(path, { method: "POST" }, user.cookie);
  assert.equal(added.status, 201);
  assert.equal(added.body.added, true);
  assert.equal((await request(path, { method: "POST" }, user.cookie)).status, 201);
  const viewerFriends = await request(path, {}, user.cookie);
  assert.equal(viewerFriends.status, 200);
  assert.equal(viewerFriends.body.filter((friend) => friend.id === user.user.id).length, 1);
  const userFriends = await request("/api/users/" + user.user.id + "/friends", {}, viewer.cookie);
  assert.equal(userFriends.status, 200);
  assert.ok(userFriends.body.some((friend) => friend.id === viewer.user.id));
  assert.equal((await request("/api/users/" + user.user.id + "/friends", { method: "POST" }, user.cookie)).status, 400);
  const removed = await request("/api/users/" + user.user.id + "/friends", { method: "DELETE" }, viewer.cookie);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.added, false);
  assert.deepEqual((await request(path, {}, user.cookie)).body, []);
});

test("avatar upload validates content and serves the image", async () => {
  const malformed = new FormData();
  malformed.append("avatar", new Blob(["not an image"], { type: "image/png" }), "fake.png");
  assert.equal((await request("/api/me/avatar", { method: "POST", body: malformed }, user.cookie)).status, 400);

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const form = new FormData();
  form.append("avatar", new Blob([png], { type: "image/png" }), "avatar.png");
  const uploaded = await request("/api/me/avatar", { method: "POST", body: form }, user.cookie);
  assert.equal(uploaded.status, 201);
  assert.match(uploaded.body.user.avatarUrl, /^http:\/\/localhost:3001\/uploads\/avatars\//);
  const relative = new URL(uploaded.body.user.avatarUrl).pathname.replace(/^\/uploads\//, "");
  avatarFilePath = new URL("../uploads/" + relative, import.meta.url).pathname;
  const served = await fetch(uploaded.body.user.avatarUrl.replace("localhost:3001", "localhost:" + port));
  assert.equal(served.status, 200);
});

test("room owner can create and edit; another user cannot", async () => {
  const created = await request("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name: "Integration Room", description: "Created by test", tone: "blue" }),
  }, user.cookie);
  assert.equal(created.status, 201);
  createdRoomId = created.body.id;
  const updated = await request("/api/rooms/" + createdRoomId, {
    method: "PATCH",
    body: JSON.stringify({ name: "Updated Integration Room" }),
  }, user.cookie);
  assert.equal(updated.status, 200);
  const forbidden = await request("/api/rooms/" + createdRoomId, {
    method: "PATCH",
    body: JSON.stringify({ name: "Hijacked Room" }),
  }, admin.cookie);
  assert.equal(forbidden.status, 200, "admin is allowed to manage every room");
});

test("cursor pagination returns 50 then remaining messages without duplicates", async () => {
  for (let index = 0; index < 55; index += 1) {
    const sent = await request("/api/rooms/main/messages", {
      method: "POST",
      body: JSON.stringify({ body: "page-message-" + index, requestId: crypto.randomUUID() }),
    }, user.cookie);
    assert.equal(sent.status, 201);
  }
  const first = await request("/api/rooms/main/messages", {}, user.cookie);
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 50);
  assert.ok(first.body.nextCursor);
  assert.equal(first.body.nextCursor, first.body.items[0].id);
  const second = await request("/api/rooms/main/messages?cursor=" + first.body.nextCursor, {}, user.cookie);
  assert.equal(second.status, 200);
  const ids = new Set([...first.body.items, ...second.body.items].map((message) => message.id));
  assert.equal(ids.size, first.body.items.length + second.body.items.length);
  assert.ok(second.body.items.some((message) => message.body === "page-message-0"));
});
test("direct history uses the oldest message as its page cursor", async () => {
  const path = "/api/direct/" + viewer.user.id + "/messages";
  for (let index = 0; index < 55; index += 1) {
    const sent = await request(path, { method: "POST", body: JSON.stringify({ body: "direct-page-" + index, requestId: crypto.randomUUID() }) }, user.cookie);
    assert.equal(sent.status, 201);
  }
  const first = await request(path, {}, user.cookie);
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 50);
  assert.equal(first.body.nextCursor, first.body.items[0].id);
  const second = await request(path + "?cursor=" + first.body.nextCursor, {}, user.cookie);
  assert.equal(second.status, 200);
  assert.equal(second.body.items.length, 5);
  assert.equal(new Set([...first.body.items, ...second.body.items].map((message) => message.id)).size, 55);
});


test("community history is paged without duplicates", async () => {
  const original = await prisma.user.findUniqueOrThrow({ where: { id: viewer.user.id }, select: { credits: true } });
  await prisma.user.update({ where: { id: viewer.user.id }, data: { credits: 1000 } });
  let communityId;
  try {
    const created = await request("/api/communities", { method: "POST", body: JSON.stringify({ name: "Paging test " + suffix, joinPolicy: "open" }) }, viewer.cookie);
    assert.equal(created.status, 201);
    communityId = created.body.id;
    await prisma.communityMessage.createMany({ data: Array.from({ length: 55 }, (_, index) => ({ communityId, authorId: viewer.user.id, body: "community-page-" + index })) });
    const path = "/api/communities/" + communityId + "/chat/page";
    const first = await request(path, {}, viewer.cookie);
    assert.equal(first.status, 200);
    assert.equal(first.body.items.length, 50);
    assert.equal(first.body.nextCursor, first.body.items[0].id);
    const second = await request(path + "?cursor=" + first.body.nextCursor, {}, viewer.cookie);
    assert.equal(second.status, 200);
    assert.equal(second.body.items.length, 5);
    assert.equal(new Set([...first.body.items, ...second.body.items].map((message) => message.id)).size, 55);
  } finally {
    if (communityId) await prisma.community.delete({ where: { id: communityId } });
    await prisma.user.update({ where: { id: viewer.user.id }, data: { credits: original.credits } });
  }
});

test("admin voice requires a moderator or administrator and persists", async () => {
  const ordinary = await request("/api/rooms/main/messages", {
    method: "POST",
    body: JSON.stringify({ body: "ordinary cannot announce", adminVoice: true, requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(ordinary.status, 403);

  const announcement = await request("/api/rooms/main/messages", {
    method: "POST",
    body: JSON.stringify({ body: "admin announcement", adminVoice: true, requestId: crypto.randomUUID() }),
  }, admin.cookie);
  assert.equal(announcement.status, 201);
  assert.equal(announcement.body.message.adminVoice, true);
  assert.equal((await prisma.message.findUniqueOrThrow({ where: { id: announcement.body.message.id } })).adminVoice, true);
  const history = await request("/api/rooms/main/messages", {}, admin.cookie);
  assert.equal(history.body.items.find((message) => message.id === announcement.body.message.id)?.adminVoice, true);

  await prisma.user.update({ where: { id: viewer.user.id }, data: { role: "MODERATOR" } });
  try {
    const moderator = await request("/api/rooms/main/messages", {
      method: "POST",
      body: JSON.stringify({ body: "moderator announcement", adminVoice: true, requestId: crypto.randomUUID() }),
    }, viewer.cookie);
    assert.equal(moderator.status, 201);
    assert.equal(moderator.body.message.adminVoice, true);
  } finally {
    await prisma.user.update({ where: { id: viewer.user.id }, data: { role: "USER" } });
  }
});

test("password change revokes old sessions", async () => {
  const activeSocket = io(base, { transports: ["websocket"], extraHeaders: { Cookie: user.cookie } });
  await once(activeSocket, "connect");
  const disconnected = Promise.race([
    once(activeSocket, "disconnect"),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Old socket was not revoked")), 2000)),
  ]);

  const changed = await request("/api/me/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword: "Integration123!", newPassword: "Changed12345!" }),
  }, user.cookie);
  assert.equal(changed.status, 200);
  await disconnected;
  activeSocket.close();
  assert.equal((await request("/api/me", {}, user.cookie)).status, 401);
  user.cookie = changed.cookie;
});

test("recovery code resets password once and revokes old sessions", async () => {
  const denied = await request("/api/me/recovery-code", {
    method: "POST",
    body: JSON.stringify({ currentPassword: "Incorrect123!" }),
  }, viewer.cookie);
  assert.equal(denied.status, 401);

  const issued = await request("/api/me/recovery-code", {
    method: "POST",
    body: JSON.stringify({ currentPassword: "Integration123!" }),
  }, viewer.cookie);
  assert.equal(issued.status, 200);
  assert.match(issued.body.code, /^TUSOVA-[A-Za-z0-9_-]+$/);
  const stored = await prisma.recoveryCode.findFirstOrThrow({ where: { userId: viewer.user.id } });
  assert.notEqual(stored.codeHash, issued.body.code);

  const invalid = await request("/api/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ code: "TUSOVA-" + "x".repeat(32), newPassword: "Recovered123!" }),
  });
  assert.equal(invalid.status, 400);

  const reset = await request("/api/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ code: issued.body.code, newPassword: "Recovered123!" }),
  });
  assert.equal(reset.status, 200);
  assert.equal((await request("/api/me", {}, viewer.cookie)).status, 401);
  assert.equal((await request("/api/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ code: issued.body.code, newPassword: "AgainRecovered123!" }),
  })).status, 400);
  assert.equal((await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: usernames[2], password: "Integration123!" }),
  })).status, 401);
  const next = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: usernames[2], password: "Recovered123!" }),
  });
  assert.equal(next.status, 200);
  viewer.cookie = next.cookie;
});

async function emailFromMailpit(address, subject) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const listing = await fetch("http://localhost:8025/api/v1/messages").then((response) => response.json());
    const item = listing.messages.find((message) =>
      message.To.some((recipient) => recipient.Address === address) && message.Subject === subject);
    if (item) return fetch("http://localhost:8025/api/v1/message/" + item.ID).then((response) => response.json());
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Email was not delivered to Mailpit");
}

test("verified email resets password with a single-use link", async () => {
  const address = usernames[0] + "@example.test";
  const verifyMail = await emailFromMailpit(address, "Подтверди почту в TUSOVA");
  const verifyToken = new URL(verifyMail.Text.match(/https?:\/\/\S+/)[0]).searchParams.get("token");
  assert.ok(verifyToken);
  const verified = await request("/api/auth/email/verify", {
    method: "POST", body: JSON.stringify({ token: verifyToken }),
  });
  assert.equal(verified.status, 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: admin.user.id } })).emailVerifiedAt instanceof Date, true);

  const unknown = await request("/api/auth/password/email/request", {
    method: "POST", body: JSON.stringify({ email: "unknown@example.test" }),
  });
  assert.equal(unknown.status, 200);
  const requested = await request("/api/auth/password/email/request", {
    method: "POST", body: JSON.stringify({ email: address }),
  });
  assert.equal(requested.status, 200);
  assert.deepEqual(requested.body, unknown.body);

  const resetMail = await emailFromMailpit(address, "Восстановление пароля TUSOVA");
  const resetToken = new URL(resetMail.Text.match(/https?:\/\/\S+/)[0]).searchParams.get("token");
  assert.ok(resetToken);
  const reset = await request("/api/auth/password/email/reset", {
    method: "POST", body: JSON.stringify({ token: resetToken, newPassword: "EmailRecovered123!" }),
  });
  assert.equal(reset.status, 200);
  const replay = await request("/api/auth/password/email/reset", {
    method: "POST", body: JSON.stringify({ token: resetToken, newPassword: "EmailReplay123!" }),
  });
  assert.equal(replay.status, 400);
  assert.equal((await request("/api/me", {}, admin.cookie)).status, 401);

  const signedIn = await request("/api/auth/login", {
    method: "POST", body: JSON.stringify({ username: usernames[0], password: "EmailRecovered123!" }),
  });
  assert.equal(signedIn.status, 200);
  admin.cookie = signedIn.cookie;

  await prisma.user.update({ where: { id: admin.user.id }, data: { email: null, emailVerifiedAt: null } });
  const legacyEmail = "legacy-" + usernames[0] + "@example.test";
  const linked = await request("/api/me/email", {
    method: "POST", body: JSON.stringify({ email: legacyEmail, currentPassword: "EmailRecovered123!" }),
  }, admin.cookie);
  assert.equal(linked.status, 200);
  const legacyMail = await emailFromMailpit(legacyEmail, "Подтверди почту в TUSOVA");
  const legacyToken = new URL(legacyMail.Text.match(/https?:\/\/\S+/)[0]).searchParams.get("token");
  assert.equal((await request("/api/auth/email/verify", { method: "POST", body: JSON.stringify({ token: legacyToken }) })).status, 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: admin.user.id } })).emailVerifiedAt instanceof Date, true);
});


test("reports queue and audit are protected and reviewable", async () => {
  const sent = await request("/api/rooms/main/messages", {
    method: "POST",
    body: JSON.stringify({ body: "report target", requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(sent.status, 201);
  const messageId = sent.body.message.id;

  const created = await request("/api/reports", {
    method: "POST",
    body: JSON.stringify({ messageId, reason: "SPAM", details: "integration report" }),
  }, admin.cookie);
  assert.equal(created.status, 201);
  assert.equal((await request("/api/reports", {
    method: "POST",
    body: JSON.stringify({ messageId, reason: "SPAM" }),
  }, admin.cookie)).status, 409);

  assert.equal((await request("/api/moderation/reports", {}, user.cookie)).status, 403);
  const queue = await request("/api/moderation/reports?status=OPEN", {}, admin.cookie);
  assert.equal(queue.status, 200);
  assert.ok(queue.body.some((report) => report.id === created.body.id));

  const fakeAction = await request("/api/moderation/reports/" + created.body.id, {
    method: "PATCH",
    body: JSON.stringify({ status: "ACTIONED", resolution: "checked" }),
  }, admin.cookie);
  assert.equal(fakeAction.status, 400);

  const reviewed = await request("/api/moderation/reports/" + created.body.id, {
    method: "PATCH",
    body: JSON.stringify({ status: "REVIEWED" }),
  }, admin.cookie);
  assert.equal(reviewed.status, 200);

  const acted = await request("/api/moderation/reports/" + created.body.id + "/actions", {
    method: "POST",
    body: JSON.stringify({ action: "DELETE_MESSAGE", resolution: "integration moderation" }),
  }, admin.cookie);
  assert.equal(acted.status, 201);
  assert.equal(acted.body.status, "ACTIONED");
  assert.equal((await prisma.message.findUniqueOrThrow({ where: { id: messageId } })).deletedAt instanceof Date, true);
  assert.equal((await request("/api/moderation/reports/" + created.body.id + "/actions", {
    method: "POST",
    body: JSON.stringify({ action: "DELETE_MESSAGE" }),
  }, admin.cookie)).status, 409);
  const audit = await request("/api/moderation/audit", {}, admin.cookie);
  assert.equal(audit.status, 200);
  assert.ok(audit.body.some((entry) => entry.action === "MESSAGE_DELETE" && entry.reportId === created.body.id));
  assert.ok(audit.body.some((entry) => entry.action === "REPORT_ACTIONED" && entry.reportId === created.body.id));

  const userReport = await request("/api/reports", {
    method: "POST",
    body: JSON.stringify({ userId: admin.user.id, reason: "OTHER", details: "user target" }),
  }, user.cookie);
  assert.equal(userReport.status, 201);
});


test("attachments require valid signatures and are immediately available", async () => {
  const malformed = new FormData();
  malformed.append("file", new Blob(["not an image"], { type: "image/png" }), "fake.png");
  assert.equal((await request("/api/attachments", { method: "POST", body: malformed }, user.cookie)).status, 400);

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "safe.png");
  const uploaded = await request("/api/attachments", { method: "POST", body: form }, user.cookie);
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.status, "approved");

  const sent = await request("/api/rooms/main/messages", {
    method: "POST",
    body: JSON.stringify({ body: "", attachmentId: uploaded.body.id, requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(sent.status, 201);
  assert.equal(sent.body.message.attachments[0].status, "approved");

  assert.equal((await request("/api/attachments/" + uploaded.body.id + "/content", {}, viewer.cookie)).status, 200);
  const pending = await request("/api/attachments/pending", {}, admin.cookie);
  assert.equal(pending.status, 200);
  assert.ok(!pending.body.some((item) => item.id === uploaded.body.id));
  const rejected = await request("/api/attachments/" + uploaded.body.id + "/review", {
    method: "PATCH",
    body: JSON.stringify({ status: "REJECTED" }),
  }, admin.cookie);
  assert.equal(rejected.status, 200);
  assert.equal((await request("/api/attachments/" + uploaded.body.id + "/content", {}, viewer.cookie)).status, 404);
});

test("profile messages support one-level reply threads", async () => {
  const root = await request("/api/users/" + user.user.id + "/profile-posts", {
    method: "POST",
    body: JSON.stringify({ body: "Сообщение в профиле" }),
  }, admin.cookie);
  assert.equal(root.status, 201);

  const reply = await request("/api/users/" + user.user.id + "/profile-posts", {
    method: "POST",
    body: JSON.stringify({ body: "Ответ в ветке", parentId: root.body.id }),
  }, viewer.cookie);
  assert.equal(reply.status, 201);

  const posts = await request("/api/users/" + user.user.id + "/profile-posts", {}, user.cookie);
  assert.equal(posts.status, 200);
  const found = posts.body.find((item) => item.id === root.body.id);
  assert.equal(found.replies[0].body, "Ответ в ветке");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "wall.png");
  const uploaded = await request("/api/attachments", { method: "POST", body: form }, admin.cookie);
  assert.equal(uploaded.status, 201);
  const imageOnly = await request("/api/users/" + user.user.id + "/profile-posts", {
    method: "POST",
    body: JSON.stringify({ body: "", attachmentId: uploaded.body.id }),
  }, admin.cookie);
  assert.equal(imageOnly.status, 201);
  assert.equal(imageOnly.body.body, "");
  assert.equal(imageOnly.body.attachment.id, uploaded.body.id);
  assert.equal((await request("/api/attachments/" + uploaded.body.id + "/content", {}, viewer.cookie)).status, 200);
  await prisma.attachment.update({ where: { id: uploaded.body.id }, data: { createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } });
  assert.equal((await request("/api/attachments/" + uploaded.body.id + "/content", {}, viewer.cookie)).status, 200);
  assert.equal((await request("/api/users/" + user.user.id + "/profile-posts", {
    method: "POST", body: JSON.stringify({ body: "" }),
  }, admin.cookie)).status, 400);

  const noisy = await sharp(randomBytes(512 * 512 * 3), { raw: { width: 512, height: 512, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
  assert.ok(noisy.length > 100 * 1024);
  const largeForm = new FormData();
  largeForm.append("file", new Blob([noisy], { type: "image/jpeg" }), "large.jpg");
  const largeUpload = await request("/api/attachments", { method: "POST", body: largeForm }, admin.cookie);
  assert.equal(largeUpload.status, 201);
  assert.equal((await request("/api/users/" + user.user.id + "/profile-posts", {
    method: "POST", body: JSON.stringify({ body: "Фото", attachmentId: largeUpload.body.id }),
  }, admin.cookie)).status, 400);
});


test("only public room attachments expire after a day", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  async function upload() {
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "retention.png");
    const result = await request("/api/attachments", { method: "POST", body: form }, user.cookie);
    assert.equal(result.status, 201);
    return result.body.id;
  }

  const privateId = await upload();
  const privateMessage = await request("/api/direct/" + viewer.user.id + "/messages", {
    method: "POST", body: JSON.stringify({ body: "", attachmentId: privateId, requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(privateMessage.status, 201);
  assert.equal(privateMessage.body.message.attachments[0].expiresAt, undefined);
  await prisma.attachment.update({ where: { id: privateId }, data: { createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } });
  assert.equal((await request("/api/attachments/" + privateId + "/content", {}, viewer.cookie)).status, 200);

  const publicId = await upload();
  const publicMessage = await request("/api/rooms/main/messages", {
    method: "POST", body: JSON.stringify({ body: "", attachmentId: publicId, requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(publicMessage.status, 201);
  assert.ok(publicMessage.body.message.attachments[0].expiresAt);
  await prisma.attachment.update({ where: { id: publicId }, data: { createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } });
  assert.equal((await request("/api/attachments/" + publicId + "/content", {}, viewer.cookie)).status, 404);
});


test("message reactions can be selected, replaced and removed", async () => {
  const sent = await request("/api/rooms/main/messages", {
    method: "POST",
    body: JSON.stringify({ body: "reaction target", requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(sent.status, 201);
  const messageId = sent.body.message.id;

  const liked = await request("/api/messages/" + messageId + "/reaction", {
    method: "PUT",
    body: JSON.stringify({ type: "LIKE" }),
  }, user.cookie);
  assert.equal(liked.status, 200);
  assert.equal(liked.body.selected, "like");
  assert.deepEqual(liked.body.reactions, [{ type: "like", count: 1 }]);

  const laughed = await request("/api/messages/" + messageId + "/reaction", {
    method: "PUT",
    body: JSON.stringify({ type: "LAUGH" }),
  }, viewer.cookie);
  assert.equal(laughed.status, 200);
  assert.equal(laughed.body.reactions.reduce((sum, item) => sum + item.count, 0), 2);

  const history = await request("/api/rooms/main/messages", {}, user.cookie);
  const target = history.body.items.find((item) => item.id === messageId);
  assert.equal(target.reactions.find((item) => item.type === "like").mine, true);
  assert.equal(target.reactions.find((item) => item.type === "laugh").mine, false);

  const replaced = await request("/api/messages/" + messageId + "/reaction", {
    method: "PUT",
    body: JSON.stringify({ type: "DISLIKE" }),
  }, user.cookie);
  assert.equal(replaced.status, 200);
  assert.equal(replaced.body.selected, "dislike");
  assert.equal(replaced.body.reactions.some((item) => item.type === "like"), false);

  const removed = await request("/api/messages/" + messageId + "/reaction", {
    method: "PUT",
    body: JSON.stringify({ type: "DISLIKE" }),
  }, user.cookie);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.selected, null);
  assert.deepEqual(removed.body.reactions, [{ type: "laugh", count: 1 }]);

  const direct = await request("/api/direct/" + admin.user.id + "/messages", {
    method: "POST",
    body: JSON.stringify({ body: "private reaction target", requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(direct.status, 201);
  assert.equal((await request("/api/messages/" + direct.body.message.id + "/reaction", {
    method: "PUT",
    body: JSON.stringify({ type: "DISGUST" }),
  }, viewer.cookie)).status, 403);
});


test("quoted replies stay inside their room or direct conversation", async () => {
  const source = await request("/api/rooms/main/messages", {
    method: "POST",
    body: JSON.stringify({ body: "Исходное сообщение для цитаты", requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(source.status, 201);

  const reply = await request("/api/rooms/main/messages", {
    method: "POST",
    body: JSON.stringify({ body: "Короткий ответ", replyToId: source.body.message.id, requestId: crypto.randomUUID() }),
  }, viewer.cookie);
  assert.equal(reply.status, 201);
  assert.equal(reply.body.message.replyTo.id, source.body.message.id);
  assert.equal(reply.body.message.replyTo.authorId, user.user.id);
  assert.equal(reply.body.message.replyTo.author, source.body.message.author);
  assert.match(reply.body.message.replyTo.time, /^\d{2}:\d{2}$/);

  const crossRoom = await request("/api/rooms/music/messages", {
    method: "POST",
    body: JSON.stringify({ body: "Неверная цитата", replyToId: source.body.message.id, requestId: crypto.randomUUID() }),
  }, viewer.cookie);
  assert.equal(crossRoom.status, 400);

  const directSource = await request("/api/direct/" + admin.user.id + "/messages", {
    method: "POST",
    body: JSON.stringify({ body: "Личная цитата", requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(directSource.status, 201);

  const directReply = await request("/api/direct/" + user.user.id + "/messages", {
    method: "POST",
    body: JSON.stringify({ body: "Ответ в личном диалоге", replyToId: directSource.body.message.id, requestId: crypto.randomUUID() }),
  }, admin.cookie);
  assert.equal(directReply.status, 201);
  assert.equal(directReply.body.message.replyTo.id, directSource.body.message.id);

  const foreignDirect = await request("/api/direct/" + admin.user.id + "/messages", {
    method: "POST",
    body: JSON.stringify({ body: "Чужая цитата", replyToId: directSource.body.message.id, requestId: crypto.randomUUID() }),
  }, viewer.cookie);
  assert.equal(foreignDirect.status, 400);
});

test("store editor manages categories, images and every product field", async () => {
  assert.equal((await request("/api/admin/store", {}, user.cookie)).status, 403);
  assert.equal((await request("/api/admin/store/categories", {
    method: "POST", body: JSON.stringify({ name: "Forbidden", description: "", icon: "gift", active: true, position: 1 }),
  }, user.cookie)).status, 403);
  const categoryInput = { name: "Integration shop", description: "Temporary category", icon: "star", active: true, position: 9999 };
  let categoryId;
  let productId;
  try {
    const createdCategory = await request("/api/admin/store/categories", { method: "POST", body: JSON.stringify(categoryInput) }, admin.cookie);
    assert.equal(createdCategory.status, 201);
    categoryId = createdCategory.body.id;
    assert.equal(createdCategory.body.icon, "star");
    const publicCategories = await request("/api/gifts/categories", {}, user.cookie);
    assert.equal(publicCategories.status, 200);
    assert.ok(publicCategories.body.some((item) => item.id === categoryId));
    const hiddenCategory = await request("/api/admin/store/categories/" + categoryId, {
      method: "PUT", body: JSON.stringify({ ...categoryInput, name: "Renamed category", description: "Updated description", icon: "gem", active: false, position: 9998 }),
    }, admin.cookie);
    assert.equal(hiddenCategory.status, 200);
    assert.equal(hiddenCategory.body.name, "Renamed category");
    assert.equal(hiddenCategory.body.icon, "gem");
    assert.equal(hiddenCategory.body.position, 9998);
    assert.ok(!(await request("/api/gifts/categories", {}, user.cookie)).body.some((item) => item.id === categoryId));
    assert.equal((await request("/api/admin/store/categories/" + categoryId, {
      method: "PUT", body: JSON.stringify({ ...categoryInput, name: "Renamed category", active: true }),
    }, admin.cookie)).status, 200);

    const badImage = new FormData();
    badImage.append("image", new Blob(["not an image"], { type: "image/png" }), "bad.png");
    assert.equal((await request("/api/admin/store/categories/" + categoryId + "/image", { method: "POST", body: badImage }, admin.cookie)).status, 400);
    const image = new FormData();
    image.append("image", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")], { type: "image/png" }), "category.png");
    const uploaded = await request("/api/admin/store/categories/" + categoryId + "/image", { method: "POST", body: image }, admin.cookie);
    assert.equal(uploaded.status, 201);
    assert.match(uploaded.body.imageUrl, /store-categories/);

    const productInput = { categoryId, kind: "gift", name: "Integration gift", description: "First text", emoji: "🎁", price: 7, active: true, position: 81 };
    const createdProduct = await request("/api/admin/store/products", { method: "POST", body: JSON.stringify(productInput) }, admin.cookie);
    assert.equal(createdProduct.status, 201);
    productId = createdProduct.body.id;
    const changedProduct = await request("/api/admin/store/products/" + productId, {
      method: "PUT", body: JSON.stringify({ ...productInput, name: "Changed gift", description: "Updated text", emoji: "⭐", price: 13, active: true, position: 82 }),
    }, admin.cookie);
    assert.equal(changedProduct.status, 200);
    assert.equal(changedProduct.body.name, "Changed gift");
    assert.equal(changedProduct.body.description, "Updated text");
    assert.equal(changedProduct.body.emoji, "⭐");
    assert.equal(changedProduct.body.price, 13);
    assert.equal(changedProduct.body.position, 82);
    assert.equal(changedProduct.body.categoryId, categoryId);
    assert.ok((await request("/api/gifts", {}, user.cookie)).body.some((item) => item.id === productId));
    assert.equal((await request("/api/admin/store/products/" + productId, {
      method: "PUT", body: JSON.stringify({ ...productInput, active: false }),
    }, admin.cookie)).status, 200);
    assert.ok(!(await request("/api/gifts", {}, user.cookie)).body.some((item) => item.id === productId));
    assert.equal((await request("/api/admin/store/products/" + productId, {
      method: "PUT", body: JSON.stringify({ ...productInput, name: "Changed gift", description: "Updated text", emoji: "⭐", price: 13, active: true, position: 82 }),
    }, admin.cookie)).status, 200);
    const given = await request("/api/gifts/" + productId + "/send", { method: "POST", body: JSON.stringify({}) }, admin.cookie);
    assert.equal(given.status, 201);
    const reedited = await request("/api/admin/store/products/" + productId, {
      method: "PUT", body: JSON.stringify({ ...productInput, name: "New catalogue name", description: "New catalogue text", emoji: "✨", price: 14, active: true, position: 83 }),
    }, admin.cookie);
    assert.equal(reedited.status, 200);
    const inventory = await request("/api/gifts/me", {}, admin.cookie);
    const historical = inventory.body.find((item) => item.id === given.body.id);
    assert.equal(historical.gift.name, "Changed gift");
    assert.equal(historical.gift.emoji, "⭐");
    assert.equal(historical.gift.price, 13);
    assert.equal((await request("/api/admin/store/categories/" + categoryId, { method: "DELETE" }, admin.cookie)).status, 400);
    assert.equal((await request("/api/admin/store/products/" + productId, { method: "DELETE" }, admin.cookie)).status, 200);
    assert.ok(!(await request("/api/gifts", {}, user.cookie)).body.some((item) => item.id === productId));
    assert.equal((await request("/api/admin/store/categories/" + categoryId + "/image", { method: "DELETE" }, admin.cookie)).status, 200);
    assert.equal((await request("/api/admin/store/categories/" + categoryId, { method: "DELETE" }, admin.cookie)).status, 200);
  } finally {
    if (productId) {
      await prisma.giftInventory.deleteMany({ where: { giftId: productId } });
      await prisma.economyEntry.deleteMany({ where: { giftId: productId } });
      await prisma.giftCatalog.deleteMany({ where: { id: productId } });
    }
    if (categoryId) {
      const category = await prisma.storeCategory.findUnique({ where: { id: categoryId }, select: { imageKey: true } });
      if (category?.imageKey) {
        const imagePath = process.cwd() + category.imageKey;
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      }
      await prisma.storeCategory.deleteMany({ where: { id: categoryId } });
    }
  }
});

test("administrator overview and role management are protected", async () => {
  assert.equal((await request("/api/admin/overview", {}, user.cookie)).status, 403);
  const overview = await request("/api/admin/overview", {}, admin.cookie);
  assert.equal(overview.status, 200);
  assert.ok(overview.body.users >= 3);
  assert.ok(overview.body.messages >= 1);

  const users = await request("/api/admin/users?q=" + usernames[2], {}, admin.cookie);
  assert.equal(users.status, 200);
  assert.ok(users.body.some((item) => item.id === viewer.user.id));

  const changed = await request("/api/admin/users/" + viewer.user.id + "/role", {
    method: "PATCH",
    body: JSON.stringify({ role: "MODERATOR" }),
  }, admin.cookie);
  assert.equal(changed.status, 200);
  assert.equal(changed.body.role, "moderator");
  assert.equal((await request("/api/me", {}, viewer.cookie)).status, 401);
});

test("user editor restricts writes and validates account fields", async () => {
  const path = "/api/admin/users/" + user.user.id;
  assert.equal((await request(path, {}, user.cookie)).status, 403);
  assert.equal((await request(path, { method: "PATCH", body: JSON.stringify({ credits: 100 }) }, user.cookie)).status, 403);
  const original = await request(path, {}, admin.cookie);
  assert.equal(original.status, 200);
  assert.equal(original.body.id, user.user.id);
  assert.equal((await request(path, { method: "PATCH", body: JSON.stringify({ username: null }) }, admin.cookie)).status, 400);
  assert.equal((await request(path, { method: "PATCH", body: JSON.stringify({ username: admin.user.username }) }, admin.cookie)).status, 400);
  const changed = await request(path, {
    method: "PATCH",
    body: JSON.stringify({ displayName: "Edited Member", bio: "Updated by admin", gender: "FEMALE", rating: original.body.rating + 1, credits: original.body.credits + 2 }),
  }, admin.cookie);
  assert.equal(changed.status, 200);
  assert.equal(changed.body.displayName, "Edited Member");
  assert.equal(changed.body.credits, original.body.credits + 2);
  assert.equal(changed.body.gender, "female");
  assert.equal((await request("/api/admin/users/" + admin.user.id, { method: "DELETE" }, admin.cookie)).status, 400);
  const restored = await request(path, {
    method: "PATCH",
    body: JSON.stringify({ displayName: original.body.displayName, bio: original.body.bio ?? "", gender: original.body.gender.toUpperCase(), rating: original.body.rating, credits: original.body.credits }),
  }, admin.cookie);
  assert.equal(restored.status, 200);
});

test("chaos blocks public activity and spending but leaves private messages available", async () => {
  const deniedForMember = await request("/api/moderation/chaos", {
    method: "POST",
    body: JSON.stringify({ userId: viewer.user.id, durationMinutes: 15 }),
  }, user.cookie);
  assert.equal(deniedForMember.status, 403);

  const imposed = await request("/api/moderation/chaos", {
    method: "POST",
    body: JSON.stringify({ userId: user.user.id, durationMinutes: 15, reason: "integration chaos" }),
  }, admin.cookie);
  assert.equal(imposed.status, 201);
  assert.ok(imposed.body.chaosUntil);
  const me = await request("/api/me", {}, user.cookie);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.chaosUntil, imposed.body.chaosUntil);

  const publicMessage = await request("/api/rooms/main/messages", {
    method: "POST", body: JSON.stringify({ body: "blocked by chaos", requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(publicMessage.status, 403);
  const profileComment = await request("/api/users/" + viewer.user.id + "/profile-posts", {
    method: "POST", body: JSON.stringify({ body: "blocked comment" }),
  }, user.cookie);
  assert.equal(profileComment.status, 403);

  const direct = await request("/api/direct/" + viewer.user.id + "/messages", {
    method: "POST", body: JSON.stringify({ body: "private message remains allowed", requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(direct.status, 201);

  const gifts = await request("/api/gifts", {}, user.cookie);
  const pricedGift = gifts.body.find((item) => item.kind === "gift" && item.price > 0);
  if (pricedGift) {
    const purchase = await request("/api/gifts/" + pricedGift.id + "/send", {
      method: "POST", body: JSON.stringify({ recipientId: viewer.user.id }),
    }, user.cookie);
    assert.equal(purchase.status, 403);
  }

  assert.equal((await request("/api/moderation/chaos/" + user.user.id, { method: "DELETE" }, admin.cookie)).status, 200);
  assert.equal((await request("/api/me", {}, user.cookie)).body.user.chaosUntil, null);
  const restored = await request("/api/rooms/main/messages", {
    method: "POST", body: JSON.stringify({ body: "after chaos", requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(restored.status, 201);
});

test("mute blocks writing and ban revokes sessions", async () => {
  const muted = await request("/api/moderation/mutes", {
    method: "POST",
    body: JSON.stringify({ userId: user.user.id, durationMinutes: 15, reason: "integration" }),
  }, admin.cookie);
  assert.equal(muted.status, 201);
  const blocked = await request("/api/rooms/main/messages", {
    method: "POST",
    body: JSON.stringify({ body: "blocked", requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(blocked.status, 403);
  assert.equal((await request("/api/moderation/mutes/" + user.user.id, { method: "DELETE" }, admin.cookie)).status, 200);

  assert.equal((await request("/api/moderation/bans", {
    method: "POST",
    body: JSON.stringify({ userId: user.user.id, durationMinutes: 15 }),
  }, admin.cookie)).status, 201);
  assert.equal((await request("/api/me", {}, user.cookie)).status, 401);
  assert.equal((await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: usernames[1], password: "Changed12345!" }),
  })).status, 403);
  assert.equal((await request("/api/moderation/bans/" + user.user.id, { method: "DELETE" }, admin.cookie)).status, 200);
});


test("login rate limit blocks repeated credential attacks", async () => {
  const attemptedUsername = "missing" + suffix;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: attemptedUsername, password: "WrongPassword123!" }),
    });
    assert.equal(response.status, 401);
  }
  const blocked = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: attemptedUsername, password: "WrongPassword123!" }),
  });
  assert.equal(blocked.status, 429);
});
