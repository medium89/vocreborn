"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Coins, ListVideo, Maximize2, Minimize2, Pause, Play, Trash2, Volume2, VolumeX } from "lucide-react";
import type { Message, UserRole, VideoRoomState } from "@/lib/chat-contract";

type Props = {
  session?: VideoRoomState;
  currentUserId?: string;
  currentUserRole?: UserRole;
  messages: Message[];
  openSourceRequest?: number;
  onSetSource: (videoUrl: string) => Promise<void>;
  onControl: (action: "play" | "pause" | "seek", position?: number) => void;
  onRemoveItem: (itemId: string) => void;
  onEnded: (itemId: string) => void;
  onTitle: (itemId: string, title: string) => void;
  onSendMessage: (body: string) => Promise<void>;
};

type ControlProps = {
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  canControl: boolean;
  ready: boolean;
  onToggle: () => void;
  onSeek: (position: number) => void;
  onVolume: (volume: number) => void;
  onMute: () => void;
  onFullscreen: () => void;
  fullscreen: boolean;
};

type YouTubePlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData?(): { title?: string };
  unloadModule?(module: string): void;
  destroy(): void;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: (event: { target: YouTubePlayer }) => void;
        onStateChange: (event: { data: number }) => void;
        onAutoplayBlocked?: (event: { target: YouTubePlayer }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
};

type VkState = {
  title?: string;
  state?: string;
  volume?: number;
  muted?: boolean;
  time?: number;
  duration?: number;
};

type VkPlayer = {
  play(): void;
  pause(): void;
  seek(time: number): void;
  setVolume(volume: number): void;
  getVolume(): number;
  getCurrentTime(): number;
  getDuration(): number;
  getState(): string;
  isMuted(): boolean;
  mute(): void;
  unmute(): void;
  on(event: string, listener: (state: VkState) => void): void;
  destroy(): void;
};

type VkApi = { VideoPlayer: ((iframe: HTMLIFrameElement) => VkPlayer) & { Events?: Record<string, string> } };

let youtubeApiPromise: Promise<YouTubeApi> | null = null;
let vkApiPromise: Promise<VkApi> | null = null;

function projectedPosition(session: VideoRoomState) {
  if (!session.playing) return Math.max(0, session.position);
  const updatedAt = new Date(session.updatedAt).getTime();
  const elapsed = Number.isFinite(updatedAt) ? Math.max(0, (Date.now() - updatedAt) / 1000) : 0;
  return Math.max(0, session.position + elapsed);
}

function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0 ? hours + ":" + String(minutes).padStart(2, "0") + ":" + rest : minutes + ":" + rest;
}

function youtubeId(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.searchParams.get("v")) return url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    const marker = parts.findIndex((part) => part === "embed" || part === "shorts" || part === "live");
    return marker >= 0 ? parts[marker + 1] ?? null : parts.at(-1) ?? null;
  } catch {
    return null;
  }
}

function rutubeEmbed(value: string) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const embedIndex = parts.findIndex((part) => part === "embed");
    const videoIndex = parts.findIndex((part) => part === "video" || part === "shorts");
    const id = embedIndex >= 0 ? parts[embedIndex + 1] : videoIndex >= 0 ? parts[videoIndex + 1] : null;
    if (!id) return value;
    const target = new URL("https://rutube.ru/play/embed/" + id);
    const accessKey = url.searchParams.get("p");
    if (accessKey) target.searchParams.set("p", accessKey);
    target.searchParams.set("getPlayOptions", "duration,title");
    return target.toString();
  } catch {
    return value;
  }
}

function vkEmbed(value: string) {
  try {
    const url = new URL(value);
    if (url.pathname.endsWith("/video_ext.php")) {
      url.protocol = "https:";
      url.hostname = "vk.com";
      url.searchParams.set("js_api", "1");
      url.searchParams.set("controls", "0");
      return url.toString();
    }
    const z = url.searchParams.get("z") ?? "";
    const token = (z.match(/video(-?\d+)_(\d+)/) ?? url.pathname.match(/video(-?\d+)_(\d+)/));
    if (!token) return value;
    const target = new URL("https://vk.com/video_ext.php");
    target.searchParams.set("oid", token[1]);
    target.searchParams.set("id", token[2]);
    target.searchParams.set("js_api", "1");
    target.searchParams.set("controls", "0");
    return target.toString();
  } catch {
    return value;
  }
}

