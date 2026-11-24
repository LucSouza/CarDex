import Link from "next/link";
import { CardImage } from "@/components/card-image";
import { ItemValueView } from "@/components/item-value";
import { inputCls } from "@/components/ui";
import { Badge, StatCard } from "@/components/viz";
import { appContext } from "@/lib/app";
import { listItems, summarize } from "@/lib/collection";
import { ago, fmtBRL } from "@/lib/format";
import { CONDITIONS, CONDITION_LABEL, LANGUAGE_LABEL, VARIANT_LABEL, type Condition, type Language, type Variant } from "@/lib/valuation";

export const metadata = { title: "Coleção" };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default async function Colecao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, db, settings, rates } = await appContext();
  const raw = await searchParams;
  const one = (k: string) => String((Array.isArray(raw[k]) ? raw[k]?.[0] : raw[k]) ?? "").slice(0, 60);
  const f = { q: one("q"), set: one("set"), rarity: one("rarity"), cond: one("cond") };

  const all = await listItems(db, user.id, settings, rates);
  const sets = [...new Map(all.map((v) => [v.card.setId, v.card.setName ?? v.card.setId])).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const rarities = [...new Set(all.map((v) => v.card.rarity).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const views = all.filter(
    (v) =>
      (!f.q || norm(v.card.name).includes(norm(f.q))) &&
      (!f.set || v.card.setId === f.set) &&
      (!f.rarity || v.card.rarity === f.rarity) &&
      (!f.cond || v.item.condition === f.cond),
  );
  const sum = summarize(views);
  const filtered = views.length !== all.length;
  const now = new Date();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Coleção</h1>
          <p className="text-sm text-ink-2">
            {rates ? `Câmbio de ${ago(rates.fetchedAt, now)}${rates.stale ? " (desatualizado)" : ""}.` : "Câmbio indisponível."} Valor é estimativa.
          </p>
        </div>
        <Link href="/buscar" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          + Adicionar carta
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label={filtered ? "Valor (filtrado)" : "Valor estimado"} value={fmtBRL(sum.totalCents)} hint={sum.withoutPrice > 0 ? `${sum.withoutPrice} sem preço, fora do total` : undefined} />
        <StatCard label="Cartas" value={sum.cards} hint={`${sum.lines} linhas`} />
      </div>

      <form method="get" className="grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <input name="q" defaultValue={f.q} placeholder="Nome da carta" aria-label="Nome" className={inputCls} />
        <select name="set" defaultValue={f.set} aria-label="Coleção" className={inputCls}>
          <option value="">Todas as coleções</option>
          {sets.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select name="rarity" defaultValue={f.rarity} aria-label="Raridade" className={inputCls}>
          <option value="">Todas as raridades</option>
          {rarities.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select name="cond" defaultValue={f.cond} aria-label="Estado" className={inputCls}>
          <option value="">Todos os estados</option>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABEL[c]}
            </option>
          ))}
        </select>
        <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2">Filtrar</button>
      </form>

      {views.length === 0 ? (
        <p className="text-sm text-ink-2">{all.length === 0 ? "Sua coleção está vazia." : "Nenhuma carta com esses filtros."}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {views.map((v) => (
            <li key={v.item.id} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
              <div className="w-20 shrink-0">
                <CardImage base={v.card.imageBase} alt={v.card.name} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="min-w-0">
                  <Link href={`/colecao/${v.item.id}`} className="block truncate font-semibold hover:underline">
                    {v.card.name}
                  </Link>
                  <div className="truncate text-xs text-ink-3">
                    {v.card.setName ?? v.card.setId} · nº {v.card.localId}
                    {v.card.rarity ? ` · ${v.card.rarity}` : ""}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge>{VARIANT_LABEL[v.item.variant as Variant]}</Badge>
                    <Badge>{v.item.condition as Condition}</Badge>
                    <Badge>{LANGUAGE_LABEL[v.item.ownedLanguage as Language]}</Badge>
                    {v.item.quantity > 1 ? <Badge tone="accent">x{v.item.quantity}</Badge> : null}
                  </div>
                </div>
                <ItemValueView value={v.value} quantity={v.item.quantity} />
                <Link href={`/colecao/${v.item.id}`} className="mt-auto text-sm text-accent hover:underline">
                  Editar ou remover
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
