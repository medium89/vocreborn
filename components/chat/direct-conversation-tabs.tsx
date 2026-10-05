"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { MessagesSquare, X } from "lucide-react";
import type { DirectConversation, Person } from "@/lib/chat-contract";

type Props = {
  conversations: DirectConversation[];
  dialogId: string | null;
  showReturn: boolean;
  onReturn: () => void;
  onOpen: (person: Person) => void;
  onDismiss: (personId: string) => void;
};

export function DirectConversationTabs({ conversations, dialogId, showReturn, onReturn, onOpen, onDismiss }: Props) {
  const sorted = useMemo(() => [...conversations].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)), [conversations]);
  const [visibleCount, setVisibleCount] = useState(sorted.length);
  const [open, setOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState<CSSProperties | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const overflow = sorted.slice(visibleCount);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure) return;
    const calculate = () => {
      const styles = getComputedStyle(nav);
      const available = nav.clientWidth - (parseFloat(styles.paddingLeft) || 0) - (parseFloat(styles.paddingRight) || 0);
      if (available <= 0) return;
      const gap = parseFloat(styles.columnGap) || 0;
      const widths = Array.from(measure.querySelectorAll<HTMLElement>("[data-direct-measure-item]"), (item) => item.getBoundingClientRect().width);
      const returnWidth = measure.querySelector<HTMLElement>("[data-direct-measure-return]")?.getBoundingClientRect().width ?? 0;
      const moreWidth = measure.querySelector<HTMLElement>("[data-direct-measure-more]")?.getBoundingClientRect().width ?? 0;
      const widthFor = (count: number, withMore: boolean) => {
        const items = count + Number(showReturn) + Number(withMore);
        return (showReturn ? returnWidth : 0) + widths.slice(0, count).reduce((sum, width) => sum + width, 0)
          + (withMore ? moreWidth : 0) + Math.max(0, items - 1) * gap;
      };
      if (widthFor(widths.length, false) <= available) {
        setVisibleCount(widths.length);
        return;
      }
      let count = 0;
      while (count < widths.length && widthFor(count + 1, count + 1 < widths.length) <= available) count++;
      setVisibleCount(count);
    };
    calculate();
    const observer = new ResizeObserver(calculate);
    observer.observe(nav);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [sorted, showReturn]);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = moreRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(290, window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom;
      setPopupPosition({
        width,
        left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        ...(below >= 230 || below >= rect.top
          ? { top: rect.bottom + 6, maxHeight: Math.max(80, below - 18) }
          : { bottom: window.innerHeight - rect.top + 6, maxHeight: Math.max(80, rect.top - 18) }),
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, overflow.length]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node) && !popupRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        moreRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (overflow.length === 0) setOpen(false);
  }, [overflow.length]);

  const badge = (conversation: DirectConversation) => conversation.unread > 0 &&
    <b>{conversation.unread > 99 ? "99+" : conversation.unread}</b>;
  const pill = (conversation: DirectConversation, measuring = false) =>
    <span className={"direct-tag " + (conversation.peer.id === dialogId ? "active" : "")} key={conversation.peer.id} {...(measuring ? { "data-direct-measure-item": "" } : {})}>
      <button type="button" tabIndex={measuring ? -1 : undefined} onClick={measuring ? undefined : () => onOpen(conversation.peer)}>{conversation.peer.name}{badge(conversation)}</button>
      <button type="button" tabIndex={measuring ? -1 : undefined} className="direct-tag-close" aria-label={"Скрыть диалог с " + conversation.peer.name} title="Скрыть из списка" onClick={measuring ? undefined : () => conversation.peer.id && onDismiss(conversation.peer.id)}><X className="direct-tag-close-icon" size={13} /></button>
    </span>;

  return <nav ref={navRef} className={"direct-tags" + (showReturn ? " has-return" : "")} aria-label="Личные диалоги">
    {showReturn && <span className="direct-tag return-to-chat"><button type="button" onClick={onReturn}>Чат</button></span>}
    {sorted.slice(0, visibleCount).map((conversation) => pill(conversation))}
    {overflow.length > 0 && <span className="direct-tag direct-tag-more"><button ref={moreRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? popupId : undefined} onClick={() => setOpen((value) => !value)}><MessagesSquare size={14} />Все</button></span>}
    <div ref={measureRef} className="direct-tags-measure" aria-hidden="true">
      {showReturn && <span className="direct-tag return-to-chat" data-direct-measure-return><button type="button" tabIndex={-1}>Чат</button></span>}
      {sorted.map((conversation) => pill(conversation, true))}
      <span className="direct-tag direct-tag-more" data-direct-measure-more><button type="button" tabIndex={-1}><MessagesSquare size={14} />Все</button></span>
    </div>
    {open && overflow.length > 0 && createPortal(<>
      <button type="button" className="direct-tags-overflow-backdrop" aria-label="Закрыть список личных диалогов" onClick={() => setOpen(false)} />
      <div ref={popupRef} id={popupId} className="direct-tags-overflow" role="menu" aria-label="Остальные личные диалоги" style={{ ...popupPosition, visibility: popupPosition ? "visible" : "hidden" }}>
        {overflow.map((conversation) => <div className={"direct-tags-overflow-row" + (conversation.peer.id === dialogId ? " active" : "")} key={conversation.peer.id}>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpen(conversation.peer); }}><span>{conversation.peer.name}</span>{badge(conversation)}</button>
          <button type="button" className="direct-tags-overflow-close" aria-label={"Скрыть диалог с " + conversation.peer.name} title="Скрыть из списка" onClick={() => conversation.peer.id && onDismiss(conversation.peer.id)}><X className="direct-tag-close-icon" size={14} /></button>
        </div>)}
      </div>
    </>, document.body)}
  </nav>;
}
