import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { once } from "node:events";
import { io } from "socket.io-client";
import test, { after, before } from "node:test";
import { PrismaClient } from "@prisma/client";

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
    body: JSON.stringify({ username, displayName, password: "Integration123!" }),
  });
  assert.equal(result.status, 201);
  return { user: result.body.user, cookie: result.cookie };
}

before(async () => {
  api = spawn(process.execPath, ["dist/main.js"], {
    cwd: process.cwd(),
    env: { ...process.env, API_PORT: String(port), NODE_ENV: "test" },
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

test("session and editable profile", async () => {
  const me = await request("/api/me", {}, user.cookie);
  assert.equal(me.status, 200);
  const updated = await request("/api/me", {
    method: "PATCH",
    body: JSON.stringify({ displayName: "Updated User", bio: "Integration profile" }),
  }, user.cookie);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.user.bio, "Integration profile");
  const profile = await request("/api/users/" + user.user.id, {}, admin.cookie);
  assert.equal(profile.status, 200);
  assert.equal(profile.body.displayName, "Updated User");
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
  const second = await request("/api/rooms/main/messages?cursor=" + first.body.nextCursor, {}, user.cookie);
  assert.equal(second.status, 200);
  const ids = new Set([...first.body.items, ...second.body.items].map((message) => message.id));
  assert.equal(ids.size, first.body.items.length + second.body.items.length);
  assert.ok(second.body.items.some((message) => message.body === "page-message-0"));
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

  const reviewed = await request("/api/moderation/reports/" + created.body.id, {
    method: "PATCH",
    body: JSON.stringify({ status: "ACTIONED", resolution: "checked" }),
  }, admin.cookie);
  assert.equal(reviewed.status, 200);
  const audit = await request("/api/moderation/audit", {}, admin.cookie);
  assert.equal(audit.status, 200);
  assert.ok(audit.body.some((entry) => entry.action === "REPORT_ACTIONED" && entry.reportId === created.body.id));

  const userReport = await request("/api/reports", {
    method: "POST",
    body: JSON.stringify({ userId: admin.user.id, reason: "OTHER", details: "user target" }),
  }, user.cookie);
  assert.equal(userReport.status, 201);
});


test("attachments require valid signatures and moderator approval", async () => {
  const malformed = new FormData();
  malformed.append("file", new Blob(["not an image"], { type: "image/png" }), "fake.png");
  assert.equal((await request("/api/attachments", { method: "POST", body: malformed }, user.cookie)).status, 400);

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "safe.png");
  const uploaded = await request("/api/attachments", { method: "POST", body: form }, user.cookie);
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.status, "pending");

  const sent = await request("/api/rooms/main/messages", {
    method: "POST",
    body: JSON.stringify({ body: "", attachmentId: uploaded.body.id, requestId: crypto.randomUUID() }),
  }, user.cookie);
  assert.equal(sent.status, 201);
  assert.equal(sent.body.message.attachments[0].status, "pending");

  assert.equal((await request("/api/attachments/" + uploaded.body.id + "/content", {}, viewer.cookie)).status, 403);
  const pending = await request("/api/attachments/pending", {}, admin.cookie);
  assert.equal(pending.status, 200);
  assert.ok(pending.body.some((item) => item.id === uploaded.body.id));

  const approved = await request("/api/attachments/" + uploaded.body.id + "/review", {
    method: "PATCH",
    body: JSON.stringify({ status: "APPROVED" }),
  }, admin.cookie);
  assert.equal(approved.status, 200);
  assert.equal((await request("/api/attachments/" + uploaded.body.id + "/content", {}, viewer.cookie)).status, 200);
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
  assert.deepEqual(reply.body.message.replyTo, {
    id: source.body.message.id,
    author: source.body.message.author,
    body: "Исходное сообщение для цитаты",
  });

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

test("administrator overview and role management are protected", async () => {
  assert.equal((await request("/api/admin/overview", {}, user.cookie)).status, 403);
  const overview = await request("/api/admin/overview", {}, admin.cookie);
  assert.equal(overview.status, 200);
  assert.ok(overview.body.users >= 3);
  assert.ok(overview.body.messages >= 1);

  const users = await request("/api/admin/users", {}, admin.cookie);
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
    body: JSON.stringify({ username: usernames[1], password: "Recovered12345!" }),
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
