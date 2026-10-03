import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { HelpPageContent } from "@/components/site/help-page-content";

export const metadata: Metadata = pageMetadata("/help", "Помощь по чату TUSOVA", "Ответы на вопросы о входе, профиле, безопасности и возможностях онлайн-чата TUSOVA.");

export default function HelpPage() {
  return <HelpPageContent />;
}
