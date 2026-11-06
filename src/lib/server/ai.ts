import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiCache, providerLogs } from "@/db/schema";
import { GENRES, MUSIC_MOODS, MUSIC_GENRES } from "@/lib/genres";
import { fetchJson, rateLimit } from "./http";
import { getSetting } from "./settings";
import { card, tmdb, LANG_MAP, type Card } from "./tmdb";
import { searchTracks, type Track } from "./youtube";

export type Intent = {
  domain: "video" | "music" | "both";
  media: "movie" | "tv" | "any";
  kind?: "anime" | "dorama" | null;
  genres: number[];
  keywords: string[]; // english TMDB keywords
  moods: string[]; // music mood ids
  musicGenres: string[];
  artists: string[];
  titleQuery: string | null;
  summary: string;
  usedLLM: boolean;
};

const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Rule-based interpreter — used when no generative provider is configured or it fails. */
export function ruleIntent(q: string): Intent {
  const n = strip(q);
  const genres = GENRES.filter((g) => g.syn.some((s) => n.includes(strip(s)))).map((g) => g.id);
  const moods = MUSIC_MOODS.filter((m) => {
    const map: Record<string, string[]> = {
      romantic: ["romantic", "romantica", "romantico"],
      calm: ["calma", "calmo", "relax", "calm", "tranquil"],
      sad: ["triste", "sad", "triste"],
      happy: ["animada", "animado", "alegre", "upbeat", "feliz", "happy"],
      study: ["estudar", "study", "foco", "focus", "estudiar"],
      workout: ["treinar", "treino", "workout", "gym", "academia"],
      discover: ["novos artistas", "descobrir", "new artists"],
      classics: ["classico", "nostalg", "classic"],
    };
    return (map[m.id] || []).some((w) => n.includes(w));
  }).map((m) => m.id);
  const kw: string[] = [];
  const kwMap: [string[], string][] = [
    [["escola", "school", "colegio", "adolescente", "teen", "ensino medio"], "high school"],
    [["vinganca", "revenge"], "revenge"],
    [["final inesquecivel", "plot twist", "reviravolta"], "twist ending"],
    [["zumbi", "zombie"], "zombie"],
    [["viagem no tempo", "time travel"], "time travel"],
    [["super heroi", "superhero", "super-heroi"], "superhero"],
    [["amizade", "friendship"], "friendship"],
    [["sobrevivencia", "survival"], "survival"],
    [["espionagem", "spy"], "spy"],
  ];
  for (const [keys, k] of kwMap) if (keys.some((x) => n.includes(strip(x)))) kw.push(k);
  const wantsMusic = /\b(musica|musicas|song|songs|playlist|cancao|artista|album|banda)\b/.test(n) || moods.length > 0;
  const wantsVideo = /\b(filme|filmes|serie|series|movie|movies|show|anime|animes|dorama|doramas|pelicula|novela)\b/.test(n);
  const media: Intent["media"] = /\b(serie|series|show|anime|animes|dorama|doramas)\b/.test(n) ? "tv" : /\b(filme|filmes|movie|movies|pelicula)\b/.test(n) ? "movie" : "any";
  const musicGenres = MUSIC_GENRES.filter((g) => n.includes(strip(g)));
  return {
    domain: wantsMusic && !wantsVideo ? "music" : wantsMusic && wantsVideo ? "both" : "video",
    media,
    kind: /\banimes?\b/.test(n) ? "anime" : /\bdoramas?\b/.test(n) ? "dorama" : null,
    genres: genres.slice(0, 4),
    keywords: kw,
    moods,
    musicGenres,
    artists: [],
    titleQuery: genres.length || kw.length || moods.length ? null : q.slice(0, 80),
    summary: "",
    usedLLM: false,
  };
}

