import { Injectable } from "@nestjs/common";

@Injectable()
export class SessionRevocationService {
  private readonly listeners = new Set<(userId: string) => void>();

  subscribe(listener: (userId: string) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  revokeUser(userId: string) {
    for (const listener of this.listeners) listener(userId);
  }
}