function loadYouTubeApi() {
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const target = window as Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
    if (target.YT?.Player) return resolve(target.YT);
    const previous = target.onYouTubeIframeAPIReady;
    target.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (target.YT?.Player) resolve(target.YT);
      else reject(new Error("YouTube API не инициализировался"));
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("Не удалось загрузить YouTube API"));
      document.head.appendChild(script);
    }
  });
  return youtubeApiPromise;
}

function loadVkApi() {
  if (vkApiPromise) return vkApiPromise;
  vkApiPromise = new Promise<VkApi>((resolve, reject) => {
    const target = window as Window & { VK?: VkApi };
    if (target.VK?.VideoPlayer) return resolve(target.VK);
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://vk.com/js/api/videoplayer.js"]');
    const script = existing ?? document.createElement("script");
    const finish = () => target.VK?.VideoPlayer ? resolve(target.VK) : reject(new Error("VK Video API не инициализировался"));
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Не удалось загрузить VK Video API")), { once: true });
    if (!existing) {
      script.src = "https://vk.com/js/api/videoplayer.js";
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return vkApiPromise;
}

function Controls({ playing, position, duration, volume, muted, canControl, ready, onToggle, onSeek, onVolume, onMute, onFullscreen, fullscreen }: ControlProps) {
  const max = duration > 0 ? duration : Math.max(1, position);
  const progress = max > 0 ? Math.min(100, position / max * 100) : 0;
  return <div className="video-room-controls">
    <button type="button" className="video-room-control-icon" disabled={!canControl || !ready} onClick={onToggle} aria-label={playing ? "Пауза для всех" : "Воспроизвести для всех"} title={playing ? "Пауза для всех" : "Воспроизвести для всех"}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
    <span className="video-room-time">{formatTime(position)}</span>
    <input className="video-room-progress" type="range" min="0" max={max} step="0.25" value={Math.min(position, max)} disabled={!canControl || !ready || duration <= 0} aria-label="Позиция видео" style={{ "--video-progress": progress + "%" } as CSSProperties} onChange={(event) => onSeek(Number(event.target.value))} />
    <span className="video-room-time">{formatTime(duration)}</span>
    <button type="button" className="video-room-control-icon" disabled={!ready} onClick={onMute} aria-label={muted ? "Включить звук" : "Выключить звук"} title={muted ? "Включить звук" : "Выключить звук"}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
    <input className="video-room-volume" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} disabled={!ready} aria-label="Громкость" onChange={(event) => onVolume(Number(event.target.value))} />
    <button type="button" className="video-room-control-icon" onClick={onFullscreen} aria-label={fullscreen ? "Вернуть обычный размер" : "На весь экран"} title={fullscreen ? "Вернуть обычный размер" : "На весь экран"}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
  </div>;
}

function YouTubeVideo({ session, canControl, onControl, onFullscreen, fullscreen, onTitle, onEnded }: { session: VideoRoomState; canControl: boolean; onControl: Props["onControl"]; onFullscreen: () => void; fullscreen: boolean; onTitle: (title: string) => void; onEnded: () => void }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(session.playing);
  const [position, setPosition] = useState(projectedPosition(session));
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [autoplayMuted, setAutoplayMuted] = useState(false);
  const [loadError, setLoadError] = useState("");
  const sessionRef = useRef(session);
  const autoplayRetryRef = useRef(false);
  const id = useMemo(() => youtubeId(session.videoUrl ?? ""), [session.videoUrl]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!mountRef.current || !id) return;
    let cancelled = false;
    autoplayRetryRef.current = false;
    setAutoplayMuted(false);
    setLoadError("");
    void loadYouTubeApi().then((api) => {
      if (cancelled || !mountRef.current) return;
      playerRef.current = new api.Player(mountRef.current, {
        videoId: id,
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 0, cc_load_policy: 0, origin: window.location.origin },
        events: {
          onReady: ({ target }) => {
            if (cancelled) return;
            const targetPosition = projectedPosition(session);
            target.seekTo(targetPosition, true);
            target.setVolume(80);
            target.unloadModule?.("captions");
            const title = target.getVideoData?.().title?.trim();
            if (title) onTitle(title);
            window.setTimeout(() => {
              const delayedTitle = target.getVideoData?.().title?.trim();
              if (delayedTitle) onTitle(delayedTitle);
              target.unloadModule?.("captions");
            }, 500);
            if (session.playing) target.playVideo(); else target.pauseVideo();
            setReady(true);
            setPosition(targetPosition);
            setDuration(target.getDuration() || 0);
          },
          onStateChange: ({ data }) => {
            if (data === api.PlayerState.PLAYING) setPlaying(true);
            if (data === api.PlayerState.PAUSED) setPlaying(false);
            if (data === api.PlayerState.ENDED) { setPlaying(false); if (canControl) onEnded(); }
          },
          onAutoplayBlocked: ({ target }) => {
            if (cancelled || !sessionRef.current.playing) return;
            if (!autoplayRetryRef.current) {
              autoplayRetryRef.current = true;
              target.mute();
              setMuted(true);
              setAutoplayMuted(true);
              window.setTimeout(() => {
                if (!cancelled && sessionRef.current.playing) target.playVideo();
              }, 0);
              return;
            }
            setAutoplayMuted(true);
          },
          onError: ({ data }) => {
            if (cancelled) return;
            setLoadError("YouTube не загрузил видео (код " + data + ").");
            setReady(false);
          },
        },
      });
    }).catch(() => {
      setLoadError("Не удалось загрузить YouTube-плеер.");
      setReady(false);
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      setReady(false);
    };
  }, [id]);

  useEffect(() => {
    if (!ready || !playerRef.current) return;
    const player = playerRef.current;
    const targetPosition = projectedPosition(session);
    const current = player.getCurrentTime() || 0;
    if (Math.abs(current - targetPosition) > 1.5) player.seekTo(targetPosition, true);
    if (session.playing) player.playVideo(); else player.pauseVideo();
    setPlaying(session.playing);
    setPosition(targetPosition);
  }, [ready, session.playing, session.position, session.updatedAt]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setPosition(player.getCurrentTime() || 0);
      setDuration(player.getDuration() || 0);
    }, 500);
    return () => window.clearInterval(timer);
  }, [ready]);

  function seek(next: number) {
    if (!canControl || !playerRef.current) return;
    playerRef.current.seekTo(next, true);
    setPosition(next);
    onControl("seek", next);
  }

  function toggle() {
    const player = playerRef.current;
    if (!canControl || !player) return;
    const current = player.getCurrentTime() || position;
    if (playing) player.pauseVideo(); else player.playVideo();
    onControl(playing ? "pause" : "play", current);
  }

  function changeVolume(next: number) {
    const player = playerRef.current;
    if (!player) return;
    player.unMute();
    player.setVolume(Math.round(next * 100));
    setMuted(false);
    setAutoplayMuted(false);
    setVolume(next);
  }

  function toggleMute() {
    const player = playerRef.current;
    if (!player) return;
    if (muted) {
      player.unMute();
      if (sessionRef.current.playing) player.playVideo();
      setAutoplayMuted(false);
    } else {
      player.mute();
    }
    setMuted(!muted);
  }

  function resumeLocally() {
    const player = playerRef.current;
    if (!player) return;
    player.unMute();
    setMuted(false);
    setAutoplayMuted(false);
    if (sessionRef.current.playing) player.playVideo();
  }

  return <>
    <div className="video-room-media youtube">
      <div ref={mountRef} />
      {loadError && <div className="video-room-player-warning" role="status">{loadError}</div>}
    </div>
    {autoplayMuted && <button type="button" className="video-room-autoplay-warning" onClick={resumeLocally}><Volume2 size={14} />Видео синхронизировано без звука. Нажмите, чтобы включить звук.</button>}
    <Controls playing={playing} position={position} duration={duration} volume={volume} muted={muted} canControl={canControl} ready={ready} onToggle={toggle} onSeek={seek} onVolume={changeVolume} onMute={toggleMute} onFullscreen={onFullscreen} fullscreen={fullscreen} />
  </>;
}

