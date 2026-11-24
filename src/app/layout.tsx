import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PokeDex", template: "%s · PokeDex" },
  description: "Coleção de cartas Pokémon TCG com valor estimado em reais.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Define o tema antes da pintura (evita piscar): escolha salva, senão o do sistema. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:pb-6">{children}</main>
      </body>
    </html>
  );
}
