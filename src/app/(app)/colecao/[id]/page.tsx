import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CardImage } from "@/components/card-image";
import { ItemForm } from "@/components/item-form";
import { ItemValueView } from "@/components/item-value";
import { RemovePanel } from "@/components/remove-panel";
import { appContext } from "@/lib/app";
import { getItem } from "@/lib/collection";
import { ago } from "@/lib/format";
import { centsToInput } from "@/lib/validation";
import { VARIANTS, type Variant } from "@/lib/valuation";

export const metadata = { title: "Editar carta" };

export default async function EditarCarta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { user, db, settings, rates } = await appContext();
  // getItem filtra por user.id: item de outra pessoa = não encontrado
  const v = await getItem(db, user.id, id, settings, rates);
  if (!v || v.item.removedAt) notFound();
  const { card, item } = v;
  const available = VARIANTS.filter((x) => card.variants[x]) as Variant[];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/colecao" className="text-sm text-ink-2 hover:text-ink">
          ← Coleção
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{card.name}</h1>
        <p className="text-sm text-ink-2">
          {card.setName ?? card.setId} · nº {card.localId}
          {card.rarity ? ` · ${card.rarity}` : ""} · preço de {ago(card.fetchedAt)}
        </p>
      </div>
      <div className="flex gap-4 rounded-xl border border-border bg-surface p-4">
        <div className="w-28 shrink-0 sm:w-36">
          <CardImage base={card.imageBase} alt={card.name} quality="high" />
        </div>
        <ItemValueView value={v.value} quantity={item.quantity} />
      </div>
      <div className="rounded-xl border border-border bg-surface p-4">
        <ItemForm
          cancelHref="/colecao"
          variants={available}
          initial={{
            id: item.id,
            cardId: item.cardId,
            variant: item.variant as Variant,
            condition: item.condition,
            ownedLanguage: item.ownedLanguage,
            quantity: String(item.quantity),
            paid: centsToInput(item.paidCents),
            manual: centsToInput(item.manualCents),
            note: item.note ?? "",
          }}
        />
      </div>
      <RemovePanel id={item.id} />
    </div>
  );
}