function RutubeVideo({ session, canControl, onControl, onFullscreen, fullscreen, onTitle, onEnded }: { session: VideoRoomState; canControl: boolean; onControl: Props["onControl"]; onFullscreen: () => void; fullscreen: boolean; onTitle: (title: string) => void; onEnded: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(session.playing);
  const [position, setPosition] = useState(projectedPosition(session));
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const src = useMemo(() => rutubeEmbed(session.videoUrl ?? ""), [session.videoUrl]);

  function command(type: string, data: Record<string, unknown> = {}) {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type, data }), "https://rutube.ru");
  }

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      let message: { type?: string; data?: Record<string, unknown> };
      try { message = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
      const data = message?.data ?? {};
      if (message.type === "player:ready") {
        setReady(true);
        command("player:hideControls");
        command("player:setVolume", { volume });
        command("player:setCurrentTime", { time: projectedPosition(session) });
        command(session.playing ? "player:play" : "player:pause");
      } else if (message.type === "player:currentTime" && typeof data.time === "number") {
        setPosition(data.time);
      } else if ((message.type === "player:durationChange" || message.type === "player:playOptionsLoaded" || message.type === "player:playOptionLoaded") && typeof data.duration === "number") {
        setDuration(data.duration);
        if (typeof data.title === "string" && data.title.trim()) onTitle(data.title.trim());
      } else if ((message.type === "player:playOptionsLoaded" || message.type === "player:playOptionLoaded") && typeof data.title === "string" && data.title.trim()) {
        onTitle(data.title.trim());
      } else if (message.type === "player:changeState" && typeof data.state === "string") {
        setPlaying(data.state === "playing");
        if (data.state === "ended" && canControl) onEnded();
      } else if (message.type === "player:volumeChange") {
        if (typeof data.volume === "number") setVolume(data.volume);
        if (typeof data.muted === "boolean") setMuted(data.muted);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [session.videoUrl]);

  useEffect(() => {
    if (!ready) return;
    const target = projectedPosition(session);
    if (Math.abs(position - target) > 1.5) command("player:setCurrentTime", { time: target });
    command(session.playing ? "player:play" : "player:pause");
    setPlaying(session.playing);
    setPosition(target);
  }, [ready, session.playing, session.position, session.updatedAt]);

  function seek(next: number) {
    if (!canControl) return;
    command("player:setCurrentTime", { time: next });
    setPosition(next);
    onControl("seek", next);
  }

  function toggle() {
    if (!canControl) return;
    command(playing ? "player:pause" : "player:play");
    onControl(playing ? "pause" : "play", position);
  }

  function changeVolume(next: number) {
    command("player:unMute");
    command("player:setVolume", { volume: next });
    setMuted(false);
    setVolume(next);
  }

  function toggleMute() {
    command(muted ? "player:unMute" : "player:mute");
    setMuted(!muted);
  }

  return <><div className="video-room-media rutube"><iframe ref={iframeRef} src={src} title="Видео Rutube" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen onLoad={() => command("player:hideControls")} /></div><Controls playing={playing} position={position} duration={duration} volume={volume} muted={muted} canControl={canControl} ready={ready} onToggle={toggle} onSeek={seek} onVolume={changeVolume} onMute={toggleMute} onFullscreen={onFullscreen} fullscreen={fullscreen} /></>;
}

