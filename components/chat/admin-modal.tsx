"use client";
import { useEffect, useState, type ComponentProps } from "react";
import {
  Check,
  FileAudio,
  FileImage,
  Flag,
  LayoutGrid,
  RefreshCw,
  Search,
  Shield,
  Users,
  X,
  Coins,
  Dices,
  Gift,
  Radio,
  Bot,
  Headset,
  ScrollText,
  Server,
  MessageSquare,
  Settings2,
  Pencil,
} from "lucide-react";
import { API_URL } from "@/lib/chat-api";
import { BackToChatButton } from "./back-to-chat-button";
import { SupportTicketsPanel } from "./support-tickets-panel";
import { QuizAdminPanel } from "./quiz-admin-panel";
import { AdminSettingsPanel } from "./admin-settings-panel";
import {
  AdminAnnouncementPanel,
  AdminContentPanel,
} from "./admin-content-panels";
import {
  AdminEconomyLedger,
  AdminRadioPanel,
  AdminSystemPanel,
} from "./admin-operational-panels";
import { UserEditorPage } from "./user-editor-page";
import { RoomsModal } from "./modals";
import { ReportsModal } from "./reports-modal";
import { StoreEditorPage } from "./store-editor-page";
import type {
  AdminOverview,
  AdminUser,
  PendingAttachment,
  AuthUser,
  Person,
  Room,
} from "@/lib/chat-contract";
import {
  fetchAdminOverview,
  fetchAdminUsers,
  fetchPendingAttachments,
  reviewAttachment,
} from "@/lib/social-api";
import {
  banUser,
  imposeChaos,
  muteUser,
  removeChaos,
  unbanUser,
  unmuteUser,
} from "@/lib/moderation-api";

const tabs = [
  { id: "overview", label: "Обзор", icon: LayoutGrid },
  { id: "users", label: "Пользователи", icon: Users },
  { id: "rooms", label: "Комнаты", icon: LayoutGrid },
  { id: "communication", label: "Общение", icon: MessageSquare },
  { id: "materials", label: "Материалы", icon: FileImage },
  { id: "moderation", label: "Модерация", icon: Shield },
  { id: "economy", label: "Экономика", icon: Coins },
  { id: "casino", label: "Казино", icon: Dices },
  { id: "store", label: "Магазин", icon: Gift },
  { id: "radio", label: "Радио", icon: Radio },
  { id: "bots", label: "Боты", icon: Bot },
  { id: "support", label: "Поддержка", icon: Headset },
  { id: "audit", label: "Журнал", icon: ScrollText },
  { id: "system", label: "Система", icon: Server },
] as const;
type Tab = (typeof tabs)[number]["id"];
type Props = {
  user: AuthUser;
  rooms: Room[];
  onSaveRoom: ComponentProps<typeof RoomsModal>["onSaveRoom"];
  onDeleteRoom: ComponentProps<typeof RoomsModal>["onDeleteRoom"];
  onChangeRoom: (id: string) => void;
  onOpenRadio: () => void;
  onUsersChanged: () => void;
  onBackToChat: () => void;
};

