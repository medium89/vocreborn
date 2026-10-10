"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "@/lib/chat-api";

type Role = "MAFIA" | "DOCTOR" | "COMMISSAR" | "CIVILIAN";
type Phase = "LOBBY" | "NIGHT" | "DAY" | "VOTING" | "FINISHED";
type Player = { userId: string; name: string; isAlive: boolean; isAiBot?: boolean; role?: Role | null };
type SecretMessage = { id: string; authorUserId: string; authorName: string; body: string; createdAt: string };
type TestMessage = SecretMessage & { audience: string; recipientUserId: string | null; round: number; phase: Phase };
type MafiaState = {
  gameId: string; roomId: string; hostUserId: string; phase: Phase; round: number; isTestMode: boolean; adminView?: boolean;
  aiConfigured?: boolean; aiIssue?: string | null;
  phaseEndsAt: string | null; winner: string | null; players: Player[];
  votes: Array<{ voterUserId: string; targetUserId: string | null }>;
  myRole?: Role | null; myAlive?: boolean; myActionTargetUserId?: string | null;
  myVoteTargetUserId?: string | null;
  allies?: Array<{ userId: string; name: string }>;
  checks?: Array<{ round: number; targetUserId: string; result: "MAFIA" | "NOT_MAFIA" }>;
  secretMessages?: SecretMessage[]; testMessages?: TestMessage[];
  adminRoles?: Array<{ userId: string; role: Role | null }>;
};

const roleNames: Record<Role, string> = {
  MAFIA: "Мафия", DOCTOR: "Доктор", COMMISSAR: "Комиссар", CIVILIAN: "Мирный",
};
const phaseNames: Record<Phase, string> = {
  LOBBY: "Сбор игроков", NIGHT: "Ночь", DAY: "День", VOTING: "Голосование", FINISHED: "Игра окончена",
};

