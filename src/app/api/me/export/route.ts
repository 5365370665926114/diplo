import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** LGPD data export: everything tied to the account except secrets. */
export const GET = handle(async () => {
  const s = await requireUser();
  const profs = await db.select().from(t.profiles).where(eq(t.profiles.userId, s.user.id));
  const ids = profs.map((p) => p.id);
  const byProfile = async <T extends { profileId: unknown }>(table: unknown) => (ids.length ? await db.select().from(table as typeof t.listItems).where(inArray((table as typeof t.listItems).profileId, ids)) : []);
  const data = {
    exportedAt: new Date().toISOString(),
    account: { id: s.user.id, name: s.user.name, email: s.user.email, createdAt: s.user.createdAt },
    profiles: profs.map((p) => ({ ...p, pinHash: p.pinHash ? "[redacted]" : null })),
    lists: await byProfile(t.listItems),
    watchProgress: await byProfile(t.watchProgress),
    playbackSessions: await db.select().from(t.playbackSessions).where(eq(t.playbackSessions.userId, s.user.id)),
    musicPrefs: await byProfile(t.musicPrefs),
    musicPlaylists: await byProfile(t.musicPlaylists),
    musicLikes: await byProfile(t.musicLikes),
    musicHistory: await byProfile(t.musicHistory),
    donations: await db.select({ id: t.paymentTransactions.id, amountCents: t.paymentTransactions.amountCents, status: t.paymentTransactions.status, createdAt: t.paymentTransactions.createdAt }).from(t.paymentTransactions).where(eq(t.paymentTransactions.userId, s.user.id)),
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="diplocine-meus-dados.json"' },
  });
});
