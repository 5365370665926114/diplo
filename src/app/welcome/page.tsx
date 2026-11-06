import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { getFlags } from "@/lib/server/settings";
import WelcomeFlow from "./WelcomeFlow";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await getSession()) redirect("/profiles");
  const flags = await getFlags().catch(() => ({ registrations: true }) as Record<string, boolean>);
  return <WelcomeFlow registrations={flags.registrations !== false} />;
}
