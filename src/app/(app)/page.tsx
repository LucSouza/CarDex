import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { CardImage } from "@/components/card-image";
import { ItemValueView } from "@/components/item-value";
import { Card, StatCard } from "@/components/viz";
import { appContext } from "@/lib/app";
import { listItems, summarize } from "@/lib/collection";
import { ago, fmtBRL } from "@/lib/format";
import { VARIANT_LABEL, type Variant } from "@/lib/valuation";
import { refreshAction } from "./actions";

export const metadata = { title: "Resumo" };

export default async function Home() {
  const { user, db, settings, rates } = await appContext();
  const views = await listItems(db, user.id, settings, rates);
  const sum = summarize(views);
  const now = new Date();
  const oldest = views.reduce<Date | null>((m, v) => (m === null || v.card.fetchedAt < m ? v.card.fetchedAt : m), null);
  const top = [...views].filter((v) => v.value.totalCents !== null).sort((a, b) => (b.value.totalCents ?? 0) - (a.value.totalCents ?? 0)).slice(0, 5);
  const profit = sum.paidCents > 0 ? sum.valueOfPaidCents - sum.paidCents : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sua coleção</h1>
          <p className="text-sm text-ink-2">Valores estimados em reais. São estimativas, não o preço de venda.</p>
        </div>
        <ActionForm action={refreshAction}>Atualizar agora</ActionForm>
      </div>

      {!rates ? (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          Câmbio indisponível no momento: não dá para calcular valores estimados. Valores manuais continuam valendo.
        </div>
      ) : rates.stale ? (
        <div role="status" className="rounded-lg border border-gold/50 bg-gold/10 px-3 py-2 text-sm text-gold">
          Câmbio desatualizado (a fonte falhou): usando o último valor, de {ago(rates.fetchedAt, now)}.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Valor estimado" value={fmtBRL(sum.totalCents)} hint={sum.withoutPrice > 0 ? `não inclui ${sum.withoutPrice} sem preço` : "todas as linhas têm preço"} />
        <StatCard label="Cartas" value={sum.cards} hint={`${sum.lines} linhas na coleção`} />
        <StatCard
          label="Lucro / prejuízo"
          value={profit === null ? "—" : fmtBRL(profit)}
          tone={profit === null ? "default" : profit >= 0 ? "ok" : "danger"}
          hint={profit === null ? "informe o valor pago nas cartas" : "valor atual menos o que você pagou"}
        />
        <StatCard
          label="Dólar"
          value={rates ? `R$ ${(rates.usdMicro / 1_000_000).toFixed(4).replace(".", ",")}` : "—"}
          hint={rates ? `câmbio de ${ago(rates.fetchedAt, now)}` : "indisponível"}
        />
      </div>
      {oldest ? <p className="text-xs text-ink-3">Preços mais antigos da sua coleção: {ago(oldest, now)}. Eles se atualizam sozinhos uma vez por dia.</p> : null}

      {views.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-2">
            Sua coleção está vazia.{" "}
            <Link href="/buscar" className="text-accent underline">
              Busque uma carta
            </Link>{" "}
            para começar.
          </p>
        </Card>
      ) : (
        <Card title="Mais valiosas" right={<Link href="/colecao" className="text-xs text-accent hover:underline">ver tudo</Link>}>
          <ul className="divide-y divide-border">
            {top.map((v) => (
              <li key={v.item.id} className="flex items-center gap-3 py-2">
                <div className="w-12 shrink-0">
                  <CardImage base={v.card.imageBase} alt={v.card.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/colecao/${v.item.id}`} className="block truncate font-medium hover:underline">
                    {v.card.name}
                  </Link>
                  <div className="truncate text-xs text-ink-3">
                    {v.card.setName ?? v.card.setId} · {v.card.localId} · {VARIANT_LABEL[v.item.variant as Variant]} · {v.item.condition}
                  </div>
                </div>
                <ItemValueView value={v.value} quantity={v.item.quantity} />
              </li>
            ))}
            {top.length === 0 ? <li className="py-2 text-sm text-ink-2">Nenhuma carta com preço ainda.</li> : null}
          </ul>
        </Card>
      )}
    </div>
  );
}
