import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await getSession();
  if (!s) redirect("/welcome");
  if (!s.isAdmin) redirect("/");
  return <AdminClient />;
}
