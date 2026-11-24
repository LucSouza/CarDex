import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireUser } from "@/lib/session";
import { logoutAction } from "../login/actions";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/", label: "Resumo" },
  { href: "/buscar", label: "Buscar" },
  { href: "/colecao", label: "Coleção" },
  { href: "/historico", label: "Histórico" },
  { href: "/config", label: "Configurações" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface p-2 text-sm">
        <Link href="/" className="rounded-md px-3 py-1.5 font-bold">
          PokeDex
        </Link>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="hidden rounded-md px-3 py-1.5 hover:bg-surface-2 sm:inline-block">
            {n.label}
          </Link>
        ))}
        <span className="ml-auto px-2 text-ink-2">{user.username}</span>
        <ThemeToggle />
        <form action={logoutAction}>
          <button className="rounded-md px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">Sair</button>
        </form>
      </nav>
      {children}
      {/* navegação inferior no celular (alvos de toque >= 44 px) */}
      <nav aria-label="Navegação" className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="grid min-h-12 place-items-center px-1 text-center text-[11px] font-medium text-ink-2 active:bg-surface-2">
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
