import { Injectable, Logger } from "@nestjs/common";
import webpush from "web-push";
import { PrismaService } from "../database/prisma.service";

type PushKind = "direct" | "mention" | "adminPresence";
type SubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    this.enabled = Boolean(publicKey && privateKey);
    if (this.enabled) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@tusova.su", publicKey!, privateKey!);
  }

  config() { return { enabled: this.enabled, publicKey: this.enabled ? process.env.VAPID_PUBLIC_KEY : null }; }

  async saveSubscription(userId: string, subscription: SubscriptionInput, preferences: Record<PushKind, boolean>) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: { userId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, ...preferences },
      update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, ...preferences },
    });
    return this.settings(userId, subscription.endpoint);
  }

  async settings(userId: string, endpoint?: string) {
    const subscription = endpoint
      ? await this.prisma.pushSubscription.findUnique({ where: { endpoint } })
      : await this.prisma.pushSubscription.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
    return { supported: this.enabled, subscribed: Boolean(subscription), direct: subscription?.direct ?? true, mention: subscription?.mention ?? true, adminPresence: subscription?.adminPresence ?? false };
  }

  async removeSubscription(userId: string, endpoint: string) { await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } }); }

  async send(userId: string, kind: PushKind, title: string, body: string, url: string) {
    if (!this.enabled) return;
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId, [kind]: true } });
    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title, body, url }));
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) await this.prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => undefined);
        else this.logger.warn("Push delivery failed: " + (error?.statusCode ?? "unknown"));
      }
    }));
  }

  async direct(userId: string, authorName: string, preview: string) { await this.send(userId, "direct", "Новое личное сообщение", authorName + ": " + (preview || "Вложение"), "/"); }
  async mention(userId: string, actorName: string, preview: string) { await this.send(userId, "mention", "Вас упомянули", actorName + ": " + (preview || "Сообщение"), "/"); }
  async adminPresence(name: string) {
    const admins = await this.prisma.user.findMany({ where: { role: "ADMIN", deletedAt: null }, select: { id: true } });
    await Promise.all(admins.map((admin) => this.send(admin.id, "adminPresence", "Пользователь вошёл в чат", name, "/")));
  }
}