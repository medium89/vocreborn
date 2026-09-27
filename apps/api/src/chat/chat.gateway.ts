import { UsePipes, ValidationPipe } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import { SESSION_COOKIE, type AuthenticatedUser } from "../auth/auth.types";
import { RateLimitService } from "../security/rate-limit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SessionRevocationService } from "../security/session-revocation.service";
import { ChatService } from "./chat.service";
import { JoinRoomDto } from "./dto/join-room.dto";
import { UpdatePresenceDto } from "./dto/presence.dto";
import { SendDirectMessageDto, SendMessageDto } from "./dto/send-message.dto";
import type { ReactionUpdate } from "./chat.types";

type AuthenticatedSocket = Socket & { data: { user?: AuthenticatedUser } };
const OFFLINE_DELAY_MS = 5000;

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  const item = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined;
}

function clientIp(socket: Socket) {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return first?.trim() || socket.handshake.address || "unknown";
}

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  },
})
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly connections = new Map<string, Set<string>>();
  private readonly offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly chat: ChatService,
    private readonly auth: AuthService,
    private readonly limits: RateLimitService,
    sessionRevocation: SessionRevocationService,
    notifications: NotificationsService,
  ) {
    sessionRevocation.subscribe((userId) => {
      if (this.server) setTimeout(() => this.server.in("user:" + userId).disconnectSockets(true), 0);
    });
    notifications.subscribe((userId) => {
      if (this.server) this.server.to("user:" + userId).emit("notification:changed");
    });
  }

  afterInit(server: Server) {
    server.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const connectionLimit = this.limits.consume("ws:connect:ip:" + clientIp(socket), 30, 60 * 1000);
        if (!connectionLimit.allowed) return next(new Error("Слишком много подключений. Повторите позже."));

        const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
        const user = await this.auth.findByToken(token);
        if (!user) return next(new Error("Требуется вход"));
        socket.data.user = user;
        next();
      } catch {
        next(new Error("Не удалось проверить сессию"));
      }
    });
  }

  async handleConnection(client: AuthenticatedSocket) {
    const user = client.data.user;
    if (!user) return;

    const offlineTimer = this.offlineTimers.get(user.id);
    const reconnecting = Boolean(offlineTimer);
    if (offlineTimer) {
      clearTimeout(offlineTimer);
      this.offlineTimers.delete(user.id);
    }

    const sockets = this.connections.get(user.id) ?? new Set<string>();
    const firstConnection = sockets.size === 0;
    sockets.add(client.id);
    this.connections.set(user.id, sockets);
    await client.join("user:" + user.id);

    if (firstConnection && user.status !== "dnd") {
      await this.updatePresence(user, "online");
    } else if (firstConnection) {
      this.server.emit("presence:changed", { userId: user.id, status: "dnd" });
    }
    if (firstConnection && !reconnecting) await this.announceMainRoom(user.displayName, "вошёл в чат");
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const user = client.data.user;
    if (!user) return;

    const sockets = this.connections.get(user.id);
    sockets?.delete(client.id);
    if (sockets && sockets.size > 0) return;
    this.connections.delete(user.id);

    const previousTimer = this.offlineTimers.get(user.id);
    if (previousTimer) clearTimeout(previousTimer);

    const timer = setTimeout(() => {
      this.offlineTimers.delete(user.id);
      if (this.connections.has(user.id)) return;
      void this.updatePresence(user, "offline")
        .then(() => this.announceMainRoom(user.displayName, "вышел из чата"))
        .catch(() => undefined);
    }, OFFLINE_DELAY_MS);
    this.offlineTimers.set(user.id, timer);
  }

  @SubscribeMessage("presence:update")
  async setPresence(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() input: UpdatePresenceDto) {
    const user = client.data.user;
    if (!user) {
      client.disconnect(true);
      return;
    }
    if (!this.allowAction(client, user.id, "presence", 120, 60 * 1000)) return;
    await this.updatePresence(user, input.status);
    return { userId: user.id, status: input.status };
  }

  @SubscribeMessage("room:join")
  async joinRoom(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() input: JoinRoomDto) {
    const user = client.data.user;
    if (!user) {
      client.disconnect(true);
      return;
    }
    if (!this.allowAction(client, user.id, "room", 120, 60 * 1000)) return;
    await this.chat.joinMembership(user.id, input.roomId);
    await client.join(input.roomId);
    client.emit("room:snapshot", await this.chat.getSnapshot(input.roomId, user.id));
    return { ok: true, roomId: input.roomId };
  }

  @SubscribeMessage("room:leave")
  async leaveRoom(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() input: JoinRoomDto) {
    const user = client.data.user;
    if (!user || !this.allowAction(client, user.id, "room", 120, 60 * 1000)) return;
    await client.leave(input.roomId);
    return { ok: true, roomId: input.roomId };
  }

  @SubscribeMessage("message:send")
  async sendMessage(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() input: SendMessageDto) {
    const user = client.data.user;
    if (!user) {
      client.disconnect(true);
      return;
    }
    if (!this.allowAction(client, user.id, "message", 60, 10 * 1000)) return;

    const message = await this.chat.createMessage(input.roomId, input.body ?? "", input.requestId, user.id, user.displayName, input.attachmentId, input.replyToId, input.adminVoice);
    const payload = { roomId: input.roomId, message, requestId: input.requestId };
    this.server.to(input.roomId).emit("message:created", payload);
    return payload;
  }

  @SubscribeMessage("direct:send")
  async sendDirect(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() input: SendDirectMessageDto) {
    const user = client.data.user;
    if (!user) {
      client.disconnect(true);
      return;
    }
    if (!this.allowAction(client, user.id, "message", 60, 10 * 1000)) return;

    const message = await this.chat.createDirectMessage(input.recipientId, input.body ?? "", input.requestId, user.id, user.displayName, input.attachmentId, input.replyToId);
    const senderPayload = { peerId: input.recipientId, message, requestId: input.requestId };
    const recipientPayload = { peerId: user.id, message, requestId: input.requestId };
    this.server.to("user:" + user.id).emit("direct:created", senderPayload);
    this.server.to("user:" + input.recipientId).emit("direct:created", recipientPayload);
    return senderPayload;
  }

  notifyReaction(update: ReactionUpdate) {
    const payload = { messageId: update.messageId, userId: update.userId, selected: update.selected, reactions: update.reactions };
    if (update.roomId) {
      this.server.to(update.roomId).emit("reaction:updated", payload);
      return;
    }
    for (const userId of new Set(update.participantIds ?? [])) {
      this.server.to("user:" + userId).emit("reaction:updated", payload);
    }
  }

  emitRoomMessage(roomId: string, message: Awaited<ReturnType<ChatService["createBotMessage"]>>) {
    this.server.to(roomId).emit("message:created", { roomId, message });
  }

  emitDirectMessage(recipientId: string, authorId: string, message: Awaited<ReturnType<ChatService["createDirectMessage"]>>) {
    this.server.to("user:" + recipientId).emit("direct:created", { peerId: authorId, message });
  }

  notifyModeration(userId: string, payload: { mutedUntil: string | null; banned: boolean; actorName?: string }, disconnect = false) {
    const room = "user:" + userId;
    this.server.to(room).emit("moderation:changed", payload);
    if (disconnect) setTimeout(() => this.server.in(room).disconnectSockets(true), 0);
  }

  notifyChaos(userId: string, chaosUntil: string | null, actorName?: string) {
    this.server.to("user:" + userId).emit("chaos:changed", { chaosUntil, actorName });
  }

  notifyMessageDeleted(roomId: string, messageId: string) {
    this.server.to(roomId).emit("message:deleted", { roomId, messageId });
  }

  private async announceMainRoom(displayName: string, action: string) {
    const message = await this.chat.createSystemMessage("Пользователь " + displayName + " " + action + ".");
    this.server.to("main").emit("message:created", { roomId: "main", message });
  }

  private allowAction(client: AuthenticatedSocket, userId: string, action: string, limit: number, windowMs: number) {
    const user = this.limits.consume("ws:" + action + ":user:" + userId, limit, windowMs);
    const ip = this.limits.consume("ws:" + action + ":ip:" + clientIp(client), limit * 5, windowMs);
    if (user.allowed && ip.allowed) return true;
    client.emit("error", { code: "RATE_LIMITED", message: "Слишком много действий. Повторите позже." });
    return false;
  }

  private async updatePresence(user: AuthenticatedUser, status: "online" | "away" | "dnd" | "offline") {
    await this.chat.setPresence(user.id, status);
    user.status = status;
    this.server.emit("presence:changed", { userId: user.id, status });
  }
}