export function MafiaPanel({ roomId, userId, isAdmin }: { roomId: string; userId: string; isAdmin: boolean }) {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<MafiaState | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState("");
  const [secretDraft, setSecretDraft] = useState("");
  const [testDraft, setTestDraft] = useState("");
  const [testAudience, setTestAudience] = useState("ALL");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(`tusova:mafia-panel-collapsed:${userId}:${roomId}`) === "true"); }
    catch { setCollapsed(false); }
  }, [roomId, userId]);

  function toggleCollapsed() {
    setCollapsed(current => {
      const next = !current;
      try { window.localStorage.setItem(`tusova:mafia-panel-collapsed:${userId}:${roomId}`, String(next)); } catch {}
      return next;
    });
  }

  useEffect(() => {
    setState(null);
    setError("");
    const socket = io(API_URL, { withCredentials: true });
    socketRef.current = socket;
    const refresh = () => socket.emit("mafia:status", { roomId }, (result: MafiaState | null | { error: string }) => {
      if (result && "error" in result) { setError(result.error); return; }
      setState(result as MafiaState | null);
    });
    socket.on("connect", () => {
      socket.emit("room:join", { roomId }, refresh);
    });
    socket.on("mafia:private-state", (next: MafiaState | null) => {
      if (!next || next.roomId === roomId) setState(next);
    });
    for (const name of ["mafia:lobby-updated", "mafia:started", "mafia:phase-changed", "mafia:vote-cast", "mafia:night-result", "mafia:player-eliminated", "mafia:finished"]) {
      socket.on(name, (payload: { state: MafiaState }) => {
        if (payload?.state?.roomId !== roomId) return;
        setState(current => current?.gameId === payload.state.gameId ? { ...current, ...payload.state } : payload.state);
      });
    }
    socket.on("mafia:test-message", (message: TestMessage) => {
      setState(current => current && !current.testMessages?.some(item => item.id === message.id)
        ? { ...current, testMessages: [...(current.testMessages ?? []), message] } : current);
    });
    socket.on("mafia:secret-message", (message: SecretMessage) => {
      setState(current => current && !current.secretMessages?.some(item => item.id === message.id)
        ? { ...current, secretMessages: [...(current.secretMessages ?? []), message] } : current);
    });
    socket.on("mafia:error", (payload: { message: string }) => setError(payload.message));
    socket.on("connect_error", () => setError("Нет соединения с игрой. Проверьте подключение."));
    return () => { socket.disconnect(); if (socketRef.current === socket) socketRef.current = null; };
  }, [roomId]);

  function action(event: string, fields: Record<string, unknown> = {}) {
    const socket = socketRef.current;
    if (!socket?.connected) { setError("Нет соединения с сервером."); return; }
    setBusy(true);
    setError("");
    socket.emit(event, { roomId, ...fields }, (result: MafiaState | { error?: string; ok?: boolean } | null) => {
      setBusy(false);
      if (result && "error" in result && result.error) { setError(result.error); return; }
      if (result && "gameId" in result) setState(result as MafiaState);
    });
  }

  function sendSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = secretDraft.trim();
    if (!body) return;
    action("mafia:secret-message", { body });
    setSecretDraft("");
  }

  function sendTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = testDraft.trim();
    if (!body) return;
    action("mafia:test-message", { body, audience: testAudience === "PLAYER" ? "PLAYER" : testAudience,
      ...(testAudience.startsWith("PLAYER:") ? { audience: "PLAYER", recipientUserId: testAudience.slice(7) } : {}) });
    setTestDraft("");
  }

  const seconds = state?.phaseEndsAt ? Math.max(0, Math.ceil((new Date(state.phaseEndsAt).getTime() - now) / 1000)) : null;
  const timer = seconds === null ? null : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const joined = state?.players.some(player => player.userId === userId);
  const host = state?.hostUserId === userId;
  const alive = Boolean(state?.myAlive);
  const living = state?.players.filter(player => player.isAlive) ?? [];
  const canAct = joined && alive;
  const targetType = state?.myRole === "MAFIA" ? "MAFIA_KILL"
    : state?.myRole === "DOCTOR" ? "DOCTOR_PROTECT"
    : state?.myRole === "COMMISSAR" ? "COMMISSAR_CHECK" : null;
  const targetPlayers = living.filter(player => state?.myRole === "MAFIA"
    ? !state.allies?.some(ally => ally.userId === player.userId)
    : state?.myRole === "COMMISSAR" ? player.userId !== userId : true);

  return <aside className={"mafia-panel" + (collapsed ? " collapsed" : "")} aria-label="Игра Мафия">
    <div className="mafia-panel-head">
      <div><span className="mafia-eyebrow">Игра в комнате</span><strong>Мафия</strong></div>
      {state && <span className="mafia-phase" title={`${phaseNames[state.phase]}${state.round > 0 ? ` · раунд ${state.round}` : ""}${timer ? ` · ${timer}` : ""}`}>{phaseNames[state.phase]}{!collapsed && state.round > 0 ? ` · раунд ${state.round}` : ""}{timer ? ` · ${timer}` : ""}</span>}
      <button type="button" className="mafia-collapse-button" aria-expanded={!collapsed} aria-label={collapsed ? "Развернуть панель Мафии" : "Свернуть панель Мафии"} onClick={toggleCollapsed}>{collapsed ? "Развернуть" : "Свернуть"}</button>
    </div>
    <div className="mafia-panel-body" hidden={collapsed}>
    {error && <p className="mafia-error" role="alert">{error}</p>}
    {!state ? <div className="mafia-lobby"><p>Соберите от 4 до 12 участников для новой партии.</p><button type="button" disabled={busy} onClick={() => action("mafia:create")}>Создать партию</button>{isAdmin && <button type="button" className="mafia-test-start" disabled={busy} onClick={() => action("mafia:create-test", { botCount: 5 })}>Запустить с 5 ботами</button>}</div> : <>
      <div className="mafia-players" aria-label="Игроки">
        {state.players.map(player => <span key={player.userId} className={"mafia-player" + (player.isAlive ? "" : " eliminated")}>
          {player.name}{player.userId === state.hostUserId ? " ★" : ""}{player.role || state.adminView && state.adminRoles?.find(item => item.userId === player.userId)?.role ? ` · ${roleNames[(player.role ?? state.adminRoles?.find(item => item.userId === player.userId)?.role) as Role]}` : ""}
        </span>)}
      </div>
      {state.isTestMode && <div className="mafia-test-notice"><strong>Тестовая партия</strong><span>{state.adminView ? state.aiConfigured ? "ИИ-боты: AITunnel · gemini-2.5-flash-lite. При ошибке API ход завершится локальными правилами." : "Ключ AITUNNEL_API_KEY не задан: боты пока используют локальные правила." : "Боты участвуют в тестовой партии; адресные сообщения видны только получателям."}</span>{state.adminView && state.aiIssue && <small>{state.aiIssue}</small>}</div>}
      {state.phase === "LOBBY" && <div className="mafia-actions">
        <p>{state.players.length}/12 игроков. Для старта нужно минимум 4.</p>
        {!joined && <button type="button" disabled={busy} onClick={() => action("mafia:join")}>Вступить</button>}
        {host && <button type="button" disabled={busy || state.players.length < 4} onClick={() => action("mafia:start")}>Начать игру</button>}
      </div>}
      {state.phase !== "LOBBY" && state.phase !== "FINISHED" && <p className="mafia-my-role">
        {joined ? `Ваша роль: ${state.myRole ? roleNames[state.myRole] : "ожидание"}${alive ? "" : " · вы выбыли и можете читать чат"}` : "Вы наблюдаете за игрой."}
      </p>}
      {state.phase === "NIGHT" && <div className="mafia-actions">
        <p>Ночь. Действия скрыты от остальных игроков. Днём результаты появятся в чате.</p>
        {canAct && targetType ? <div className="mafia-targets">
          <strong>{state.myRole === "MAFIA" ? "Выберите жертву" : state.myRole === "DOCTOR" ? "Кого защитить" : "Кого проверить"}</strong>
          <div>{targetPlayers.map(player => <button type="button" key={player.userId} className={state.myActionTargetUserId === player.userId ? "selected" : ""} disabled={busy} onClick={() => action("mafia:night-action", { type: targetType, targetUserId: player.userId })}>{player.name}</button>)}</div>
          <small>Выбор можно изменить до конца ночи.</small>
        </div> : <p>Ожидайте окончания ночи.</p>}
        {(canAct && state.myRole === "MAFIA" || state.adminView) && <div className="mafia-secret-chat">
          <strong>Тайный разговор мафии</strong>
          <small>Кому: мафии. В тестовой партии администратор видит этот канал для проверки.</small>
          <div className="mafia-secret-feed">{(state.secretMessages ?? []).map(message => <p key={message.id}><b>{message.authorName}:</b> {message.body}</p>)}</div>
          {canAct && state.myRole === "MAFIA" && <form onSubmit={sendSecret}><input value={secretDraft} onChange={event => setSecretDraft(event.target.value)} maxLength={1000} placeholder="Написать союзникам…" /><button type="submit" disabled={busy || !secretDraft.trim()}>Отправить</button></form>}
        </div>}
      </div>}
      {state.phase === "DAY" && <div className="mafia-actions">
        <p>Обсуждайте события в общем чате. Живых игроков: {living.length}.</p>
        {host && alive && <button type="button" disabled={busy} onClick={() => action("mafia:start-vote")}>Начать голосование</button>}
      </div>}
      {state.phase === "VOTING" && <div className="mafia-actions">
        <p>Голосование открытое. Вы можете изменить голос до окончания таймера.</p>
        {canAct && <div className="mafia-targets"><div>{living.map(player => <button type="button" key={player.userId} className={state.myVoteTargetUserId === player.userId ? "selected" : ""} disabled={busy} onClick={() => action("mafia:vote", { targetUserId: player.userId })}>{player.name}</button>)}<button type="button" disabled={busy} onClick={() => action("mafia:vote", { targetUserId: null })}>Воздержаться</button></div></div>}
        <small>Проголосовало: {state.votes.length} из {living.length}</small>
      </div>}
      {state.checks && state.checks.length > 0 && <div className="mafia-checks"><strong>Проверки комиссара</strong>{state.checks.map(check => <span key={check.round}>Ночь {check.round}: {state.players.find(player => player.userId === check.targetUserId)?.name ?? "Игрок"} — {check.result === "MAFIA" ? "мафия" : "не мафия"}</span>)}</div>}
      {state.adminView && state.phase !== "NIGHT" && (state.secretMessages?.length ?? 0) > 0 && <div className="mafia-secret-chat">
        <strong>Тайный канал мафии · админский просмотр</strong>
        <div className="mafia-secret-feed">{state.secretMessages?.map(message => <p key={message.id}><b>{message.authorName} · Кому: мафии:</b> {message.body}</p>)}</div>
      </div>}
      {state.isTestMode && state.phase !== "LOBBY" && <div className="mafia-test-chat">
        <strong>Игровые сообщения</strong>
        <small>Подпись «Кому» показывает адресата. Приватные реплики доступны только адресату, а в тесте — также администратору.</small>
        <div className="mafia-test-feed">{(state.testMessages ?? []).map(message => {
          const recipient = state.players.find(player => player.userId === message.recipientUserId)?.name;
          const address = message.audience === "ALL" ? "всем" : message.audience === "MAFIA" ? "мафии"
            : message.audience === "DOCTOR" ? "доктору" : message.audience === "COMMISSAR" ? "комиссару" : recipient ?? "игроку";
          return <p key={message.id} className={"mafia-test-message mafia-test-message-" + message.audience.toLowerCase()}><span><b>{message.authorName}</b> · Кому: {address}</span><span>{message.body}</span></p>;
        })}</div>
        {state.phase !== "FINISHED" && (state.adminView || canAct) && <form onSubmit={sendTest}>
          <select aria-label="Адресат" value={testAudience} onChange={event => setTestAudience(event.target.value)}>
            <option value="ALL">Всем</option>
            {(state.adminView || state.myRole === "MAFIA") && <option value="MAFIA">Мафии</option>}
            {state.adminView && <><option value="DOCTOR">Доктору</option><option value="COMMISSAR">Комиссару</option>
              {state.players.filter(player => player.isAiBot).map(player => <option key={player.userId} value={"PLAYER:" + player.userId}>{player.name}</option>)}</>}
          </select>
          <input value={testDraft} onChange={event => setTestDraft(event.target.value)} maxLength={1000} placeholder="Написать ботам…" />
          <button type="submit" disabled={busy || !testDraft.trim()}>Отправить</button>
        </form>}
      </div>}
      {state.isTestMode && host && !["LOBBY", "FINISHED"].includes(state.phase) && <button type="button" className="mafia-advance" disabled={busy} onClick={() => action("mafia:advance-test")}>Завершить фазу сейчас</button>}
      {state.phase === "FINISHED" && <div className="mafia-actions"><p>{state.winner === "MAFIA" ? "Победила мафия." : state.winner === "CIVILIANS" ? "Победили мирные." : "Игра остановлена."}</p><button type="button" disabled={busy} onClick={() => action("mafia:create")}>Новая партия</button></div>}
      {host && state.phase !== "FINISHED" && <button type="button" className="mafia-stop" disabled={busy} onClick={() => { if (window.confirm("Остановить текущую партию?")) action("mafia:stop"); }}>Остановить игру</button>}
    </>}
    </div>
  </aside>;
}
