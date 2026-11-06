import { requireProfile } from "@/lib/server/auth";
import { aiSearch } from "@/lib/server/ai";
import { ApiError, body, handle, str } from "@/lib/server/http";
import { getFlags } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const s = await requireProfile();
  if (!(await getFlags()).ai_search) throw new ApiError(403, "AI Search desativada pelo administrador.");
  const b = await body(req);
  const q = str(b.q, 300);
  if (q.length < 3) throw new ApiError(400, "Descreva o que você procura (mín. 3 caracteres).");
  const history = Array.isArray(b.history) ? b.history.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 200)).slice(-4) : [];
  return aiSearch({ q, profileId: s.profile.id, lang: s.user.lang, history, tasteGenres: s.profile.favoriteGenres });
});
