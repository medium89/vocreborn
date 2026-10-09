"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Coins, Dices, RotateCw, Sparkles, Trophy } from "lucide-react";
import { fetchCasino, spinRoulette, type CasinoColor, type CasinoSpin, type CasinoState } from "@/lib/casino-api";

const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const STEP = 360 / ORDER.length;
const colorOf = (number: number): CasinoColor => number === 0 ? "green" : RED.has(number) ? "red" : "black";
const wheelGradient = `conic-gradient(from ${-STEP / 2}deg, ${ORDER.map((number, index) => {
  const color = colorOf(number) === "red" ? "#ba333d" : colorOf(number) === "green" ? "#277b53" : "#202b31";
  return `${color} ${index * STEP}deg ${(index + 1) * STEP}deg`;
}).join(", ")})`;
const numberFormat = new Intl.NumberFormat("ru-RU");
const format = (value: number) => numberFormat.format(value);
const multiplier = (bps: number) => (bps / 10000).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export function CasinoPage({ balance, isGuest, onBalance, onBack }: {
  balance: number; isGuest: boolean; onBalance: (balance: number) => void; onBack: () => void;
}) {
  const [data, setData] = useState<CasinoState | null>(null);
  const [choice, setChoice] = useState<CasinoColor>("red");
  const [bet, setBet] = useState("10");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ id: string; choice: CasinoColor; bet: number } | null>(null);
  const [result, setResult] = useState<CasinoSpin | null>(null);
  const [error, setError] = useState("");
  const rotationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isGuest) return;
    void fetchCasino().then(setData).catch(cause => setError(cause instanceof Error ? cause.message : "Не удалось загрузить казино"));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isGuest]);

  const available = data?.balance ?? balance;
  const limits = data?.settings;
  const maxBet = Math.min(available, limits?.maxBet ?? available);
  const amount = Number(bet);
  const validBet = Number.isSafeInteger(amount) && amount >= (limits?.minBet ?? 1) && amount <= maxBet;

  async function play() {
    if ((!validBet && !pending) || (!limits?.enabled && !pending) || busy || spinning) return;
    const request = pending ?? { id: crypto.randomUUID(), choice, bet: amount };
    setPending(request);
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const spin = await spinRoulette(request.id, request.choice, request.bet);
      setPending(null);
      onBalance(spin.balanceAfter);
      const index = ORDER.indexOf(spin.number);
      const target = (360 - index * STEP) % 360;
      const current = rotationRef.current;
      const extra = (target - (current % 360) + 360) % 360;
      const next = current + 360 * 5 + extra;
      rotationRef.current = next;
      setSpinning(true);
      setRotation(next);
      const finish = () => {
        setSpinning(false);
        setResult(spin);
        setData(currentData => currentData ? {
          ...currentData, balance: spin.balanceAfter, jackpot: spin.jackpotAfter,
          chancePerMillion: spin.jackpotChancePerMillion,
          recent: [spin, ...currentData.recent.filter(item => item.id !== spin.id)].slice(0, 8),
        } : currentData);
      };
      timerRef.current = setTimeout(finish, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 100 : 5100);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось провести ставку");
    } finally {
      setBusy(false);
    }
  }

  return <section className="casino-page">
    <header className="casino-header">
      <div><span className="casino-eyebrow"><Sparkles size={15} /> ИГРОВАЯ КОМНАТА</span><h1>Рулетка TUSOVA</h1><p>Выберите цвет, поставьте кредиты и запустите колесо.</p></div>
      <button className="casino-back" type="button" onClick={onBack}><ArrowLeft size={17} /> В чат</button>
    </header>
    {isGuest ? <div className="casino-guest"><Dices size={32} /><h2>Для игры нужна регистрация</h2><p>Ставки доступны зарегистрированным участникам чата.</p></div> : <>
      <div className="casino-topline">
        <div className="casino-stat"><span><Coins size={17} /> Ваш баланс</span><strong>{format(available)}</strong><small>кредитов</small></div>
        <div className="casino-stat casino-pot"><span><Trophy size={17} /> Джекпот</span><strong>{format(data?.jackpot ?? 0)}</strong><small>кредитов</small></div>
      </div>
      <div className="casino-main">
        <div className="casino-wheel-panel">
          <div className="casino-wheel-wrap">
            <div className="casino-pointer" aria-hidden="true"><i /></div>
            <div className={"casino-wheel" + (spinning ? " is-spinning" : "")} style={{ background: wheelGradient, transform: `rotate(${rotation}deg)` }} aria-label="Европейская рулетка с числами от 0 до 36">
              {ORDER.map((number, index) => {
                const rad = index * STEP * Math.PI / 180;
                return <span key={number} className="casino-wheel-number" style={{ left: `${50 + 42 * Math.sin(rad)}%`, top: `${50 - 42 * Math.cos(rad)}%`, transform: `translate(-50%, -50%) rotate(${-rotation}deg)` }}>{number}</span>;
              })}
              <div className="casino-wheel-center"><Dices size={27} /><span>TUSOVA</span></div>
            </div>
          </div>
          <p className="casino-wheel-caption">{spinning ? "Колесо вращается…" : result ? `Выпало ${result.number} · ${result.color === "red" ? "красное" : result.color === "black" ? "чёрное" : "зелёное"}` : "Европейская рулетка · 37 секторов"}</p>
        </div>
        <div className="casino-controls">
          <h2>Ваша ставка</h2>
          <div className="casino-choices" role="group" aria-label="Выбрать цвет">
            {(["red", "black", "green"] as const).map(color => <button key={color} type="button" disabled={busy || spinning || Boolean(pending)} className={`casino-choice ${color}${choice === color ? " selected" : ""}`} aria-pressed={choice === color} onClick={() => setChoice(color)}><i /> <span>{color === "red" ? "Красное" : color === "black" ? "Чёрное" : "Зелёное"}</span><strong>x{multiplier(color === "green" ? limits?.greenPayoutBps ?? 334800 : limits?.redBlackPayoutBps ?? 18600)}</strong></button>)}
          </div>
          <label className="casino-bet-label">Сумма ставки <span>от {format(limits?.minBet ?? 1)} до {format(maxBet)} кредитов</span><input type="number" inputMode="numeric" min={limits?.minBet ?? 1} max={maxBet} step="1" value={bet} disabled={busy || spinning || Boolean(pending)} onChange={event => setBet(event.target.value)} /></label>
          <div className="casino-bet-shortcuts"><button type="button" disabled={busy || spinning || Boolean(pending) || maxBet < (limits?.minBet ?? 1)} onClick={() => setBet(String(Math.min(maxBet, Math.max(limits?.minBet ?? 1, Math.floor(available / 4))))) }>¼ баланса</button><button type="button" disabled={busy || spinning || Boolean(pending) || maxBet < (limits?.minBet ?? 1)} onClick={() => setBet(String(Math.min(maxBet, Math.max(limits?.minBet ?? 1, Math.floor(available / 2))))) }>½ баланса</button><button type="button" disabled={busy || spinning || Boolean(pending) || maxBet < (limits?.minBet ?? 1)} onClick={() => setBet(String(maxBet))}>Максимум</button></div>
          <button type="button" className="casino-play" disabled={(!limits?.enabled && !pending) || (!validBet && !pending) || busy || spinning} onClick={() => void play()}><RotateCw size={20} />{busy ? "Принимаем ставку…" : spinning ? "Колесо вращается…" : pending ? "Повторить прежнюю ставку" : "Крутить рулетку"}</button>
          {pending && <p className="casino-pending">Повторная отправка проверит результат ставки {format(pending.bet)} на {pending.choice === "red" ? "красное" : pending.choice === "black" ? "чёрное" : "зелёное"} и не спишет кредиты ещё раз.</p>}
          {!limits?.enabled && data && <p className="casino-disabled">Казино временно закрыто администратором.</p>}
          {error && <p className="casino-error" role="alert">{error}</p>}
          {result && <div className={"casino-result" + (result.payout || result.jackpotWon ? " won" : "")} role="status"><strong>{result.jackpotWon ? "ДЖЕКПОТ!" : result.payout ? "Победа!" : "В этот раз не повезло"}</strong><span>{result.jackpotWon ? `Джекпот +${format(result.jackpotWon)} · ` : ""}{result.payout ? `Выплата +${format(result.payout)} · ` : ""}Баланс {format(result.balanceAfter)}</span></div>}
          <p className="casino-rules">Выплата включает ставку. При проигрыше вся ставка пополняет джекпот. Шанс джекпота применяется к каждому прокруту и растёт с суммой банка.</p>
        </div>
      </div>
      <section className="casino-history"><h2>Последние прокруты</h2>{data?.recent.length ? <div>{data.recent.map(item => <div key={item.id} className="casino-history-row"><span className={`casino-history-number ${item.color}`}>{item.number}</span><span>{item.choice === "red" ? "Красное" : item.choice === "black" ? "Чёрное" : "Зелёное"} · {format(item.bet)} кредитов</span><strong className={item.payout + item.jackpotWon - item.bet >= 0 ? "positive" : ""}>{item.payout + item.jackpotWon - item.bet > 0 ? "+" : ""}{format(item.payout + item.jackpotWon - item.bet)}</strong></div>)}</div> : <p>Пока нет ставок. Первый прокрут за вами.</p>}</section>
    </>}
  </section>;
}
