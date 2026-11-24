import Link from "next/link";
import { CardImage } from "@/components/card-image";
import { Badge } from "@/components/viz";
import { inputCls } from "@/components/ui";
import { appContext } from "@/lib/app";
import { getSets } from "@/lib/sets";
import { createTcgdex, searchCards, type CardBrief } from "@/lib/tcgdex";
import { searchSchema } from "@/lib/validation";

export const metadata = { title: "Buscar cartas" };

const LANG_LABEL = { pt: "Português", en: "Inglês", ja: "Japonês" } as const;

export default async function Buscar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { db } = await appContext();
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k]?.[0] : raw[k]) ?? "";
  const q = searchSchema.parse({ name: one("name"), number: one("number"), setId: one("setId"), page: one("page") });
  const searched = q.name !== "" || q.number !== "" || q.setId !== "";

  const sets = await getSets(db).catch(() => []);
  let results: CardBrief[] = [];
  let failed = false;
  if (searched) {
    try {
      results = await searchCards(createTcgdex(), { name: q.name, number: q.number, setId: q.setId || undefined }, q.page);
    } catch {
      failed = true;
    }
  }
  const nextHref = `/buscar?${new URLSearchParams({ name: q.name, number: q.number, setId: q.setId, page: String(q.page + 1) })}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Buscar cartas</h1>
        <p className="text-sm text-ink-2">Por nome ou por número. A busca olha em português, inglês e japonês e mostra a que existir.</p>
      </div>

      <form method="get" className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-[1fr_9rem_1fr_auto]">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Nome</span>
          <input name="name" defaultValue={q.name} maxLength={60} className={inputCls} placeholder="Pikachu" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Número</span>
          <input name="number" defaultValue={q.number} maxLength={12} className={inputCls} placeholder="025" inputMode="text" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Coleção (opcional)</span>
          <select name="setId" defaultValue={q.setId} className={inputCls}>
            <option value="">Todas</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
          </select>
        </label>
        <button className="self-end rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Buscar</button>
      </form>

      {failed ? (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          Não foi possível falar com a TCGdex agora. Tente de novo em instantes.
        </div>
      ) : searched && results.length === 0 ? (
        <p className="text-sm text-ink-2">Nenhuma carta encontrada. Tente outro nome, ou escolha a coleção e o número.</p>
      ) : null}

      {results.length > 0 ? (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {results.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
                <CardImage base={c.imageBase} alt={c.name} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="truncate text-xs text-ink-3">
                    {c.id} · nº {c.localId}
                  </div>
                  <div className="mt-1">
                    <Badge>{LANG_LABEL[c.lang]}</Badge>
                  </div>
                </div>
                <Link
                  href={`/colecao/novo?${new URLSearchParams({ card: c.id, lang: c.lang })}`}
                  className="mt-auto rounded-lg border border-border px-3 py-2 text-center text-sm font-medium hover:bg-surface-2"
                >
                  Adicionar
                </Link>
              </li>
            ))}
          </ul>
          {results.length >= 10 && !q.setId ? (
            <Link href={nextHref} className="inline-block text-sm text-accent hover:underline">
              Ver mais resultados
            </Link>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
