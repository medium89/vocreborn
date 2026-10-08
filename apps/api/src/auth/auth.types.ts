import type { Gender, UserRole, UserStatus } from "@prisma/client";
import type { Request } from "express";

export type AuthenticatedUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  role: Lowercase<UserRole>;
  hideRole: boolean;
  hideDj: boolean;
  isDj: boolean;
  isGuest: boolean;
  status: Lowercase<UserStatus>;
  gender: Lowercase<Gender>;
  rating: number;
  credits: number;
  mutedUntil: string | null;
  chaosUntil: string | null;
  bio: string | null;
  avatarUrl: string | null;
  avatarThumbnailUrl: string | null;
  appearance?: Record<string, Record<string, string | boolean>>;
  earlyUserRewardJustGranted?: boolean;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export const SESSION_COOKIE = "voc_session";
