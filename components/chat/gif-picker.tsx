"use client";

import { LoaderCircle, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { searchGifs, type ChatGif } from "@/lib/gif-api";

export function GifPicker({ onSelect }: { onSelect: (gif: ChatGif) => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ChatGif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      void searchGifs(query).then(setItems).catch((cause) => setError(cause instanceof Error ? cause.message : "Не удалось загрузить GIF")).finally(() => setLoading(false));
    }, query ? 280 : 0);
    return () => window.clearTimeout(timer);
  }, [query]);

  return <div className="composer-gif-picker">
    <label className="composer-gif-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти GIF" autoFocus /></label>
    {loading ? <p className="composer-gif-state"><LoaderCircle size={16} />Загрузка GIF…</p> : error ? <p className="composer-gif-state error">{error}</p> : items.length ? <div className="composer-gif-grid">{items.map((gif) => <button type="button" key={gif.id} title={gif.title || "GIF"} aria-label={"Отправить GIF: " + (gif.title || "без названия")} onClick={() => onSelect(gif)}><img src={gif.previewUrl} alt="" loading="lazy" /></button>)}</div> : <p className="composer-gif-state">Ничего не найдено.</p>}
    <small className="composer-gif-attribution">GIF от GIPHY</small>
  </div>;
}
