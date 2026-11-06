import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "DiploCine — The Ultimate Cinematic Universe",
  description: "Filmes, séries, animes, doramas, música e IA em um ecossistema de entretenimento cinematográfico.",
};
export const viewport: Viewport = { themeColor: "#050505", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
