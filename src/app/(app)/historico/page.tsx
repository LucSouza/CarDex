import { ActionForm } from "@/components/action-form";
import { CardImage } from "@/components/card-image";
import { Badge } from "@/components/viz";
import { appContext } from "@/lib/app";
import { listRemoved } from "@/lib/collection";
import { fmtBRL, fmtDay } from "@/lib/format";
import { VARIANT_LABEL, type Variant } from "@/lib/valuation";
import { purgeItemAction, restoreItemAction } from "../actions";

export const metadata = { title: "Histórico" };

const REASON = { SOLD: "Vendida", TRADED: "Trocada", OTHER: "Removida" } as const;

export default async function Historico() {
  const { user, db, settings, rates } = await appContext();
  const views = await listRemoved(db, user.id, settings, rates);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Histórico</h1>
        <p className="text-sm text-ink-2">Cartas vendidas, trocadas ou removidas. Elas não entram no total da coleção.</p>
      </div>
      {views.length === 0 ? (
        <p className="text-sm text-ink-2">Nada por aqui ainda.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {views.map((v) => (
            <li key={v.item.id} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
              <div className="w-16 shrink-0">
                <CardImage base={v.card.imageBase} alt={v.card.name} />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <div className="truncate font-semibold">{v.card.name}</div>
                  <div className="truncate text-xs text-ink-3">
                    {v.card.setName ?? v.card.setId} · nº {v.card.localId} · {VARIANT_LABEL[v.item.variant as Variant]} · {v.item.condition} · x{v.item.quantity}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={v.item.removedReason === "SOLD" ? "ok" : "neutral"}>{REASON[v.item.removedReason ?? "OTHER"]}</Badge>
                  {v.item.removedAt ? <span className="text-xs text-ink-3">{fmtDay(v.item.removedAt)}</span> : null}
                  {v.item.soldCents !== null ? <span className="tabular font-medium">por {fmtBRL(v.item.soldCents)}</span> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionForm action={restoreItemAction} fields={{ id: v.item.id }}>
                    Voltar para a coleção
                  </ActionForm>
                  <ActionForm
                    action={purgeItemAction}
                    fields={{ id: v.item.id }}
                    confirm="Apagar de vez? Isso não pode ser desfeito."
                    className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10"
                  >
                    Apagar de vez
                  </ActionForm>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
