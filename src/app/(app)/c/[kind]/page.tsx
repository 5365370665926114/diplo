import { notFound } from "next/navigation";
import { CatalogView } from "@/components/Catalog";

export default async function Page({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!["movies", "series", "animes", "doramas"].includes(kind)) notFound();
  return <div className="px-4 sm:px-8 lg:px-10 pb-16"><CatalogView kind={kind} /></div>;
}