async function llmIntent(q: string, history: string[]): Promise<Intent | null> {
  const url = await getSetting("AI_PROVIDER_URL");
  const key = await getSetting("AI_API_KEY");
  if (!url || !key) return null;
  const model = (await getSetting("AI_MODEL")) || "gpt-4o-mini";
  const extra = (await getSetting("AI_SYSTEM_PROMPT")) || "";
  const system = `Você interpreta pedidos de entretenimento. Responda SOMENTE JSON com as chaves:
domain ("video"|"music"|"both"), media ("movie"|"tv"|"any"), kind ("anime"|"dorama"|null),
genres (array de IDs de gênero TMDB de filmes: ${GENRES.map((g) => `${g.id}=${g.en}`).join(", ")}),
keywords (até 3 palavras-chave em inglês para a busca de keywords do TMDB, ex: "high school"),
moods (ids dentre: ${MUSIC_MOODS.map((m) => m.id).join(", ")}), musicGenres (dentre: ${MUSIC_GENRES.join(", ")}),
artists (artistas citados pelo usuário, nunca invente), titleQuery (título citado pelo usuário ou null),
summary (1 frase em português descrevendo a intenção). NÃO sugira títulos específicos. ${extra}`;
  const msgs = [{ role: "system", content: system }, ...history.slice(-4).map((h) => ({ role: "user", content: h })), { role: "user", content: q }];
  const r = await fetchJson<{ choices?: { message?: { content?: string } }[] }>(
    `${url.replace(/\/$/, "")}/chat/completions`,
    { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages: msgs, temperature: 0.2, response_format: { type: "json_object" } }) },
    12000,
  ).catch(() => null);
  const ok = !!(r && r.status === 200);
  db.insert(providerLogs).values({ providerId: "ai", ok, state: ok ? "available" : "unknown", latencyMs: r?.ms ?? null, message: ok ? "intent" : `HTTP ${r?.status ?? "erro"}` }).catch(() => {});
  const content = r?.data?.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    const j = JSON.parse(content) as Partial<Intent>;
    const valid = new Set(GENRES.map((g) => g.id));
    return {
      domain: j.domain === "music" || j.domain === "both" ? j.domain : "video",
      media: j.media === "movie" || j.media === "tv" ? j.media : "any",
      kind: j.kind === "anime" || j.kind === "dorama" ? j.kind : null,
      genres: (j.genres || []).filter((g) => valid.has(Number(g))).map(Number).slice(0, 4),
      keywords: (j.keywords || []).filter((k) => typeof k === "string").slice(0, 3),
      moods: (j.moods || []).filter((m) => MUSIC_MOODS.some((x) => x.id === m)),
      musicGenres: (j.musicGenres || []).filter((g) => MUSIC_GENRES.includes(g)),
      artists: (j.artists || []).filter((a) => typeof a === "string").slice(0, 3),
      titleQuery: typeof j.titleQuery === "string" ? j.titleQuery : null,
      summary: typeof j.summary === "string" ? j.summary.slice(0, 200) : "",
      usedLLM: true,
    };
  } catch {
    return null;
  }
}

const TV_GENRE: Record<number, number> = { 28: 10759, 12: 10759, 878: 10765, 14: 10765, 10752: 10768 };
const toTv = (ids: number[]) => [...new Set(ids.map((g) => TV_GENRE[g] ?? g))];

type Hit = Card & { reason: string; score: number };

async function searchVideo(intent: Intent, lang: string, raw: string, tasteGenres: number[]): Promise<Hit[]> {
  const language = LANG_MAP[lang] || "pt-BR";
  const hits = new Map<string, Hit>();
  const add = (c: Card, base: number, reason: string) => {
    const k = `${c.type}:${c.id}`;
    const matched = intent.genres.filter((g) => c.genres.includes(g) || c.genres.includes(TV_GENRE[g]));
    const taste = tasteGenres.filter((g) => c.genres.includes(g)).length;
    const score = base + matched.length * 3 + c.rating / 4 + taste * 0.8;
    const why = [reason, matched.length ? `gêneros em comum: ${matched.map((g) => GENRES.find((x) => x.id === g)?.pt).join(", ")}` : "", c.rating ? `nota ${c.rating}` : "", taste ? "combina com seu perfil" : ""].filter(Boolean).join(" · ");
    const prev = hits.get(k);
    if (!prev || prev.score < score) hits.set(k, { ...c, reason: why, score });
  };

  if (intent.titleQuery) {
    const r = await tmdb<{ results: never[] }>("/search/multi", { query: intent.titleQuery, language, include_adult: "false" }, 300).catch(() => ({ results: [] }));
    for (const i of r.results as { media_type: string }[]) if (i.media_type === "movie" || i.media_type === "tv") add(card(i as never), 6, "corresponde ao título buscado");
  }

  const kwIds: number[] = [];
  for (const k of intent.keywords.slice(0, 3)) {
    const r = await tmdb<{ results: { id: number }[] }>("/search/keyword", { query: k }, 3600).catch(() => ({ results: [] }));
    if (r.results[0]) kwIds.push(r.results[0].id);
  }

  const types: ("movie" | "tv")[] = intent.kind ? ["tv"] : intent.media === "any" ? ["movie", "tv"] : [intent.media];
  if (intent.genres.length || kwIds.length || intent.kind) {
    await Promise.all(
      types.flatMap((type) => {
        const g = type === "tv" ? toTv(intent.genres) : intent.genres;
        const base: Record<string, string | number> = { language, sort_by: "popularity.desc", "vote_count.gte": 150, include_adult: "false" };
        if (intent.kind === "anime") Object.assign(base, { with_genres: "16", with_original_language: "ja" });
        else if (intent.kind === "dorama") Object.assign(base, { with_original_language: "ko" });
        const runs: Record<string, string | number>[] = [];
        // AND of genres first (more precise), then OR + keywords for recall
        if (g.length && !intent.kind) runs.push({ ...base, with_genres: g.join(",") });
        if (kwIds.length) runs.push({ ...base, with_keywords: kwIds.join("|"), ...(g.length && !intent.kind ? { with_genres: g.slice(0, 1).join(",") } : {}) });
        if (!runs.length) runs.push(base);
        return runs.map(async (params, idx) => {
          const r = await tmdb<{ results: never[] }>(`/discover/${type}`, params, 900).catch(() => ({ results: [] }));
          for (const i of r.results) add(card(i, type), idx === 0 ? 4 : 3, kwIds.length && idx > 0 ? `tema: ${intent.keywords.join(", ")}` : "combina com seu pedido");
        });
      }),
    );
  }
  if (!hits.size && raw) {
    const r = await tmdb<{ results: never[] }>("/search/multi", { query: raw.slice(0, 80), language }, 300).catch(() => ({ results: [] }));
    for (const i of r.results as { media_type: string }[]) if (i.media_type === "movie" || i.media_type === "tv") add(card(i as never), 1, "busca textual");
  }
  return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, 24);
}

