export type ChatGif = { id: string; title: string; previewUrl: string; url: string };
type GiphyItem = { id: string; title?: string; images?: { fixed_width_small?: { url?: string }; original?: { url?: string } } };

const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY;

export async function searchGifs(query: string): Promise<ChatGif[]> {
  if (!apiKey) throw new Error("GIF-поиск ещё не настроен");
  const endpoint = query.trim() ? "search" : "trending";
  const params = new URLSearchParams({ api_key: apiKey, limit: "24", rating: "g", lang: "ru" });
  if (query.trim()) params.set("q", query.trim().slice(0, 50));
  const response = await fetch("https://api.giphy.com/v1/gifs/" + endpoint + "?" + params);
  if (!response.ok) throw new Error("Не удалось загрузить GIF");
  const payload = await response.json() as { data?: GiphyItem[] };
  return (payload.data ?? []).flatMap((item) => {
    const previewUrl = item.images?.fixed_width_small?.url;
    const url = item.images?.original?.url;
    return previewUrl && url ? [{ id: item.id, title: item.title ?? "GIF", previewUrl, url }] : [];
  });
}
