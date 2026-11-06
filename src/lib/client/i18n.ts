export type Lang = "pt-BR" | "en" | "es";
export const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷" },
  { id: "en", label: "English", flag: "🇺🇸" },
  { id: "es", label: "Español", flag: "🇪🇸" },
];

// Add a language by adding one object here (missing keys fall back to pt-BR).
const D: Record<string, Record<Lang, string>> = {
  home: { "pt-BR": "Início", en: "Home", es: "Inicio" },
  movies: { "pt-BR": "Filmes", en: "Movies", es: "Películas" },
  series: { "pt-BR": "Séries", en: "TV Shows", es: "Series" },
  animes: { "pt-BR": "Animes", en: "Anime", es: "Anime" },
  doramas: { "pt-BR": "Doramas", en: "K-Dramas", es: "Doramas" },
  explore: { "pt-BR": "Explorar", en: "Explore", es: "Explorar" },
  search: { "pt-BR": "Buscar", en: "Search", es: "Buscar" },
  ai: { "pt-BR": "AI Search", en: "AI Search", es: "AI Search" },
  music: { "pt-BR": "DiploMusic", en: "DiploMusic", es: "DiploMusic" },
  library: { "pt-BR": "Biblioteca", en: "Library", es: "Biblioteca" },
  rankings: { "pt-BR": "Rankings", en: "Rankings", es: "Rankings" },
  donate: { "pt-BR": "Doações", en: "Donate", es: "Donaciones" },
  settings: { "pt-BR": "Configurações", en: "Settings", es: "Ajustes" },
  profile: { "pt-BR": "Perfil", en: "Profile", es: "Perfil" },
  admin: { "pt-BR": "Control Center", en: "Control Center", es: "Control Center" },
  more: { "pt-BR": "Mais", en: "More", es: "Más" },
  play: { "pt-BR": "Assistir", en: "Watch", es: "Ver" },
  moreInfo: { "pt-BR": "Mais info", en: "More info", es: "Más info" },
  watching: { "pt-BR": "Quem está assistindo?", en: "Who's watching?", es: "¿Quién está viendo?" },
  switchProfile: { "pt-BR": "Trocar perfil", en: "Switch profile", es: "Cambiar perfil" },
  logout: { "pt-BR": "Sair", en: "Log out", es: "Salir" },
  welcome: { "pt-BR": "Bem-vindo a uma nova dimensão do entretenimento.", en: "Welcome to a new dimension of entertainment.", es: "Bienvenido a una nueva dimensión del entretenimiento." },
  start: { "pt-BR": "Começar experiência", en: "Start experience", es: "Comenzar experiencia" },
  chooseLang: { "pt-BR": "Qual idioma você prefere?", en: "Which language do you prefer?", es: "¿Qué idioma prefieres?" },
  next: { "pt-BR": "Próximo", en: "Next", es: "Siguiente" },
  back: { "pt-BR": "Anterior", en: "Back", es: "Anterior" },
  skip: { "pt-BR": "Pular", en: "Skip", es: "Omitir" },
  search_ph: { "pt-BR": "Buscar filmes, séries, animes…", en: "Search movies, shows, anime…", es: "Buscar películas, series…" },
};
export function tr(lang: Lang, key: string): string {
  return D[key]?.[lang] ?? D[key]?.["pt-BR"] ?? key;
}