export function AdminModal({
  user: actor,
  rooms,
  onSaveRoom,
  onDeleteRoom,
  onChangeRoom,
  onOpenRadio,
  onUsersChanged,
  onBackToChat,
}: Props) {
  const [overview, setOverview] = useState<AdminOverview | null>(null),
    [users, setUsers] = useState<AdminUser[]>([]),
    [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [tab, setTab] = useState<Tab>("overview"),
    [selectedUser, setSelectedUser] = useState<Person | null>(null);
  const [search, setSearch] = useState(""),
    [usersRefresh, setUsersRefresh] = useState(0),
    [usersLoading, setUsersLoading] = useState(false),
    [error, setError] = useState("");
  const [economyTab, setEconomyTab] = useState<"rewards" | "video" | "ledger">("rewards");
  async function load() {
    setError("");
    try {
      const [stats, files] = await Promise.all([
        fetchAdminOverview(),
        fetchPendingAttachments(),
      ]);
      setOverview(stats);
      setAttachments(files);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить управление",
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (tab !== "users") return;
    let cancelled = false;
    setUsersLoading(true);
    const timer = window.setTimeout(
      () => {
        void fetchAdminUsers(search)
          .then((next) => {
            if (!cancelled) {
              setUsers(next);
              setUsersLoading(false);
            }
          })
          .catch((cause) => {
            if (!cancelled) {
              setError(cause.message);
              setUsersLoading(false);
            }
          });
      },
      search.trim() ? 300 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tab, search, usersRefresh]);
  async function review(id: string, status: "APPROVED" | "REJECTED") {
    try {
      await reviewAttachment(id, status);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось проверить вложение",
      );
    }
  }
  function changed() {
    setUsersRefresh((value) => value + 1);
    onUsersChanged();
    void load();
  }
  function editUser(user: AdminUser) {
    setSelectedUser({
      id: user.id,
      username: user.username,
      name: user.displayName,
      role: user.role,
      status: user.status,
      gender: "unspecified",
      room: "",
      avatar: "",
      isDj: user.isDj,
    });
  }
  async function moderate(
    action: "mute" | "unmute" | "chaos" | "unchaos" | "ban" | "unban",
    duration: number,
    reason: string,
  ) {
    if (!selectedUser?.id) return;
    const id = selectedUser.id;
    if (action === "mute") await muteUser(id, duration, reason);
    else if (action === "unmute") await unmuteUser(id);
    else if (action === "chaos") await imposeChaos(id, duration, reason);
    else if (action === "unchaos") await removeChaos(id);
    else if (action === "ban") await banUser(id, duration, reason);
    else await unbanUser(id);
    changed();
  }
  const cards = overview
    ? ([
        ["Пользователи", overview.users],
        ["Комнаты", overview.rooms],
        ["Сообщения", overview.messages],
        ["Открытые жалобы", overview.openReports],
        ["Вложения на проверке", overview.pendingAttachments],
        ["Сообщения профилей", overview.profilePosts],
      ] as const)
    : [];
  return (
    <section className="management-module admin-module admin-workspace">
      <header className="management-module-head">
        <div className="page-heading">
          <span className="page-heading-icon">
            <Settings2 size={19} />
          </span>
          <div className="page-heading-copy">
            <span className="eyebrow">НАСТРОЙКИ ЧАТА</span>
            <h2>Управление</h2>
          </div>
        </div>
        <BackToChatButton onClick={onBackToChat} />
      </header>
      <nav
        className="admin-section-tabs"
        aria-label="Разделы администрирования"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            aria-current={tab === id ? "page" : undefined}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setSelectedUser(null);
              setError("");
            }}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="management-module-body admin-workspace-body">
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        {tab === "overview" && (
          <>
            <div className="admin-stats">
              {cards.map(([label, value]) => (
                <article key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </article>
              ))}
            </div>
            <div className="admin-shortcuts">
              <button onClick={() => setTab("users")}>
                <Users size={15} />
                Найти пользователя
              </button>
              <button onClick={() => setTab("moderation")}>
                <Flag size={15} />
                Жалобы
              </button>
              <button onClick={() => void load()}>
                <RefreshCw className="admin-refresh-icon" size={15} />
                Обновить
              </button>
            </div>
            <section className="admin-panel">
              <h3>Все инструменты — в разделах выше</h3>
              <p>
                Профиль, кредиты, роли, DJ, VIP и ограничения находятся в
                карточке пользователя. При пустом поиске видны только
                присутствующие в чате; поиск работает по всей базе, максимум 100
                результатов.
              </p>
              <p>
                Изменения настроек и действия администрации записываются в
                журнал. Доступ к личной переписке пользователей здесь не
                предоставляется.
              </p>
            </section>
          </>
        )}
        {tab === "users" &&
          (selectedUser ? (
            <UserEditorPage
              key={selectedUser.id}
              person={selectedUser}
              actor={actor}
              onBack={() => setSelectedUser(null)}
              onChanged={changed}
              onModerate={moderate}
              backLabel="К пользователям"
            />
          ) : (
            <div className="admin-users-section">
              <label className="admin-user-search">
                <Search size={17} />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск по нику или имени во всей базе"
                  aria-label="Поиск пользователей"
                />
              </label>
              {search.trim() && (
                <p className="admin-users-caption">
                  Поиск по всей базе · до 100 результатов. Уточните запрос, если пользователей больше.
                </p>
              )}
              <div className="admin-users admin-users-editable">
                {usersLoading ? (
                  <p>Загрузка…</p>
                ) : !users.length ? (
                  <p>Пользователи не найдены.</p>
                ) : (
                  users.map((user) => (
                    <article key={user.id}>
                      <div>
                        <strong>{user.displayName}</strong>
                        <small>
                          @{user.username} ·{" "}
                          {user.status === "offline" ? "не в сети" : "в сети"} ·{" "}
                          {user.role === "admin"
                            ? "администратор"
                            : user.role === "moderator"
                              ? "модератор"
                              : "участник"}
                          {user.isDj ? " · DJ" : ""}
                        </small>
                      </div>
                      <button
                        className="action-button secondary"
                        onClick={() => editUser(user)}
                      >
                        <Pencil size={15} />
                        Редактировать
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>
          ))}
        {tab === "rooms" && (
          <RoomsModal
            embedded
            rooms={rooms}
            user={actor}
            onChangeRoom={onChangeRoom}
            onSaveRoom={onSaveRoom}
            onDeleteRoom={onDeleteRoom}
            onClose={onBackToChat}
          />
        )}
        {tab === "communication" && (
          <>
            <AdminSettingsPanel
              title="Правила общения"
              keys={[
                "maxMessageLength",
                "slowModeSeconds",
                "allowLinks",
                "allowUserRooms",
              ]}
            />
            <AdminAnnouncementPanel />
          </>
        )}
        {tab === "materials" && (
          <>
            <AdminContentPanel />
            <AdminSettingsPanel
              title="Новые вложения"
              keys={["imageMaxMb", "audioMaxMb"]}
            />
            <section className="admin-panel">
              <h3>Проверка вложений</h3>
              <p>
                Удаление по сроку относится только к вложениям общего чата.
                Вложения лички, профилей и сообществ не удаляются по этому
                сроку.
              </p>
              <div className="admin-attachments">
                {!attachments.length ? (
                  <p>Все вложения проверены.</p>
                ) : (
                  attachments.map((item) => {
                    const Icon = item.kind === "image" ? FileImage : FileAudio;
                    return (
                      <article key={item.id}>
                        <Icon size={18} />
                        <div>
                          <strong>{item.originalName}</strong>
                          <small>
                            {item.uploader.displayName} ·{" "}
                            {(item.size / 1024).toFixed(0)} КБ
                          </small>
                        </div>
                        <a
                          href={API_URL + item.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Открыть
                        </a>
                        <button
                          title="Разрешить"
                          onClick={() => void review(item.id, "APPROVED")}
                        >
                          <Check size={15} />
                        </button>
                        <button
                          title="Отклонить"
                          onClick={() => void review(item.id, "REJECTED")}
                        >
                          <X size={15} />
                        </button>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          </>
        )}
        {(tab === "moderation" || tab === "audit") && (
          <ReportsModal
            key={tab}
            initialTab={tab === "audit" ? "audit" : "reports"}
            canBan
            onBackToChat={onBackToChat}
          />
        )}
        {tab === "economy" && (
          <>
            <div className="admin-shortcuts">
              {(
                [
                  ["rewards", "Награды"],
                  ["video", "Видео"],
                  ["ledger", "Операции"],
                ] as const
              ).map(([id, label]) => (
                <button
                  aria-pressed={economyTab === id}
                  key={id}
                  onClick={() => setEconomyTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {economyTab === "rewards" ? (
              <AdminSettingsPanel
                title="Кредиты и ежедневные награды"
                keys={[
                  "initialCredits",
                  "firstMessageReward",
                  "firstReplyReward",
                  "profileCommentReward",
                  "photoLikeReward",
                  "profilePostLikeReward",
                ]}
              />
            ) : economyTab === "video" ? (
              <AdminSettingsPanel
                title="Платные видео"
                keys={["videoQueuePrice"]}
              />
            ) : (
              <AdminEconomyLedger />
            )}
          </>
        )}
        {tab === "casino" && (
          <AdminSettingsPanel
            title="Рулетка и джекпот"
            keys={[
              "casinoEnabled",
              "casinoMinBet",
              "casinoMaxBet",
              "casinoRedBlackPayoutBps",
              "casinoGreenPayoutBps",
              "casinoJackpotBasePerMillion",
              "casinoJackpotGrowthPer10000PerMillion",
              "casinoJackpotMaxPerMillion",
            ]}
          />
        )}
        {tab === "store" && (
          <StoreEditorPage
            embedded
            onBack={() => setTab("overview")}
            onBackToChat={onBackToChat}
          />
        )}
        {tab === "radio" && <AdminRadioPanel onStudio={onOpenRadio} />}
        {tab === "bots" && (
          <>
            <section className="admin-panel">
              <h3>Сервисные боты</h3>
              <p>
                Ниже — импорт тем, расписание, награды, подсказки и управление
                викториной. Тестовые собеседники включаются только локальной
                конфигурацией, в production они запрещены. ИИ-помощник пока не
                подключён: нужны база знаний и выбранный провайдер.
              </p>
            </section>
            <QuizAdminPanel />
          </>
        )}
        {tab === "support" && <SupportTicketsPanel />}
        {tab === "system" && (
          <>
            <AdminSettingsPanel
              title="Регистрация и обслуживание"
              keys={["registrationOpen", "maintenance"]}
            />
            <AdminSystemPanel />
          </>
        )}
      </div>
    </section>
  );
}
