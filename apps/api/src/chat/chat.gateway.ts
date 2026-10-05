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
import { PushService } from "../notifications/push.service";
import { SessionRevocationService } from "../security/session-revocation.service";
import { ChatService } from "./chat.service";
import { JoinRoomDto } from "./dto/join-room.dto";
import { UpdatePresenceDto } from "./dto/presence.dto";
import { ControlVideoRoomDto, SetVideoRoomSourceDto, VideoQueueItemDto, VideoRoomEndedDto, VideoRoomStateDto, VideoRoomTitleDto } from "./dto/video-room.dto";
import { SendDirectMessageDto, SendMessageDto } from "./dto/send-message.dto";
import type { ReactionUpdate } from "./chat.types";

type AuthenticatedSocket = Socket & { data: { user?: AuthenticatedUser } };
const OFFLINE_DELAY_MS = 20 * 60 * 1000;
const INACTIVITY_DISCONNECT_MS = 60 * 60 * 1000;

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
  private readonly inactivityTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly forcedOffline = new Set<string>();

  constructor(
    private readonly chat: ChatService,
    private readonly auth: AuthService,
    private readonly limits: RateLimitService,
    sessionRevocation: SessionRevocationService,
    notifications: NotificationsService,
    private readonly push: PushService,
  ) {
    chat.subscribeMessages(({ roomId, recipientId, authorId, requestId, message }) => {
      if (!this.server) return;
      if (roomId) {
        this.server.to(roomId).emit("message:created", { roomId, message, requestId });
      } else if (recipientId) {
        this.server.to("user:" + authorId).emit("direct:created", { peerId: recipientId, message, requestId });
        this.server.to("user:" + recipientId).emit("direct:created", { peerId: authorId, message, requestId });
      }
    });
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
    this.refreshInactivityTimer(user.id);

    if (firstConnection && user.status !== "dnd") {
      await this.updatePresence(user, "online");
    } else if (firstConnection) {
      this.server.emit("presence:changed", { userId: user.id, status: "dnd" });
    }
    if (firstConnection && !reconnecting) {
      await this.announceMainRoom(user.displayName, "вошёл в чат", user.id);
      await this.push.adminPresence(user.displayName);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const user = client.data.user;
    if (!user) return;

    const sockets = this.connections.get(user.id);
    sockets?.delete(client.id);
    if (sockets && sockets.size > 0) return;
    this.connections.delete(user.id);

    if (this.forcedOffline.delete(user.id)) return;

    const previousTimer = this.offlineTimers.get(user.id);
    if (previousTimer) clearTimeout(previousTimer);

    void this.updatePresence(user, "away").catch(() => undefined);

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

  @SubscribeMessage("presence:active")
  markPresenceActive(@ConnectedSocket() client: AuthenticatedSocket) {
    const user = client.data.user;
    if (!user) {
      client.disconnect(true);
      return;
    }
    if (!this.allowAction(client, user.id, "presence-active", 120, 60 * 1000)) return;
    this.refreshInactivityTimer(user.id);
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

  @SubscribeMessage("video:get")
  async getVideoState(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() input: VideoRoomStateDto) {
    const user = client.data.user;
    if (!user || !this.allowAction(client, user.id, "video-state", 120, 60 * 1000)) return;
    return this.chat.getVideoStateForMember(input.roomId, user.id);
  }

  @SubscribeMessage("video:set")
  async setVideoSource(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() input: SetVideoRoomSourceDto & { roomId: string }) {
    const user = client.data.user;
    if (!user || !this.allowAction(client, user.id, "video", 40, 60 * 1000)) return;
    const state = await this.chat.setVideoSource(input.roomId, user.id, input.videoUrl);
    this.server.to(input.roomId).emit("video:state", state);
    this.emitEconomyChanged(user.id);
    return state;
  }

  @SubscribeMessage("video:control")
  async controlVideo(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() input: ControlVideoRoomDto & { roomId: string }) {
    const user = client.data.user;
    if (!user || !this.allowAction(client, user.id, "video", 120, 60 * 1000)) return;
    const state = await this.chat.controlVideo(input.roomId, user.id, user.role, input.action, input.position);
    this.server.to(input.roomId).emit("video:state", state);
    return state;
  }

  @SubscribeMessage("video:remove")
  async removeVideo(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() input: VideoQueueItemDto) {
    const user = client.data.user;
    if (!user || !this.allowAction(client, user.id, "video", 120, 60 * 1000)) return;
    const state = await this.chat.removeVideoQueueItem(input.roomId, user.id, user.role, input.itemId);
    this.server.to(input.roomId).emit("video:state", state);
    return state;
  }

  @SubscribeMessage("video:ended")
  async videoEnded(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() input: VideoRoomEndedDto) {
    const user = client.data.user;
    if (!user || !this.allowAction(client, user.id, "video", 120, 60 * 1000)) return;
    const state = await this.chat.finishVideo(input.roomId, user.id, user.role, input.itemId);
    this.server.to(input.roomId).emit("video:state", state);
    return state;
  }

  @SubscribeMessage("video:title")
  async videoTitle(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() input: VideoRoomTitleDto) {
    const user = client.data.user;
    if (!user || !this.allowAction(client, user.id, "video", 120, 60 * 1000)) return;
    const state = await this.chat.updateVideoTitle(input.roomId, user.id, user.role, input.itemId, input.title);
    this.server.to(input.roomId).emit("video:state", state);
    return state;
  }
  @SubscribeMessage("message:send")
  async sendMessage(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() input: SendMessageDto) {
    const user = client.data.user;
    if (!user) {
      client.disconnect(true);
      return;
    }
    if (!this.allowAction(client, user.id, "message", 60, 10 * 1000)) return;

    const message = await this.chat.createMessage(input.roomId, input.body ?? "", input.requestId, user.id, user.displayName, input.attachmentId, input.replyToId, input.adminVoice, input.gifUrl, input.mentionUserIds);
    const payload = { roomId: input.roomId, message, requestId: input.requestId };
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

    const message = await this.chat.createDirectMessage(input.recipientId, input.body ?? "", input.requestId, user.id, user.displayName, input.attachmentId, input.replyToId, input.gifUrl);
    const senderPayload = { peerId: input.recipientId, message, requestId: input.requestId };
    return senderPayload;
  }

  notifyMessageUpdated(payload: { roomId?: string; recipientId?: string; message: import("./chat.types").ApiMessage }) { if (payload.roomId) { this.server.to(payload.roomId).emit("message:updated", { message: payload.message }); return; } if (payload.recipientId && payload.message.authorId) { this.server.to("user:" + payload.message.authorId).emit("message:updated", { message: payload.message }); this.server.to("user:" + payload.recipientId).emit("message:updated", { message: payload.message }); } }
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
  emitEconomyChanged(userId: string) { this.server?.to("user:" + userId).emit("economy:changed"); }
  emitBotPresence(userId: string, status: string) { this.server?.emit("presence:changed", { userId, status }); }

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

  private async announceMainRoom(displayName: string, action: string, greetingRecipientId?: string) {
    const message = await this.chat.createSystemMessage("Пользователь " + displayName + " " + action + ".", greetingRecipientId);
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

  private refreshInactivityTimer(userId: string) {
    const previousTimer = this.inactivityTimers.get(userId);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = setTimeout(() => this.disconnectInactiveUser(userId), INACTIVITY_DISCONNECT_MS);
    this.inactivityTimers.set(userId, timer);
  }

  private disconnectInactiveUser(userId: string) {
    this.inactivityTimers.delete(userId);
    if (!this.connections.has(userId)) return;
    this.forcedOffline.add(userId);
    void this.chat.setPresence(userId, "offline")
      .then(() => this.server.emit("presence:changed", { userId, status: "offline" }))
      .catch(() => undefined);
    this.server.in("user:" + userId).disconnectSockets(true);
  }
}
