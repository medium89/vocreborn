"use client";

import type { LucideIcon } from "lucide-react";
import {
  Award,
  BookOpenCheck,
  Compass,
  Crown,
  DoorOpen,
  Flame,
  Gem,
  Medal,
  MessagesSquare,
  Rocket,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  Trophy,
} from "lucide-react";

export type UserRank = {
  minRating: number;
  title: string;
  icon: LucideIcon;
  tier: 1 | 2 | 3 | 4 | 5;
};

export const USER_RANKS: readonly UserRank[] = [
  { minRating: 0, title: "Гость", icon: DoorOpen, tier: 1 },
  { minRating: 10, title: "Новичок", icon: Sprout, tier: 1 },
  { minRating: 30, title: "Собеседник", icon: MessagesSquare, tier: 1 },
  { minRating: 75, title: "Завсегдатай", icon: Compass, tier: 2 },
  { minRating: 150, title: "Активист", icon: Flame, tier: 2 },
  { minRating: 300, title: "Знаток", icon: BookOpenCheck, tier: 2 },
  { minRating: 600, title: "Авторитет", icon: ShieldCheck, tier: 3 },
  { minRating: 1_000, title: "Наставник", icon: Medal, tier: 3 },
  { minRating: 2_000, title: "Хранитель", icon: Crown, tier: 3 },
  { minRating: 4_000, title: "Серебряный голос", icon: Gem, tier: 4 },
  { minRating: 7_000, title: "Золотой голос", icon: Trophy, tier: 4 },
  { minRating: 12_000, title: "Платиновый голос", icon: Star, tier: 4 },
  { minRating: 20_000, title: "Легенда чата", icon: Sparkles, tier: 5 },
  { minRating: 35_000, title: "Мастер TUSOVA", icon: Rocket, tier: 5 },
  { minRating: 60_000, title: "Архонт TUSOVA", icon: Award, tier: 5 },
] as const;

export function getUserRank(rating: number): UserRank {
  const normalized = Math.max(0, Math.floor(Number.isFinite(rating) ? rating : 0));
  return [...USER_RANKS].reverse().find((rank) => normalized >= rank.minRating) ?? USER_RANKS[0];
}

export function UserRankBadge({ rating }: { rating: number }) {
  const rank = getUserRank(rating);
  const Icon = rank.icon;
  return (
    <span className={"user-rank user-rank-tier-" + rank.tier} title={rank.title + " · от " + rank.minRating + " рейтинга"}>
      <span className="user-rank-icon"><Icon size={14} strokeWidth={2.15} /></span>
      <span>{rank.title}</span>
    </span>
  );
}
