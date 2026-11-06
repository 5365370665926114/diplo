import { sql } from "drizzle-orm";
import { db } from "@/db";
import { avatarCollections, avatars } from "@/db/schema";
import { ApiError } from "./http";

export function validAvatarUrl(u: unknown): string | null {
  if (typeof u !== "string" || !u) return null;
  if (u.startsWith("data:image/")) {
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u) || u.length > 400_000) throw new ApiError(400, "Imagem inválida (PNG/JPEG/WebP até ~300 KB).");
    return u;
  }
  if (/^https:\/\/[^\s"'<>]+$/.test(u) && u.length < 500) return u;
  throw new ApiError(400, "URL de avatar inválida.");
}

/**
 * Collections are seeded with character NAMES only. No third-party artwork is bundled:
 * admins attach authorized images (URL) in the Control Center; until then each avatar
 * renders as an elegant initials + gradient fallback.
 */
const SEED: { slug: string; name: string; hue: [string, string]; items: string[] }[] = [
  { slug: "marvel", name: "Marvel", hue: ["#E50914", "#3b0206"], items: ["Homem-Aranha", "Homem de Ferro", "Capitão América", "Thor", "Pantera Negra", "Viúva Negra", "Hulk", "Doutor Estranho"] },
  { slug: "dc", name: "DC", hue: ["#1d4ed8", "#0b1020"], items: ["Batman", "Superman", "Mulher-Maravilha", "Flash", "Aquaman", "Coringa", "Arlequina", "Ciborgue"] },
  { slug: "stranger-things", name: "Stranger Things", hue: ["#ff1838", "#1a0004"], items: ["Eleven", "Mike", "Dustin", "Lucas", "Will", "Max", "Steve", "Hopper"] },
  { slug: "walking-dead", name: "The Walking Dead", hue: ["#65a30d", "#0f1a05"], items: ["Rick", "Daryl", "Michonne", "Negan", "Carol", "Glenn", "Maggie"] },
  { slug: "naruto", name: "Naruto", hue: ["#f97316", "#2a1204"], items: ["Naruto", "Sasuke", "Sakura", "Kakashi", "Itachi", "Hinata", "Gaara"] },
  { slug: "one-piece", name: "One Piece", hue: ["#eab308", "#2a2004"], items: ["Luffy", "Zoro", "Nami", "Sanji", "Usopp", "Robin", "Chopper"] },
  { slug: "dragon-ball", name: "Dragon Ball", hue: ["#fb923c", "#2a1204"], items: ["Goku", "Vegeta", "Gohan", "Piccolo", "Bulma", "Trunks", "Freeza"] },
  { slug: "disney", name: "Disney", hue: ["#38bdf8", "#071a2a"], items: ["Mickey", "Elsa", "Simba", "Moana", "Ariel", "Aladdin", "Stitch"] },
  { slug: "pixar", name: "Pixar", hue: ["#a78bfa", "#150a2a"], items: ["Woody", "Buzz", "Wall-E", "Nemo", "Mike Wazowski", "Remy", "Joy"] },
  { slug: "classic", name: "Clássicos DiploCine", hue: ["#E50914", "#050505"], items: ["Cinéfilo", "Diretor", "Roteirista", "Pipoca", "Claquete", "Projetor"] },
];

let done = false;
export async function seedAvatars() {
  if (done) return;
  const res = await db.execute(sql`select count(*)::int as c from avatar_collections`);
  if (Number((res.rows[0] as { c: number }).c) > 0) {
    done = true;
    return;
  }
  for (const [i, c] of SEED.entries()) {
    const [col] = await db.insert(avatarCollections).values({ slug: c.slug, name: c.name, sortOrder: i }).onConflictDoNothing().returning();
    if (!col) continue;
    await db.insert(avatars).values(c.items.map((n, k) => ({ collectionId: col.id, name: n, gradient: `linear-gradient(${135 + k * 25}deg,${c.hue[0]},${c.hue[1]})` })));
  }
  done = true;
}
