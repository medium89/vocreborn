"use client";
import { useEffect, useRef, useState } from "react";
import { Headphones, Music2, Pause, Play, Radio } from "lucide-react";
import { getRadioStatus, type RadioStatus } from "@/lib/radio-api";
import type { AuthUser } from "@/lib/chat-contract";

export function RadioPlayer({ user, onOpen }: { user: AuthUser; onOpen: (mode: "requests" | "studio") => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<RadioStatus | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(.7);
  const [error, setError] = useState("");
  const [microphone, setMicrophone] = useState(false);
  useEffect(() => {
    let active = true;
    const update = () => void getRadioStatus().then(next => { if (active) setState(next); }).catch(() => { if (active) setError("Нет связи с радио"); });
    update(); const timer = setInterval(update, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [user.id]);
  useEffect(() => {
    const own = audio.current;
    const adjust = () => {
      const other = Array.from(document.querySelectorAll("audio")).some(element => element !== own && !element.paused && !element.ended);
      if (own) own.volume = microphone || other ? volume * .15 : volume;
    };
    const capture = (event: Event) => { if (event.target !== own) adjust(); };
    const mic = (event: Event) => setMicrophone(Boolean((event as CustomEvent).detail));
    adjust(); document.addEventListener("play", capture, true); document.addEventListener("pause", capture, true); document.addEventListener("ended", capture, true); window.addEventListener("tusova:microphone", mic);
    return () => { document.removeEventListener("play", capture, true); document.removeEventListener("pause", capture, true); document.removeEventListener("ended", capture, true); window.removeEventListener("tusova:microphone", mic); };
  }, [volume, microphone, state?.enabled]);
  useEffect(() => {
    if (!state?.live) { audio.current?.pause(); audio.current?.removeAttribute("src"); setPlaying(false); }
  }, [state?.live]);
  useEffect(() => { const element = audio.current; return () => { element?.pause(); element?.removeAttribute("src"); }; }, [state?.enabled]);
  async function toggle() {
    const element = audio.current;
    if (!element) return;
    if (playing) { element.pause(); element.removeAttribute("src"); setPlaying(false); return; }
    if (!state?.live || !state.streamUrl) return;
    setError(""); element.src = state.streamUrl + "?t=" + Date.now();
    try { await element.play(); setPlaying(true); }
    catch { setError("Не удалось подключиться. Нажмите, чтобы попробовать снова"); setPlaying(false); }
  }
  if (!state?.enabled) return null;
  return <section className="radio-player" aria-label="Радио TUSOVA">
    <audio ref={audio} preload="none" onError={() => { setError("Эфир прерван. Подключитесь ещё раз"); setPlaying(false); }} />
    <button type="button" className="radio-listen" disabled={!state.live} onClick={() => void toggle()} aria-label={playing ? "Остановить эфир" : "Слушать эфир"}>{playing ? <Pause size={17} /> : <Play size={17} />}<span>{playing ? "Эфир" : state.live ? "Слушать эфир" : "Эфир офлайн"}</span></button>
    <span className="radio-now"><b>{state.live && <i>LIVE</i>} {state.host?.displayName ?? "TUSOVA Radio"}</b><small>{error || (state.track ? state.track.artist + " — " + state.track.title : "Музыка нашей тусовы")}</small></span>
    {playing && <label className="radio-volume"><span className="visually-hidden">Громкость эфира</span><input type="range" min="0" max="1" step=".05" value={volume} onChange={event => setVolume(Number(event.target.value))} /></label>}
    <button type="button" className="radio-order-link" onClick={() => onOpen("requests")} title="Заказать песню"><Music2 size={17} /><span>Заказать песню</span></button>
    {(user.isDj || user.role === "admin") && <button type="button" className="radio-order-link" onClick={() => onOpen("studio")} title="Студия DJ" aria-label="Студия DJ"><Headphones size={17} /><span>Студия</span></button>}
  </section>;
}
