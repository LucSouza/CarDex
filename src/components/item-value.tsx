import { Badge } from "@/components/viz";
import type { ItemValue } from "@/lib/collection";
import { fmtBRL, fmtMinor } from "@/lib/format";

/** Valor de uma linha: mostra de onde veio (manual, estimado + fonte ou sem preço). Nunca um R$ 0,00 silencioso. */
export function ItemValueView({ value, quantity }: { value: ItemValue; quantity: number }) {
  if (value.unitCents === null) {
    return (
      <div>
        <Badge tone="warn">sem preço</Badge>
        <div className="mt-1 text-xs text-ink-3">Defina um valor manual para entrar no total.</div>
      </div>
    );
  }
  return (
    <div>
      <div className="tabular text-base font-bold">{fmtBRL(value.totalCents ?? 0)}</div>
      {quantity > 1 ? <div className="tabular text-xs text-ink-2">{quantity} x {fmtBRL(value.unitCents)}</div> : null}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {value.source === "manual" ? (
          <Badge tone="accent">manual</Badge>
        ) : value.base ? (
          <Badge>
            {value.base.source === "tcgplayer" ? "TCGplayer" : "Cardmarket"} {fmtMinor(value.base.minor, value.base.currency)}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