async function searchMusic(intent: Intent): Promise<Track[]> {
  const parts: string[] = [];
  for (const a of intent.artists) parts.push(a);
  for (const m of intent.moods) parts.push(MUSIC_MOODS.find((x) => x.id === m)?.query || "");
  parts.push(...intent.musicGenres);
  const q = parts.filter(Boolean).slice(0, 4).join(" ") || intent.titleQuery || "top songs";
  return (await searchTracks(q)).tracks;
}

export async function aiSearch(opts: { q: string; profileId: string; lang: string; history: string[]; tasteGenres: number[] }) {
  const q = opts.q.slice(0, 300);
  const limit = Number((await getSetting("AI_DAILY_LIMIT")) || 40);
  await rateLimit(`ai:${opts.profileId}`, limit, 86400);
  const cacheKey = crypto.createHash("sha1").update(JSON.stringify([q, opts.history.slice(-2), opts.lang, opts.tasteGenres])).digest("hex");
  const [cached] = await db.select().from(aiCache).where(eq(aiCache.key, cacheKey)).limit(1);
  if (cached && Date.now() - cached.createdAt.getTime() < 3600_000) return { ...(cached.value as object), cached: true };

  const intent = (await llmIntent(q, opts.history)) ?? ruleIntent(q);
  let videos: Hit[] = [];
  let music: Track[] = [];
  const notes: string[] = [];
  if (intent.domain !== "music") videos = await searchVideo(intent, opts.lang, q, opts.tasteGenres);
  if (intent.domain !== "video") {
    try {
      music = await searchMusic(intent);
    } catch (e) {
      notes.push(e instanceof Error ? e.message : "Música indisponível.");
    }
  }
  const summary =
    intent.summary ||
    [intent.genres.length ? `Gêneros: ${intent.genres.map((g) => GENRES.find((x) => x.id === g)?.pt).join(", ")}` : "", intent.keywords.length ? `Temas: ${intent.keywords.join(", ")}` : "", intent.moods.length ? `Clima musical: ${intent.moods.map((m) => MUSIC_MOODS.find((x) => x.id === m)?.label).join(", ")}` : ""].filter(Boolean).join(" · ") ||
    "Busca textual";
  const suggestions = [
    ...(intent.genres.length ? ["Mais curtos", "Só séries", "Só filmes"] : []),
    "Com final surpreendente",
    "Mais recentes",
  ].slice(0, 4);
  const out = { intent: { ...intent }, summary, mode: intent.usedLLM ? "ia" : "regras", videos, music, notes, suggestions };
  await db.insert(aiCache).values({ key: cacheKey, value: out as never }).onConflictDoUpdate({ target: aiCache.key, set: { value: out as never, createdAt: new Date() } });
  return out;
}
