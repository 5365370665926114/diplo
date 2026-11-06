import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";
import { getSession } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/welcome");
  if (!s.activeProfileId) redirect("/profiles");
  return (
    <AppProvider>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
