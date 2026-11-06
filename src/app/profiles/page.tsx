import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import ProfilesClient from "./ProfilesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await getSession())) redirect("/welcome");
  return <ProfilesClient />;
}