function VkVideo({ session, canControl, onControl, onFullscreen, fullscreen, onTitle, onEnded }: { session: VideoRoomState; canControl: boolean; onControl: Props["onControl"]; onFullscreen: () => void; fullscreen: boolean; onTitle: (title: string) => void; onEnded: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<VkPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(session.playing);
  const [position, setPosition] = useState(projectedPosition(session));
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const src = useMemo(() => vkEmbed(session.videoUrl ?? ""), [session.videoUrl]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let cancelled = false;
    let player: VkPlayer | null = null;
    const init = () => {
      void loadVkApi().then((api) => {
        if (cancelled || !iframeRef.current) return;
        player = api.VideoPlayer(iframeRef.current);
        playerRef.current = player;
        const sync = (state: VkState) => {
          if (typeof state.title === "string" && state.title.trim()) onTitle(state.title.trim());
          if (typeof state.time === "number") setPosition(state.time);
          if (typeof state.duration === "number") setDuration(state.duration);
          if (typeof state.volume === "number") setVolume(state.volume);
          if (typeof state.muted === "boolean") setMuted(state.muted);
          if (state.state) setPlaying(state.state === "playing");
        };
        ["inited", "timeupdate", "volumechange", "started", "resumed", "paused"].forEach((event) => player?.on(event, sync));
        player?.on("ended", (state) => { sync(state); setPlaying(false); if (canControl) onEnded(); });
        window.setTimeout(() => {
          if (!player || cancelled) return;
          const target = projectedPosition(session);
          player.seek(target);
          player.setVolume(0.8);
          if (session.playing) player.play(); else player.pause();
          setReady(true);
          setPosition(target);
          setDuration(player.getDuration() || 0);
        }, 0);
      }).catch(() => setReady(false));
    };
    if (iframe.dataset.loaded === "1") init();
    else iframe.addEventListener("load", init, { once: true });
    return () => {
      cancelled = true;
      iframe.removeEventListener("load", init);
      player?.destroy();
      playerRef.current = null;
      setReady(false);
    };
  }, [src]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;
    const target = projectedPosition(session);
    const current = player.getCurrentTime() || 0;
    if (Math.abs(current - target) > 1.5) player.seek(target);
    if (session.playing) player.play(); else player.pause();
    setPlaying(session.playing);
    setPosition(target);
  }, [ready, session.playing, session.position, session.updatedAt]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setPosition(player.getCurrentTime() || 0);
      setDuration(player.getDuration() || 0);
    }, 500);
    return () => window.clearInterval(timer);
  }, [ready]);

  function seek(next: number) {
    if (!canControl || !playerRef.current) return;
    playerRef.current.seek(next);
    setPosition(next);
    onControl("seek", next);
  }

  function toggle() {
    const player = playerRef.current;
    if (!canControl || !player) return;
    const current = player.getCurrentTime() || position;
    if (playing) player.pause(); else player.play();
    onControl(playing ? "pause" : "play", current);
  }

  function changeVolume(next: number) {
    const player = playerRef.current;
    if (!player) return;
    player.unmute();
    player.setVolume(next);
    setMuted(false);
    setVolume(next);
  }

  function toggleMute() {
    const player = playerRef.current;
    if (!player) return;
    if (muted) player.unmute(); else player.mute();
    setMuted(!muted);
  }

  return <><div className="video-room-media vk"><iframe ref={iframeRef} src={src} title="Видео VK" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen onLoad={(event) => { event.currentTarget.dataset.loaded = "1"; }} /></div><Controls playing={playing} position={position} duration={duration} volume={volume} muted={muted} canControl={canControl} ready={ready} onToggle={toggle} onSeek={seek} onVolume={changeVolume} onMute={toggleMute} onFullscreen={onFullscreen} fullscreen={fullscreen} /></>;
}

