export const GENRES: { id: number; slug: string; pt: string; en: string; es: string; syn: string[] }[] = [
  { id: 10749, slug: "romance", pt: "Romance", en: "Romance", es: "Romance", syn: ["romance", "romantic", "romantico", "romântico", "amor", "love", "casal"] },
  { id: 28, slug: "action", pt: "Ação", en: "Action", es: "Acción", syn: ["acao", "ação", "action", "accion", "acción", "luta", "briga", "fight"] },
  { id: 18, slug: "drama", pt: "Drama", en: "Drama", es: "Drama", syn: ["drama", "dramatico", "dramático", "emocionante", "emotional", "emotivo", "chorar", "cry"] },
  { id: 53, slug: "thriller", pt: "Suspense", en: "Thriller", es: "Suspenso", syn: ["suspense", "thriller", "tensao", "tensão", "suspenso"] },
  { id: 27, slug: "horror", pt: "Terror", en: "Horror", es: "Terror", syn: ["terror", "horror", "medo", "assustador", "scary"] },
  { id: 35, slug: "comedy", pt: "Comédia", en: "Comedy", es: "Comedia", syn: ["comedia", "comédia", "comedy", "engracado", "engraçado", "funny", "risada", "gracioso"] },
  { id: 878, slug: "scifi", pt: "Ficção Científica", en: "Sci-Fi", es: "Ciencia ficción", syn: ["ficcao", "ficção", "sci-fi", "scifi", "espaco", "espaço", "space", "futuro", "future", "alien"] },
  { id: 14, slug: "fantasy", pt: "Fantasia", en: "Fantasy", es: "Fantasía", syn: ["fantasia", "fantasy", "magia", "magic", "dragao", "dragão"] },
  { id: 16, slug: "animation", pt: "Animação", en: "Animation", es: "Animación", syn: ["animacao", "animação", "animation", "desenho", "cartoon", "anime"] },
  { id: 12, slug: "adventure", pt: "Aventura", en: "Adventure", es: "Aventura", syn: ["aventura", "adventure"] },
  { id: 80, slug: "crime", pt: "Crime", en: "Crime", es: "Crimen", syn: ["crime", "policial", "mafia", "máfia", "detetive", "detective"] },
  { id: 9648, slug: "mystery", pt: "Mistério", en: "Mystery", es: "Misterio", syn: ["misterio", "mistério", "mystery", "enigma"] },
  { id: 99, slug: "documentary", pt: "Documentário", en: "Documentary", es: "Documental", syn: ["documentario", "documentário", "documentary", "documental"] },
  { id: 10751, slug: "family", pt: "Família", en: "Family", es: "Familia", syn: ["familia", "família", "family", "criancas", "crianças", "kids"] },
  { id: 36, slug: "history", pt: "História", en: "History", es: "Historia", syn: ["historia", "história", "history", "historico", "histórico", "epoca", "época"] },
  { id: 10752, slug: "war", pt: "Guerra", en: "War", es: "Guerra", syn: ["guerra", "war", "militar"] },
  { id: 37, slug: "western", pt: "Faroeste", en: "Western", es: "Western", syn: ["faroeste", "western", "cowboy"] },
];

export function genreName(id: number, lang: string): string {
  const g = GENRES.find((x) => x.id === id);
  const tvMap: Record<number, string> = { 10759: "Ação e Aventura", 10765: "Sci-Fi e Fantasia", 10768: "Guerra e Política", 10762: "Infantil", 10764: "Reality", 10766: "Novela", 10767: "Talk show", 10763: "Notícias" };
  if (!g) return tvMap[id] ?? String(id);
  return lang === "en" ? g.en : lang === "es" ? g.es : g.pt;
}

export const MUSIC_GENRES = ["Pop", "Rock", "Indie", "Rap", "Hip-Hop", "Sertanejo", "MPB", "Funk", "Eletrônica", "Lo-fi", "Clássica", "Jazz", "R&B", "K-pop", "Reggae", "Gospel", "Pagode", "Forró"];

export const MUSIC_MOODS: { id: string; label: string; query: string }[] = [
  { id: "romantic", label: "Músicas românticas", query: "romantic songs" },
  { id: "calm", label: "Músicas calmas", query: "calm relaxing songs" },
  { id: "sad", label: "Músicas tristes", query: "sad songs" },
  { id: "happy", label: "Músicas animadas", query: "upbeat happy songs" },
  { id: "study", label: "Música para estudar", query: "study focus music" },
  { id: "workout", label: "Música para treinar", query: "workout gym music" },
  { id: "discover", label: "Descobrir artistas novos", query: "new artists indie discover" },
  { id: "classics", label: "Clássicos e nostalgia", query: "classic hits nostalgia" },
];
