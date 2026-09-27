import type { Metadata } from "next";
import { HelpPageContent } from "@/components/site/help-page-content";

export const metadata: Metadata = {
  title: "Помощь — TUSOVA",
  description: "Ответы на частые вопросы о чате, аккаунте, безопасности и магазине TUSOVA.",
};

export default function HelpPage() {
  return <HelpPageContent />;
}
