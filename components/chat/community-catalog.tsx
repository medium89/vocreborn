"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ArrowRight, Check, ChevronDown, MessageCircle, Plus, Search, Users, X } from "lucide-react";
import type { Community } from "@/lib/chat-contract";
import { Avatar } from "./avatar";
import { BackToChatButton } from "./back-to-chat-button";

type Sort = "activity" | "members" | "newest";
const sortOptions: Array<[Sort, string]> = [["activity", "По активности"], ["members", "По участникам"], ["newest", "Сначала новые"]];

function plural(count: number, one: string, few: string, many: string) {
  const last = count % 10;
  return count % 100 >= 11 && count % 100 <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
}

export function CommunityCover({ community }: { community: Community }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [community.coverUrl]);
  const hue = 75 + Array.from(community.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 105;
  const initials = community.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return <span className="community-catalog-cover" style={{ "--community-hue": hue } as CSSProperties}>
    {community.coverUrl && !failed
      ? <img src={community.coverUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <span className="community-cover-placeholder" aria-hidden="true"><span>{initials || "A"}</span></span>}
  </span>;
}

export function CommunityCatalog({ items, onOpen, onCreate, onBackToChat }: { items: Community[]; onOpen: (id: string) => void; onCreate: () => void; onBackToChat: () => void }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("activity");
  const [sortOpen, setSortOpen] = useState(false);
  const filtered = items.filter((item) => (item.name + " " + item.description).toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU")));
  filtered.sort((a, b) => {
    const order = sort === "activity" ? (b.messagesLastDay ?? 0) - (a.messagesLastDay ?? 0) || b.memberCount - a.memberCount
      : sort === "members" ? b.memberCount - a.memberCount
      : Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return order || a.name.localeCompare(b.name, "ru") || a.id.localeCompare(b.id);
  });
  return <div className="community-catalog">
    <header className="communities-list-head">
      <div className="community-catalog-heading page-heading"><span className="community-catalog-heading-icon page-heading-icon"><Users size={19} /></span><div className="page-heading-copy"><span className="eyebrow">КАТАЛОГ</span><h2>Сообщества</h2></div></div>
      <div className="community-catalog-actions"><button type="button" className="action-button community-create" onClick={onCreate}><Plus size={18} />Создать сообщество</button><BackToChatButton onClick={onBackToChat} /></div>
    </header>
    <div className="community-catalog-toolbar">
      <label className="community-catalog-search"><Search size={18} /><input aria-label="Поиск по сообществам" placeholder="Поиск по сообществам…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery("")}><X size={15} /></button>}</label>
      <div className="community-catalog-sort" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSortOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") setSortOpen(false); }}>
        <button type="button" className="community-sort-trigger" aria-haspopup="listbox" aria-expanded={sortOpen} aria-label="Сортировка сообществ" onClick={() => setSortOpen((open) => !open)}>{sortOptions.find(([value]) => value === sort)?.[1]}<ChevronDown size={16} /></button>
        {sortOpen && <div className="community-sort-options" role="listbox" aria-label="Сортировка сообществ">{sortOptions.map(([value, label]) => <button type="button" role="option" aria-selected={value === sort} key={value} onClick={() => { setSort(value); setSortOpen(false); }}>{label}{value === sort && <Check size={14} />}</button>)}</div>}
      </div>
    </div>
    <div className="community-catalog-list">
      {filtered.map((community) => {
        const members = community.memberPreview ?? [];
        const remaining = Math.max(0, community.memberCount - members.length);
        const activity = community.messagesLastDay ?? 0;
        return <button type="button" className="community-catalog-card" key={community.id} onClick={() => onOpen(community.id)}>
          <CommunityCover community={community} />
          <span className="community-catalog-copy">
            <span className="community-catalog-name"><strong>{community.name}</strong>{community.membership?.status === "approved" && <span className="community-catalog-badge">Вы участник</span>}{community.membership?.status === "pending" && <span className="community-catalog-badge">Заявка отправлена</span>}</span>
            <span className="community-catalog-description">{community.description || "Здесь начинается общение по интересам"}</span>
            <span className="community-catalog-members">{members.map((member) => <span className="community-catalog-member" key={member.id} title={member.displayName}><Avatar value={member.avatarUrl} name={member.displayName} /></span>)}{remaining > 0 && <span className="community-catalog-more">+{remaining.toLocaleString("ru-RU")}</span>}{!members.length && <span className="community-catalog-policy">{community.joinPolicy === "approval" ? "Вступление по заявке" : "Свободное вступление"}</span>}</span>
          </span>
          <span className="community-catalog-stats"><span className="community-catalog-stat"><Users size={21} /><span><b>{community.memberCount.toLocaleString("ru-RU")}</b><small>{plural(community.memberCount, "участник", "участника", "участников")}</small></span></span><span className="community-catalog-stat" title="Количество сообщений за последние 24 часа"><MessageCircle size={21} /><span><b>{activity.toLocaleString("ru-RU")}</b><small>{plural(activity, "сообщение", "сообщения", "сообщений")} за 24 ч</small></span></span></span>
          <span className="community-catalog-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
        </button>;
      })}
      {!filtered.length && <div className="community-catalog-empty"><Users size={30} /><strong>{items.length ? "Сообщества не найдены" : "Сообществ пока нет"}</strong><p>{items.length ? "Попробуйте другое название или интерес." : "Создайте сообщество и пригласите друзей."}</p></div>}
    </div>
  </div>;
}
