"use client";

import { ArrowLeft } from "lucide-react";

export function BackToChatButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="action-button secondary back-to-chat-button" aria-label="Вернуться в чат" onClick={onClick}><ArrowLeft size={16} />К чату</button>;
}
