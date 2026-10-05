"use client";
import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/chat-api";
import { Download, Upload, RefreshCw, X } from "lucide-react";

type Settings = {
  enabled: boolean;
  timezone: string;
  windows: { days: number[]; start: string; end: string }[];
  intervalSeconds: number;
  durationSeconds: number;
  hint1Seconds: number;
  hint2Seconds: number;
  hint3Seconds: number;
  reward: number;
  minOnline: number;
  dailyQuestions: number;
  dailyBudget: number;
  playerDailyWins: number;
  playerDailyCredits: number;
  noRepeatHours: number;
  randomOrder: boolean;
  recycle: boolean;
  excludedUserIds: string[];
};
type Round = {
  id: string;
  themeTitle: string;
  question: string;
  answer: string;
  status: string;
  reward: number;
  startedAt: string;
  endsAt: string;
  winnerName: string | null;
  hintsSent: number;
};
type Overview = {
  runtimeEnabled: boolean;
  config: Settings & {
    paused: boolean;
    nextAt: string | null;
    lastReason: string | null;
  };
  themes: {
    id: string;
    externalId: string;
    title: string;
    revision: number;
    enabled: boolean;
    _count: { questions: number };
  }[];
  active: Round | null;
  history: Round[];
  nextCursor: string | null;
  ranking: {
    winnerName: string;
    _count: { _all: number };
    _sum: { reward: number };
  }[];
  imports: {
    id: string;
    createdAt: string;
    details: Record<string, unknown>;
  }[];
};
type Preview = {
  document: Record<string, unknown> & {
    questions: {
      id: string;
      question: string;
      answer: string;
      acceptedAnswers: string[];
    }[];
  };
  existing: {
    id: string;
    title: string;
    revision: number;
    questions: number;
  } | null;
  changes: { added: number; removed: number; changed: number };
};
const example = {
  version: 1,
  id: "night-nature",
  theme: "Ночной мир",
  questions: [
    {
      id: "owl",
      question: "Какая ночная птица стала символом TUSOVA?",
      answer: "сова",
      acceptedAnswers: ["совушка"],
    },
    {
      id: "moon",
      question: "Как называется естественный спутник Земли?",
      answer: "Луна",
      acceptedAnswers: [],
    },
  ],
};
async function api<T>(path = "", body?: unknown, method = "POST"): Promise<T> {
  const r = await fetch(API_URL + "/api/admin/quiz" + path, {
    method: body === undefined ? "GET" : method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join("; ")
        : (data.message ?? "Не удалось выполнить действие"),
    );
  return data;
}
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function editable(config: Overview["config"]): Settings {
  const {
    enabled,
    timezone,
    windows,
    intervalSeconds,
    durationSeconds,
    hint1Seconds,
    hint2Seconds,
    hint3Seconds,
    reward,
    minOnline,
    dailyQuestions,
    dailyBudget,
    playerDailyWins,
    playerDailyCredits,
    noRepeatHours,
    randomOrder,
    recycle,
    excludedUserIds,
  } = config;
  return {
    enabled,
    timezone,
    windows,
    intervalSeconds,
    durationSeconds,
    hint1Seconds,
    hint2Seconds,
    hint3Seconds,
    reward,
    minOnline,
    dailyQuestions,
    dailyBudget,
    playerDailyWins,
    playerDailyCredits,
    noRepeatHours,
    randomOrder,
    recycle,
    excludedUserIds,
  };
}
const names: Partial<Record<keyof Settings, string>> = {
  intervalSeconds: "Пауза между вопросами, сек.",
  durationSeconds: "Время на ответ, сек.",
  hint1Seconds: "Первая подсказка (20%), сек.",
  hint2Seconds: "Вторая подсказка (40%), сек.",
  hint3Seconds: "Третья подсказка (60%), сек.",
  reward: "Награда, кредиты",
  minOnline: "Минимум участников онлайн",
  dailyQuestions: "Максимум вопросов в день",
  dailyBudget: "Бюджет наград за день",
  playerDailyWins: "Побед на участника в день",
  playerDailyCredits: "Кредитов на участника в день",
  noRepeatHours: "Не повторять вопрос, часов",
};
export function QuizAdminPanel() {
  const [state, setState] = useState<Overview | null>(null),
    [draft, setDraft] = useState<Settings | null>(null),
    [windows, setWindows] = useState(""),
    [excluded, setExcluded] = useState(""),
    [text, setText] = useState(JSON.stringify(example, null, 2)),
    [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<Round[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<
    | { kind: "outside" }
    | { kind: "delete"; theme: Overview["themes"][number] }
    | null
  >(null);
  const alive = useRef(true),
    dirty = useRef(false),
    paged = useRef(false);
  async function load(reset = false) {
    const data = await api<Overview>();
    if (!alive.current) return;
    setState(data);
    if (reset || !paged.current) {
      setHistory(data.history);
      setCursor(data.nextCursor);
    }
    if (reset || !dirty.current) {
      setDraft(editable(data.config));
      setWindows(JSON.stringify(data.config.windows, null, 2));
      setExcluded(data.config.excludedUserIds.join("\n"));
    }
  }
  useEffect(() => {
    alive.current = true;
    void load().catch((c) => setError(c.message));
    const timer = setInterval(
      () =>
        void load().catch((c) => {
          if (alive.current) setError(c.message);
        }),
      5000,
    );
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, []);
  async function run(action: () => Promise<unknown>, message = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (alive.current) {
        await load();
        setNotice(message);
      }
    } catch (c) {
      if (alive.current)
        setError(c instanceof Error ? c.message : "Действие не выполнено");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function change(key: keyof Settings, value: unknown) {
    dirty.current = true;
    setDraft((old) => (old ? { ...old, [key]: value } : null));
  }
  async function earlier() {
    if (!cursor) return;
    const next = await api<Overview>("?cursor=" + encodeURIComponent(cursor));
    paged.current = true;
    setHistory((old) => [...old, ...next.history]);
    setCursor(next.nextCursor);
  }
  async function confirmAction() {
    if (!confirmation) return;
    const action = confirmation;
    setConfirmation(null);
    if (action.kind === "outside") {
      await run(() => api("/control", { action: "start", confirmed: true }));
    } else {
      await run(() => api("/themes/" + action.theme.id, {}, "DELETE"));
    }
  }

  return (
    <section className="quiz-admin-panel" aria-label="Управление викториной">
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="quiz-notice" role="status">
          {notice}
        </p>
      )}
      {!state || !draft ? (
        <p>Загружаем викторину…</p>
      ) : (
        <>
          <section className="quiz-card">
            <h3>Сова Викторина</h3>
            <p>
              {!state.runtimeEnabled
                ? "Серверный запуск выключен: задайте TUSOVA_QUIZ_ENABLED=true и перезапустите API."
                : !state.config.enabled
                  ? "Выключена"
                  : state.config.paused
                    ? "На паузе"
                    : state.active
                      ? "Идёт вопрос"
                      : "Ожидает участников / следующего вопроса"}
            </p>
            <p>
              Следующий запуск:{" "}
              {state.config.nextAt
                ? new Date(state.config.nextAt).toLocaleString("ru-RU", {
                    timeZone: state.config.timezone,
                  })
                : "—"}{" "}
              · {state.config.timezone}
            </p>
            {state.config.lastReason && <p>{state.config.lastReason}</p>}
            {state.active && (
              <p>
                <b>
                  {state.active.themeTitle}: {state.active.question}
                </b>
                <br />
                Ответ (только для администратора): {state.active.answer}.
                Подсказок: {state.active.hintsSent}/3; окончание:{" "}
                {new Date(state.active.endsAt).toLocaleTimeString("ru-RU")}
              </p>
            )}
            <div className="quiz-actions">
              <button
                type="button"
                disabled={
                  busy || !state.runtimeEnabled || Boolean(state.active)
                }
                onClick={() =>
                  void run(() => api("/control", { action: "start" }))
                }
              >
                Задать вопрос сейчас
              </button>
              <button
                type="button"
                disabled={busy || !state.runtimeEnabled}
                onClick={() =>
                  void run(() =>
                    api("/control", {
                      action: state.config.paused ? "resume" : "pause",
                    }),
                  )
                }
              >
                {state.config.paused ? "Продолжить" : "Пауза"}
              </button>
              <button
                type="button"
                disabled={busy || !state.active}
                onClick={() =>
                  void run(() => api("/control", { action: "skip" }))
                }
              >
                Пропустить вопрос
              </button>
              <button
                type="button"
                disabled={busy || !state.active}
                onClick={() =>
                  void run(() => api("/control", { action: "finish" }))
                }
              >
                Завершить раунд
              </button>
              <button
                type="button"
                disabled={
                  busy || !state.runtimeEnabled || Boolean(state.active)
                }
                onClick={() => setConfirmation({ kind: "outside" })}
              >
                Вне расписания…
              </button>
              <button
                type="button"
                aria-label="Обновить викторину"
                disabled={busy}
                onClick={() => void run(() => load())}
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <small>
              Пауза/выключение завершает текущий вопрос без награды. Изменение
              темы или награды не меняет уже начавшийся раунд.
            </small>
          </section>
          <form
            className="quiz-card quiz-settings"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(
                  "/settings",
                  {
                    settings: {
                      ...draft,
                      windows: JSON.parse(windows),
                      excludedUserIds: excluded.split(/\s+/).filter(Boolean),
                    },
                  },
                  "PATCH",
                );
                dirty.current = false;
                await load(true);
              }, "Настройки сохранены");
            }}
          >
            <h3>Настройки</h3>
            <label className="quiz-check">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => change("enabled", e.target.checked)}
              />
              Включить викторину
            </label>
            <div className="quiz-settings-grid">
              <label>
                Часовой пояс
                <input
                  required
                  maxLength={64}
                  value={draft.timezone}
                  onChange={(e) => change("timezone", e.target.value)}
                />
              </label>
              {Object.entries(names).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    required
                    min={key === "noRepeatHours" ? 0 : 1}
                    max={key === "dailyBudget" ? 1000000 : 86400}
                    value={draft[key as keyof Settings] as number}
                    onChange={(e) =>
                      change(key as keyof Settings, Number(e.target.value))
                    }
                  />
                </label>
              ))}
            </div>
            <label className="quiz-check">
              <input
                type="checkbox"
                checked={draft.randomOrder}
                onChange={(e) => change("randomOrder", e.target.checked)}
              />
              Случайный порядок без повторов в круге
            </label>
            <label className="quiz-check">
              <input
                type="checkbox"
                checked={draft.recycle}
                onChange={(e) => change("recycle", e.target.checked)}
              />
              Повторять после полного круга и периода запрета
            </label>
            <label>
              Рабочие окна (JSON)
              <textarea
                rows={5}
                value={windows}
                onChange={(e) => {
                  dirty.current = true;
                  setWindows(e.target.value);
                }}
              />
            </label>
            <small>
              days: 0 — воскресенье, 1 — понедельник, … 6 — суббота. Для ночного
              окна: start «22:00», end «02:00», дни относятся к началу окна.
              Полный день: 00:00–24:00. Первый таймер &lt; второй &lt; третий
              &lt; время раунда.
            </small>
            <label>
              Исключить аккаунты из участия (UUID, по одному на строку)
              <textarea
                rows={2}
                value={excluded}
                onChange={(e) => {
                  dirty.current = true;
                  setExcluded(e.target.value);
                }}
              />
            </label>
            <button type="submit" className="action-button" disabled={busy}>
              Сохранить настройки
            </button>
          </form>
          <section className="quiz-card">
            <h3>Темы и вопросы</h3>
            <p>
              Новые темы выключены до явного включения. Ответы здесь видны
              только администратору.
            </p>
            <div className="quiz-themes">
              {state.themes.map((theme) => (
                <article key={theme.id}>
                  <div>
                    <b>{theme.title}</b>
                    <small>
                      {theme.externalId} · версия {theme.revision} ·{" "}
                      {theme._count.questions} вопросов
                    </small>
                  </div>
                  <label className="quiz-check">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={theme.enabled}
                      onChange={(e) =>
                        void run(() =>
                          api(
                            "/themes/" + theme.id,
                            { enabled: e.target.checked },
                            "PATCH",
                          ),
                        )
                      }
                    />
                    Активна
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const doc = await api("/themes/" + theme.id);
                        setText(JSON.stringify(doc, null, 2));
                        setPreview(null);
                      }, "Тема открыта для редактирования; сначала проверьте JSON, затем обновите тему")
                    }
                  >
                    Редактировать / посмотреть
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () =>
                        download(
                          theme.externalId + ".json",
                          await api("/themes/" + theme.id),
                        ),
                      )
                    }
                  >
                    <Download size={14} />
                    JSON
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmation({ kind: "delete", theme })}
                  >
                    Удалить
                  </button>
                </article>
              ))}
            </div>
            <div className="quiz-actions">
              <button
                type="button"
                onClick={() => download("tusova-quiz-template.json", example)}
              >
                <Download size={14} />
                Скачать шаблон
              </button>
              <label className="quiz-file">
                <Upload size={14} />
                Выбрать JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (file.size > 256 * 1024) {
                      setError("JSON не больше 256 КБ");
                      return;
                    }
                    setText(await file.text());
                    setPreview(null);
                  }}
                />
              </label>
            </div>
            <label>
              JSON темы
              <textarea
                rows={10}
                spellCheck={false}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <small>
              version: 1, уникальные id; question до 500 символов, answer до 100
              и не менее трёх букв; acceptedAnswers — дополнительные точные
              варианты.
            </small>
            <div className="quiz-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    async () =>
                      setPreview(
                        await api<Preview>("/preview", {
                          document: JSON.parse(text),
                        }),
                      ),
                    "JSON проверен; проверьте изменения перед сохранением",
                  )
                }
              >
                Проверить JSON
              </button>
              {preview && (
                <button
                  type="button"
                  className="action-button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      async () => {
                        await api("/import", {
                          document: preview.document,
                          mode: preview.existing ? "update" : "create",
                        });
                        setPreview(null);
                      },
                      preview.existing
                        ? "Тема обновлена"
                        : "Тема создана — включите её для игры",
                    )
                  }
                >
                  {preview.existing
                    ? "Обновить существующую тему"
                    : "Создать новую тему"}
                </button>
              )}
            </div>
            {preview && (
              <div className="quiz-preview">
                <p>
                  {preview.existing
                    ? "Обновление темы «" +
                      preview.existing.title +
                      "». Для создания новой измените id в JSON и проверьте снова."
                    : "Новая тема"}{" "}
                  Добавлено: {preview.changes.added}; изменено:{" "}
                  {preview.changes.changed}; удалено: {preview.changes.removed}.
                </p>
                {preview.document.questions.map((q) => (
                  <details key={q.id}>
                    <summary>{q.question}</summary>
                    <p>
                      Ответ: {q.answer}; варианты:{" "}
                      {q.acceptedAnswers.join(", ") || "нет"}
                    </p>
                  </details>
                ))}
              </div>
            )}
          </section>
          <section className="quiz-card">
            <h3>История раундов</h3>
            {history.length === 0 && <p>Раундов пока нет.</p>}
            <div className="quiz-history">
              {history.map((row) => (
                <article key={row.id}>
                  <b>{row.question}</b>
                  <small>
                    {new Date(row.startedAt).toLocaleString("ru-RU")} ·{" "}
                    {row.status} · {row.winnerName ?? "без победителя"} ·{" "}
                    {row.reward} кредитов
                  </small>
                </article>
              ))}
            </div>
            {cursor && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(earlier)}
              >
                Ранее
              </button>
            )}
            <h3>Победители сегодня</h3>
            {state.ranking.map((row, i) => (
              <p key={i}>
                {row.winnerName}: {row._count._all} побед, {row._sum.reward}{" "}
                кредитов
              </p>
            ))}
            <h3>Последние импорты</h3>
            {state.imports.map((row) => (
              <p key={row.id}>
                {new Date(row.createdAt).toLocaleString("ru-RU")} · версия{" "}
                {String(row.details.revision)} · {String(row.details.questions)}{" "}
                вопросов
              </p>
            ))}
          </section>
        </>
      )}
      {confirmation && (
        <div
          className="modal-backdrop"
          onMouseDown={() => !busy && setConfirmation(null)}
        >
          <section
            className="modal admin-record-dialog admin-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Закрыть"
              onClick={() => setConfirmation(null)}
            >
              <X size={18} />
            </button>
            <span className="eyebrow">ПОДТВЕРЖДЕНИЕ</span>
            <h3>
              {confirmation.kind === "outside"
                ? "Задать вопрос вне расписания?"
                : "Удалить тему «" + confirmation.theme.title + "»?"}
            </h3>
            <p>
              {confirmation.kind === "outside"
                ? "Дневные лимиты и минимум участников сохраняются."
                : "Уже начавшийся раунд останется неизменным."}
            </p>
            <footer>
              <button
                type="button"
                className="action-button secondary"
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="action-button"
                disabled={busy}
                onClick={() => void confirmAction()}
              >
                {busy
                  ? "Выполняем…"
                  : confirmation.kind === "outside"
                    ? "Задать вопрос"
                    : "Удалить"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
