"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "@/lib/chat-api";

type Role = "MAFIA" | "DOCTOR" | "COMMISSAR" | "CIVILIAN";
type Phase = "LOBBY" | "NIGHT" | "DAY" | "VOTING" | "FINISHED";
type Player = { userId: string; name: string; isAlive: boolean; isAiBot?: boolean; role?: Role | null };
type MafiaState = {
  gameId: string; roomId: string; hostUserId: string; phase: Phase; round: number; isTestMode: boolean; adminView?: boolean;
  aiConfigured?: boolean; aiIssue?: string | null;
  phaseEndsAt: string | null; winner: string | null; players: Player[];
  votes: Array<{ voterUserId: string; targetUserId: string | null }>;
  myRole?: Role | null; myAlive?: boolean; myActionTargetUserId?: string | null;
  myVoteTargetUserId?: string | null;
  allies?: Array<{ userId: string; name: string }>;
  checks?: Array<{ round: number; targetUserId: string; result: "MAFIA" | "NOT_MAFIA" }>;
  adminRoles?: Array<{ userId: string; role: Role | null }>;
  adminNightActions?: Array<{ actorUserId: string; type: string; targetUserId: string; round: number }>;
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
  const [adminCollapsed, setAdminCollapsed] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [customSize, setCustomSize] = useState<{ width: number; height: number } | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const resizeStateRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

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

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (collapsed || window.innerWidth <= 640 || !rootRef.current) return;
    event.preventDefault();
    const rect = rootRef.current.getBoundingClientRect();
    resizeStateRef.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resize(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = resizeStateRef.current;
    if (!start) return;
    const minWidth = Math.min(320, Math.max(280, window.innerWidth - 24));
    const maxWidth = Math.max(minWidth, window.innerWidth - 24);
    const minHeight = Math.min(300, Math.max(240, window.innerHeight - 100));
    const maxHeight = Math.max(minHeight, window.innerHeight - 100);
    setCustomSize({
      width: Math.round(Math.min(maxWidth, Math.max(minWidth, start.width + (start.x - event.clientX)))),
      height: Math.round(Math.min(maxHeight, Math.max(minHeight, start.height + (start.y - event.clientY)))),
    });
  }

  function stopResize(event: ReactPointerEvent<HTMLButtonElement>) {
    resizeStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  useEffect(() => {
    const keepInsideViewport = () => {
      if (window.innerWidth <= 640) { setCustomSize(null); resizeStateRef.current = null; }
    };
    keepInsideViewport();
    window.addEventListener("resize", keepInsideViewport);
    return () => window.removeEventListener("resize", keepInsideViewport);
  }, []);

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

  const seconds = state?.phaseEndsAt ? Math.max(0, Math.ceil((new Date(state.phaseEndsAt).getTime() - now) / 1000)) : null;
  const timer = seconds === null ? null : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const joined = state?.players.some(player => player.userId === userId);
  const host = state?.hostUserId === userId;
  const alive = Boolean(state?.myAlive);
  const living = state?.players.filter(player => player.isAlive) ?? [];
  const canAct = joined && alive;
  const voteTallies = living.map(player => ({
    ...player,
    voters: state?.votes.filter(vote => vote.targetUserId === player.userId)
      .map(vote => state.players.find(candidate => candidate.userId === vote.voterUserId)?.name ?? "Игрок") ?? [],
  })).sort((left, right) => right.voters.length - left.voters.length || left.name.localeCompare(right.name, "ru"));
  const abstainers = state?.votes.filter(vote => vote.targetUserId === null)
    .map(vote => state.players.find(player => player.userId === vote.voterUserId)?.name ?? "Игрок") ?? [];
  const myVoteCast = state?.votes.some(vote => vote.voterUserId === userId) ?? false;
  const targetType = state?.myRole === "MAFIA" ? "MAFIA_KILL"
    : state?.myRole === "DOCTOR" ? "DOCTOR_PROTECT"
    : state?.myRole === "COMMISSAR" ? "COMMISSAR_CHECK" : null;
  const targetPlayers = living.filter(player => state?.myRole === "MAFIA"
    ? !state.allies?.some(ally => ally.userId === player.userId)
    : state?.myRole === "COMMISSAR" ? player.userId !== userId : true);

  const style = customSize && !collapsed ? { width: customSize.width, height: customSize.height } : undefined;
  return <><aside className={"mafia-panel" + (collapsed ? " collapsed" : "") + (customSize && !collapsed ? " resized" : "")} ref={rootRef} style={style} aria-label="Игра Мафия">
    {!collapsed && <button className="mafia-resize-handle" type="button" aria-label="Изменить размер панели Мафии" title="Потяните, чтобы изменить размер" onPointerDown={startResize} onPointerMove={resize} onPointerUp={stopResize} onPointerCancel={stopResize} />}
    <div className="mafia-panel-head">
      <div><span className="mafia-eyebrow">Игра в комнате</span><strong>Мафия</strong></div>
      {state && <span className="mafia-phase" title={`${phaseNames[state.phase]}${state.round > 0 ? ` · раунд ${state.round}` : ""}${timer ? ` · ${timer}` : ""}`}>{phaseNames[state.phase]}{!collapsed && state.round > 0 ? ` · раунд ${state.round}` : ""}{timer ? ` · ${timer}` : ""}</span>}
      <button type="button" className="mafia-collapse-button" aria-expanded={!collapsed} aria-label={collapsed ? "Развернуть панель Мафии" : "Свернуть панель Мафии"} onClick={toggleCollapsed}>{collapsed ? "Развернуть" : "Свернуть"}</button>
    </div>
    <div className="mafia-panel-body" hidden={collapsed}>
    {error && <p className="mafia-error" role="alert">{error}</p>}
    {!state ? <div className="mafia-lobby"><p>Соберите от 4 до 12 участников для новой партии.</p><button type="button" disabled={busy} onClick={() => action("mafia:create")}>Создать партию</button></div> : <>
      <div className="mafia-players" aria-label="Игроки">
        {state.players.map(player => <span key={player.userId} className={"mafia-player" + (player.isAlive ? "" : " eliminated")}>
          {player.name}{player.userId === state.hostUserId ? " ★" : ""}{player.role ? ` · ${roleNames[player.role]}` : ""}
        </span>)}
      </div>
      {state.isTestMode && <div className="mafia-test-notice"><strong>Тестовая партия</strong><span>Обсуждение — в общем чате. Роль и действия — в этом окне.</span></div>}
      {state.phase === "LOBBY" && <div className="mafia-actions">
        <p>{state.players.length}/12 игроков. Для старта нужно минимум 4.</p>
        {!joined && <button type="button" disabled={busy} onClick={() => action("mafia:join")}>Вступить</button>}
        {host && <button type="button" disabled={busy || state.players.length < 4} onClick={() => action("mafia:start")}>Начать игру</button>}
      </div>}
      {state.phase !== "LOBBY" && <p className="mafia-my-role">
        {joined ? `Ваша роль: ${state.myRole ? roleNames[state.myRole] : "ожидание"}${alive ? "" : " · вы выбыли и можете читать чат"}` : "Вы наблюдаете за игрой."}
      </p>}
      {state.phase === "NIGHT" && <div className="mafia-actions">
        <p>Ночь. Действия скрыты от остальных игроков. Днём результаты появятся в чате.</p>
        {canAct && targetType ? <div className="mafia-targets">
          <strong>{state.myRole === "MAFIA" ? "Выберите жертву" : state.myRole === "DOCTOR" ? "Кого защитить" : "Кого проверить"}</strong>
          <div>{targetPlayers.map(player => <button type="button" key={player.userId} className={state.myActionTargetUserId === player.userId ? "selected" : ""} disabled={busy} onClick={() => action("mafia:night-action", { type: targetType, targetUserId: player.userId })}>{player.name}</button>)}</div>
          <small>Выбор можно изменить до конца ночи.</small>
        </div> : <p>Ожидайте окончания ночи.</p>}
      </div>}
      {state.phase === "DAY" && <div className="mafia-actions">
        <p>Обсуждайте события в общем чате. Живых игроков: {living.length}.</p>
        {host && alive && <button type="button" disabled={busy} onClick={() => action("mafia:start-vote")}>Начать голосование</button>}
      </div>}
      {state.phase === "VOTING" && <div className="mafia-actions">
        <p>Голосование открытое. Выберите игрока или воздержитесь; голос можно изменить до конца таймера.</p>
        {canAct && <div className="mafia-targets"><div>{living.map(player => <button type="button" key={player.userId} className={state.myVoteTargetUserId === player.userId ? "selected" : ""} disabled={busy} onClick={() => action("mafia:vote", { targetUserId: player.userId })}>{player.name}</button>)}<button type="button" className={myVoteCast && state.myVoteTargetUserId === null ? "selected" : ""} disabled={busy} onClick={() => action("mafia:vote", { targetUserId: null })}>Воздержаться</button></div></div>}
        <section className="mafia-vote-board" aria-label="Текущий счёт голосования">
          <div className="mafia-vote-board-head"><strong>Счёт голосования</strong><span aria-live="polite">{state.votes.length} из {living.length} проголосовали</span></div>
          <div className="mafia-vote-list">
            {voteTallies.map(player => <div className="mafia-vote-row" key={player.userId}>
              <div className="mafia-vote-row-head"><span>{player.name}</span><strong>{player.voters.length}</strong></div>
              <div className="mafia-vote-track"><span style={{ width: `${living.length ? player.voters.length / living.length * 100 : 0}%` }} /></div>
              {player.voters.length > 0 && <small>За: {player.voters.join(", ")}</small>}
            </div>)}
            {abstainers.length > 0 && <div className="mafia-vote-abstain">Воздержались: <strong>{abstainers.length}</strong><small>{abstainers.join(", ")}</small></div>}
          </div>
        </section>
      </div>}
      {state.checks && state.checks.length > 0 && <div className="mafia-checks"><strong>Проверки комиссара</strong>{state.checks.map(check => <span key={check.round}>Ночь {check.round}: {state.players.find(player => player.userId === check.targetUserId)?.name ?? "Игрок"} — {check.result === "MAFIA" ? "мафия" : "не мафия"}</span>)}</div>}
      {state.phase === "FINISHED" && <div className="mafia-actions"><p>{state.winner === "MAFIA" ? "Победила мафия." : state.winner === "CIVILIANS" ? "Победили мирные." : "Игра остановлена."}</p><button type="button" disabled={busy} onClick={() => action("mafia:create")}>Новая партия</button></div>}
      {host && state.phase !== "FINISHED" && <button type="button" className="mafia-stop" disabled={busy} onClick={() => { if (window.confirm("Остановить текущую партию?")) action("mafia:stop"); }}>Остановить игру</button>}
    </>}
    </div>
  </aside>
  {isAdmin && <aside className={"mafia-admin-panel" + (adminCollapsed ? " collapsed" : "")} aria-label="Админский обзор Мафии">
    <div className="mafia-panel-head">
      <div><span className="mafia-eyebrow">Только администратору</span><strong>Мафия · тест и обзор</strong></div>
      <button type="button" className="mafia-collapse-button" aria-expanded={!adminCollapsed} onClick={() => setAdminCollapsed(value => !value)}>{adminCollapsed ? "Развернуть" : "Свернуть"}</button>
    </div>
    {!adminCollapsed && <div className="mafia-panel-body">
      <p className="mafia-admin-explain">Админский обзор. Сведения ниже не относятся к вашей игровой роли и не видны остальным.</p>
      {(!state || state.phase === "FINISHED") && <button type="button" className="mafia-test-start" disabled={busy} onClick={() => action("mafia:create-test", { botCount: 5 })}>Запустить тест с 5 ботами</button>}
      {state?.adminView && <>
        {state.isTestMode && <div className="mafia-test-notice"><strong>ИИ-боты</strong><span>{state.aiConfigured ? "AITunnel · gemini-2.5-flash-lite" : "Ключ AITUNNEL_API_KEY не задан — локальные правила."}</span>{state.aiIssue && <small>{state.aiIssue}</small>}</div>}
        <div className="mafia-admin-roles"><strong>Все роли · только администратору</strong>{state.players.map(player => <span key={player.userId}>{player.name}: {state.adminRoles?.find(item => item.userId === player.userId)?.role ? roleNames[state.adminRoles.find(item => item.userId === player.userId)!.role as Role] : "не назначена"}</span>)}</div>
        {state.adminNightActions && state.adminNightActions.length > 0 && <div className="mafia-admin-roles"><strong>Ночные действия · только администратору</strong>{state.adminNightActions.map(item => <span key={item.actorUserId + item.type}>{state.players.find(player => player.userId === item.actorUserId)?.name ?? "Игрок"} — {item.type === "MAFIA_KILL" ? "цель мафии" : item.type === "DOCTOR_PROTECT" ? "защита" : "проверка"}: {state.players.find(player => player.userId === item.targetUserId)?.name ?? "Игрок"}</span>)}</div>}
        {state.isTestMode && state.hostUserId === userId && !["LOBBY", "FINISHED"].includes(state.phase) && <button type="button" className="mafia-advance" disabled={busy} onClick={() => action("mafia:advance-test")}>Завершить фазу сейчас</button>}
      </>}
    </div>}
  </aside>}</>;
}
