import type { KnowledgeSearchHit, KnowledgeSourceType } from "@/types/knowledgeCuration";

function rid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readYoutubeKey(): string {
  return String(import.meta.env.VITE_YOUTUBE_API_KEY ?? "").trim();
}

function readGnewsKey(): string {
  return String(import.meta.env.VITE_GNEWS_API_KEY ?? "").trim();
}

async function searchYoutube(q: string): Promise<KnowledgeSearchHit[]> {
  const key = readYoutubeKey();
  if (!key) return [];
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("q", q);
  url.searchParams.set("key", key);
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = (await res.json()) as {
    items?: { id?: { videoId?: string }; snippet?: { title?: string; description?: string; channelTitle?: string } }[];
  };
  const out: KnowledgeSearchHit[] = [];
  for (const it of data.items ?? []) {
    const vid = it.id?.videoId;
    if (!vid) continue;
    const sn = it.snippet;
    out.push({
      tempId: rid(),
      type: "youtube",
      title: (sn?.title ?? "YouTube").slice(0, 300),
      url: `https://www.youtube.com/watch?v=${vid}`,
      snippet: sn?.description?.slice(0, 400),
      sourceLabel: sn?.channelTitle ?? "YouTube",
    });
  }
  return out;
}

async function searchCrossref(q: string): Promise<KnowledgeSearchHit[]> {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query", q);
  url.searchParams.set("rows", "10");
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    message?: {
      items?: {
        URL?: string[];
        title?: string[];
        "container-title"?: string[];
        abstract?: string;
      }[];
    };
  };
  const items = data.message?.items ?? [];
  const out: KnowledgeSearchHit[] = [];
  for (const it of items) {
    const link = Array.isArray(it.URL) && it.URL[0] ? it.URL[0] : "";
    const titleArr = it.title;
    const title = Array.isArray(titleArr) && titleArr[0] ? String(titleArr[0]) : "논문";
    if (!link) continue;
    const journal = Array.isArray(it["container-title"]) ? it["container-title"][0] : undefined;
    const abs =
      typeof it.abstract === "string"
        ? it.abstract.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400)
        : undefined;
    out.push({
      tempId: rid(),
      type: "paper",
      title: title.slice(0, 400),
      url: link,
      snippet: abs,
      sourceLabel: journal ?? "Crossref",
    });
  }
  return out;
}

async function searchGnews(q: string): Promise<KnowledgeSearchHit[]> {
  const token = readGnewsKey();
  if (!token) return [];
  const url = new URL("https://gnews.io/api/v4/search");
  url.searchParams.set("q", q);
  url.searchParams.set("lang", "ko");
  url.searchParams.set("max", "10");
  url.searchParams.set("token", token);
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = (await res.json()) as {
    articles?: { title?: string; url?: string; description?: string; source?: { name?: string } }[];
  };
  const out: KnowledgeSearchHit[] = [];
  for (const a of data.articles ?? []) {
    if (!a.url) continue;
    out.push({
      tempId: rid(),
      type: "news",
      title: (a.title ?? "기사").slice(0, 400),
      url: a.url,
      snippet: a.description?.slice(0, 400),
      sourceLabel: a.source?.name ?? "GNews",
    });
  }
  return out;
}

export type SearchKnowledgeOptions = {
  query: string;
  types: KnowledgeSourceType[];
};

/**
 * 유튜브(VITE_YOUTUBE_API_KEY), 논문(Crossref, 키 불필요), 뉴스(VITE_GNEWS_API_KEY) 병합 검색.
 * 키가 없는 소스는 결과에서 생략됩니다.
 */
export async function searchKnowledgeSources(opts: SearchKnowledgeOptions): Promise<KnowledgeSearchHit[]> {
  const q = opts.query.trim();
  if (!q) return [];
  const types = new Set(opts.types);
  const tasks: Promise<KnowledgeSearchHit[]>[] = [];
  if (types.has("youtube")) tasks.push(searchYoutube(q));
  if (types.has("paper")) tasks.push(searchCrossref(q));
  if (types.has("news")) tasks.push(searchGnews(q));
  const chunks = await Promise.all(tasks);
  return chunks.flat();
}