function CompactVideoChat({ messages, collapsed, onToggle, onSendMessage }: { messages: Message[]; collapsed: boolean; onToggle: () => void; onSendMessage: Props["onSendMessage"] }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const visible = messages.filter((message) => !message.system && !message.quizKind).slice(-40);

  useEffect(() => {
    if (collapsed) return;
    requestAnimationFrame(() => {
      const element = listRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }, [collapsed, visible.length, visible.at(-1)?.id]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      await onSendMessage(body);
      setDraft("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Сообщение не отправлено.");
    } finally {
      setSending(false);
    }
  }

  return <aside className={"video-room-chat" + (collapsed ? " collapsed" : "")}>
    <div className="video-room-chat-head">
      {!collapsed && <strong>Чат</strong>}
      <button type="button" onClick={onToggle} aria-label={collapsed ? "Развернуть чат" : "Свернуть чат"} title={collapsed ? "Развернуть чат" : "Свернуть чат"}>{collapsed ? "›" : "‹"}</button>
    </div>
    {!collapsed && <>
      <div className="video-room-chat-list" ref={listRef}>
        {visible.length === 0 ? <span className="video-room-chat-empty">Сообщений пока нет</span> : visible.map((message) => <div className={"video-room-chat-message" + (message.mine ? " mine" : "")} key={message.id}>
          <strong>{message.author}</strong>
          <span>{message.body || (message.gifUrl ? "GIF" : message.attachments?.length ? "Вложение" : "")}</span>
        </div>)}
      </div>
      <form className="video-room-chat-composer" onSubmit={submit}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Сообщение..." aria-label="Сообщение в чат" />
        <button type="submit" disabled={!draft.trim() || sending} aria-label="Отправить сообщение" title="Отправить">{sending ? "…" : "↑"}</button>
      </form>
      {error && <small className="video-room-chat-error">{error}</small>}
    </>}
  </aside>;
}

function providerLabel(provider: VideoRoomState["provider"]) {
  return provider === "youtube" ? "YouTube" : provider === "rutube" ? "Rutube" : provider === "vk" ? "VK Видео" : "Видео";
}

function VideoQueue({ session, currentUserId, isStaff, onRemove }: { session?: VideoRoomState; currentUserId?: string; isStaff: boolean; onRemove: Props["onRemoveItem"] }) {
  const [open, setOpen] = useState(false);
  const queue = session?.queue ?? [];
  useEffect(() => {
    setOpen(!window.matchMedia("(max-width: 700px)").matches);
  }, []);
  return <section className={"video-room-queue" + (open ? " open" : "")}>
    <button type="button" className="video-room-queue-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span><ListVideo size={15} /><strong>Очередь</strong><b>{queue.length}</b></span>
      <small>{open ? "Скрыть" : "Показать"}</small>
    </button>
    {open && <div className="video-room-queue-list">
      {queue.length === 0 ? <p>Очередь пока пуста.</p> : queue.map((item, index) => {
        const current = item.id === session?.currentItemId;
        const canRemove = item.ownerId === currentUserId || isStaff;
        return <article className={current ? "current" : ""} key={item.id}>
          <span className="video-room-queue-index">{index + 1}</span>
          <span className="video-room-queue-copy">
            <strong title={item.title || providerLabel(item.provider)}>{item.title || providerLabel(item.provider)}</strong>
            <small>{item.ownerName}{current ? " · Сейчас" : ""}</small>
          </span>
          {canRemove && <button type="button" className="video-room-queue-remove" aria-label={"Удалить из очереди: " + (item.title || providerLabel(item.provider))} title={current ? "Удалить текущее видео" : "Удалить из очереди"} onClick={() => onRemove(item.id)}><Trash2 size={14} /></button>}
        </article>;
      })}
    </div>}
  </section>;
}

export function VideoRoomPlayer({ session, currentUserId, currentUserRole, messages, openSourceRequest = 0, onSetSource, onControl, onRemoveItem, onEnded, onTitle, onSendMessage }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const collapsedStorageKey = useMemo(
    () => "tusova:video-player-collapsed:" + (currentUserId ?? "guest"),
    [currentUserId],
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [videoTitle, setVideoTitle] = useState("Видео");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceValue, setSourceValue] = useState("");
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [customSize, setCustomSize] = useState<{ width: number; height: number } | null>(null);
  const sourceInputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const resizeStateRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const lastReportedTitleRef = useRef("");
  const endedItemRef = useRef<string | null>(null);
  const isStaff = currentUserRole === "admin" || currentUserRole === "moderator";
  const canControl = Boolean(session?.videoUrl && (session.controllerId === currentUserId || isStaff));
  const currentQueueItem = session?.queue.find((item) => item.id === session.currentItemId);

  useEffect(() => {
    setVideoTitle(currentQueueItem?.title || providerLabel(session?.provider ?? null));
    lastReportedTitleRef.current = "";
    endedItemRef.current = null;
  }, [session?.currentItemId, session?.provider, currentQueueItem?.title]);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(collapsedStorageKey) === "true");
    } catch {
      setCollapsed(false);
    }
  }, [collapsedStorageKey]);

  function setPlayerCollapsed(next: boolean | ((current: boolean) => boolean)) {
    setCollapsed((current) => {
      const value = typeof next === "function" ? next(current) : next;
      try {
        window.localStorage.setItem(collapsedStorageKey, String(value));
      } catch {}
      return value;
    });
  }


  async function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement === root) {
      await document.exitFullscreen?.();
      return;
    }
    await root.requestFullscreen?.();
  }

  function startResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (fullscreen || collapsed || window.innerWidth <= 700 || !rootRef.current) return;
    event.preventDefault();
    const rect = rootRef.current.getBoundingClientRect();
    resizeStateRef.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resize(event: React.PointerEvent<HTMLButtonElement>) {
    const start = resizeStateRef.current;
    if (!start || fullscreen) return;
    const minWidth = Math.min(380, Math.max(280, window.innerWidth - 24));
    const maxWidth = Math.max(minWidth, window.innerWidth - 24);
    const minHeight = Math.min(280, Math.max(220, window.innerHeight - 96));
    const maxHeight = Math.max(minHeight, window.innerHeight - 96);
    const width = Math.min(maxWidth, Math.max(minWidth, start.width + (start.x - event.clientX)));
    const height = Math.min(maxHeight, Math.max(minHeight, start.height + (start.y - event.clientY)));
    setCustomSize({ width: Math.round(width), height: Math.round(height) });
  }

  function stopResize(event: React.PointerEvent<HTMLButtonElement>) {
    resizeStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function openSource() {
    setPlayerCollapsed(false);
    setSourceValue("");
    setSourceError("");
    setSourceOpen(true);
  }

  function closeSource() {
    if (sourceBusy) return;
    setSourceOpen(false);
    setSourceError("");
  }

  async function submitSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = sourceValue.trim();
    if (!value || sourceBusy) return;
    setSourceBusy(true);
    setSourceError("");
    try {
      await onSetSource(value);
      setSourceOpen(false);
      setSourceValue("");
    } catch (cause) {
      setSourceError(cause instanceof Error ? cause.message : "Не удалось добавить видео в очередь.");
    } finally {
      setSourceBusy(false);
    }
  }

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  useEffect(() => {
    const keepInsideViewport = () => {
      if (window.innerWidth <= 700) {
        setCustomSize(null);
        resizeStateRef.current = null;
      }
    };
    keepInsideViewport();
    window.addEventListener("resize", keepInsideViewport);
    return () => window.removeEventListener("resize", keepInsideViewport);
  }, []);


  useEffect(() => {
    if (openSourceRequest <= 0) return;
    openSource();
  }, [openSourceRequest]);

  useEffect(() => {
    if (!sourceOpen) return;
    requestAnimationFrame(() => sourceInputRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSource();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sourceOpen]);

  const titleChanged = (title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setVideoTitle(clean);
    const itemId = session?.currentItemId;
    if (!itemId || !canControl) return;
    const fingerprint = itemId + ":" + clean;
    if (lastReportedTitleRef.current === fingerprint || currentQueueItem?.title === clean) return;
    lastReportedTitleRef.current = fingerprint;
    onTitle(itemId, clean);
  };

  const finishCurrent = () => {
    const itemId = session?.currentItemId;
    if (!itemId || !canControl || endedItemRef.current === itemId) return;
    endedItemRef.current = itemId;
    onEnded(itemId);
  };

  const provider = !session?.videoUrl ? <p className="video-room-empty">Очередь видео пуста. Добавьте ссылку на YouTube, VK Видео или Rutube.</p>
    : session.provider === "youtube" ? <YouTubeVideo session={session} canControl={canControl} onControl={onControl} onFullscreen={() => void toggleFullscreen()} fullscreen={fullscreen} onTitle={titleChanged} onEnded={finishCurrent} />
    : session.provider === "rutube" ? <RutubeVideo session={session} canControl={canControl} onControl={onControl} onFullscreen={() => void toggleFullscreen()} fullscreen={fullscreen} onTitle={titleChanged} onEnded={finishCurrent} />
    : session.provider === "vk" ? <VkVideo session={session} canControl={canControl} onControl={onControl} onFullscreen={() => void toggleFullscreen()} fullscreen={fullscreen} onTitle={titleChanged} onEnded={finishCurrent} />
    : <p className="video-room-empty">Этот источник пока не поддерживается плеером.</p>;

  const style = customSize && !fullscreen && !collapsed ? { width: customSize.width, height: customSize.height } : undefined;
  const queuePrice = session?.queuePrice ?? 0;

  return <aside className={"video-room-player" + (collapsed ? " collapsed" : "") + (fullscreen && chatCollapsed ? " chat-collapsed" : "") + (customSize && !fullscreen && !collapsed ? " resized" : "")} ref={rootRef} style={style}>
    {!fullscreen && !collapsed && <button className="video-room-resize-handle" type="button" aria-label="Изменить размер плеера" title="Потяните, чтобы изменить размер" onPointerDown={startResize} onPointerMove={resize} onPointerUp={stopResize} onPointerCancel={stopResize} />}
    <header><strong title={videoTitle}>{videoTitle}</strong><span><button type="button" onClick={() => setPlayerCollapsed((value) => !value)}>{collapsed ? "Развернуть" : "Свернуть"}</button><button type="button" onClick={openSource}>В очередь</button></span></header>
    <div className="video-room-body" aria-hidden={collapsed}>
      {fullscreen && <CompactVideoChat messages={messages} collapsed={chatCollapsed} onToggle={() => setChatCollapsed((value) => !value)} onSendMessage={onSendMessage} />}
      <div className="video-room-video-pane">
        {provider}
        <VideoQueue session={session} currentUserId={currentUserId} isStaff={isStaff} onRemove={onRemoveItem} />
      </div>
    </div>
    {sourceOpen && <div className="video-source-backdrop" onMouseDown={closeSource}>
      <form className="video-source-modal" onSubmit={submitSource} onMouseDown={(event) => event.stopPropagation()}>
        <div className="video-source-modal-head"><div><strong>Добавить видео в очередь</strong><small>YouTube, VK Видео или Rutube</small></div><button type="button" className="video-source-close" disabled={sourceBusy} onClick={closeSource} aria-label="Закрыть">×</button></div>
        <input ref={sourceInputRef} type="url" inputMode="url" placeholder="https://..." value={sourceValue} disabled={sourceBusy} onChange={(event) => setSourceValue(event.target.value)} required />
        {sourceError && <div className="video-source-error" role="alert">{sourceError}</div>}
        <div className="video-source-price">{queuePrice > 0 ? <><Coins size={14} /><span>{queuePrice} кредитов за добавление</span></> : <span>Добавление бесплатно</span>}</div>
        <div className="video-source-actions"><button type="button" className="secondary" disabled={sourceBusy} onClick={closeSource}>Отмена</button><button type="submit" disabled={!sourceValue.trim() || sourceBusy}>{sourceBusy ? "Добавляем…" : "Добавить в очередь"}</button></div>
      </form>
    </div>}
  </aside>;
}
