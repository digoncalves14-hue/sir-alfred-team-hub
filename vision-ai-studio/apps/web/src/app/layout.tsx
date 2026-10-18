import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VISION AI STUDIO", template: "%s · VISION AI STUDIO" },
  description: "Edição e criação de vídeos com inteligência artificial.",
};

export const viewport: Viewport = { themeColor: "#0B0B0C", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
