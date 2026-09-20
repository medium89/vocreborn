import type { Gender, UserRole, UserStatus } from "@prisma/client";
import type { Request } from "express";

export type AuthenticatedUser = {
  id: string;
  username: string;
  displayName: string;
  role: Lowercase<UserRole>;
  status: Lowercase<UserStatus>;
  gender: Lowercase<Gender>;
  rating: number;
  credits: number;
  mutedUntil: string | null;
  bio: string | null;
  avatarUrl: string | null;
  avatarThumbnailUrl: string | null;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export const SESSION_COOKIE = "voc_session";
